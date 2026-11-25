package com.zagruzchik.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.Log
import java.io.File
import java.util.concurrent.Executors

object Notifications {
    const val PROGRESS = "progress"
    const val FOREGROUND_ID = 1

    fun createChannels(ctx: Context) {
        if (android.os.Build.VERSION.SDK_INT < 26) return
        val nm = ctx.getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(PROGRESS, "Фоновая загрузка", NotificationManager.IMPORTANCE_LOW))
        nm.deleteNotificationChannel("result") // старые уведомления «Скачано» больше не используются
    }

    /** Android требует уведомление, пока идёт фоновая работа. Держим его тихим и простым. */
    fun foreground(ctx: Context, active: Int): Notification {
        val open = PendingIntent.getActivity(
            ctx, 0,
            Intent(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE,
        )
        return androidx.core.app.NotificationCompat.Builder(ctx, PROGRESS)
            .setSmallIcon(R.drawable.ic_stat_download)
            .setContentTitle(if (active > 1) "Скачиваю: $active" else "Скачиваю…")
            .setContentText("Ход загрузки — в приложении")
            .setContentIntent(open)
            .setOnlyAlertOnce(true)
            .setOngoing(true)
            .build()
    }
}

/** Скачивает по очереди в фоне. Ход загрузки показывается в приложении (через [Jobs]). */
class DownloadService : Service() {

    /** До трёх ссылок качаются одновременно. */
    private val executor = Executors.newFixedThreadPool(PARALLEL_JOBS)
    private var running = 0
    private val main = Handler(Looper.getMainLooper())
    private val nm by lazy { getSystemService(NotificationManager::class.java) }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        androidx.core.app.ServiceCompat.startForeground(this, Notifications.FOREGROUND_ID, Notifications.foreground(this, activeCount()), ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        val job = intent?.getStringExtra(EXTRA_JOB)?.let { Jobs.get(it) }
        if (job == null) {
            if (running == 0) stopSelf(startId)
            return START_NOT_STICKY
        }
        val token = Jobs.token(job.id)
        running++
        executor.execute { runJob(job.id, job.url, job.format, job.hint, token, startId) }
        return START_NOT_STICKY
    }

    private fun activeCount() = Jobs.all.count { it.active }

    private fun runJob(id: String, url: String, format: Format, hint: String?, token: CancelToken, startId: Int) {
        if (token.cancelled) return finish(id, startId)
        Jobs.update(id, save = true) { status = Status.RUNNING; progress = 0f; detail = "Подключаюсь…"; error = "" }
        var lastUpdate = 0L
        try {
            val published = java.util.Collections.synchronizedList(mutableListOf<SavedFile>())
            val result = Downloader.download(this, url, format, id, token, object : DownloadListener {
                override fun onTitle(title: String) = Jobs.update(id, save = true) { this.title = title }
                override fun onStream(urls: List<String>) = Jobs.update(id) { stream = urls }
                override fun onCover(url: String) = Jobs.update(id, save = true) { if (coverUrl == null) coverUrl = url }
                // Готовый трек альбома сразу в «Загрузки» — его уже можно слушать.
                override fun onFile(file: File, subfolder: String?) {
                    val name = file.name
                    val (uri, mime) = Storage.publish(this@DownloadService, file, subfolder)
                    published += SavedFile(uri.toString(), name, mime)
                    val snapshot = synchronized(published) { published.toList() }
                    Jobs.update(id, save = true) { files = snapshot }
                }
                override fun onProgress(percent: Float, detail: String) {
                    val now = System.currentTimeMillis()
                    if (now - lastUpdate < 250) return // не чаще 4 раз в секунду
                    lastUpdate = now
                    Jobs.update(id) {
                        if (percent > 0) progress = percent
                        if (detail.isNotEmpty()) this.detail = detail
                    }
                }
            }, hint)
            Jobs.update(id) { progress = 100f; detail = "Сохраняю в «Загрузки»…" }
            val saved = synchronized(published) { published.toList() } + result.files.map { f ->
                val name = f.name
                val (uri, mime) = Storage.publish(this, f, result.subfolder)
                SavedFile(uri.toString(), name, mime)
            }
            AppLog.add("ЗАГРУЗКА готова: ${Describe.site(url)} · ${format.label} → " +
                saved.joinToString { "${it.name.substringAfterLast('.')} (${it.mime})" })
            Jobs.update(id, save = true) {
                status = Status.DONE
                files = saved
                stream = emptyList()
                detail = buildString {
                    append(if (saved.size == 1) saved.first().name else "${saved.size} файл(ов)")
                    result.subfolder?.let { append(" · папка «$it»") }
                    if (result.failed > 0) append(" · не нашлось: ${result.failed}")
                }
            }
        } catch (e: CancelledError) {
            Jobs.update(id, save = true) { status = Status.CANCELLED; detail = "" }
        } catch (e: Exception) {
            Log.e("Zagruzchik", "download failed: $url", e)
            val msg = (e as? UserError)?.message ?: e.message ?: "Неизвестная ошибка"
            if (!token.cancelled) AppLog.add("ЗАГРУЗКА ОШИБКА: ${Describe.site(url)} · ${format.label}: $msg")
            Jobs.update(id, save = true) { status = if (token.cancelled) Status.CANCELLED else Status.FAILED; error = msg; detail = "" }
        } finally {
            finish(id, startId)
        }
    }

    private fun finish(id: String, @Suppress("UNUSED_PARAMETER") startId: Int) {
        main.post {
            Jobs.forget(id)
            Jobs.update(id) { stream = emptyList() }
            running--
            if (activeCount() > 0) nm.notify(Notifications.FOREGROUND_ID, Notifications.foreground(this, activeCount()))
            // Загрузки идут параллельно, поэтому останавливаемся, только когда закончились все.
            if (running <= 0) stopSelf()
        }
    }

    override fun onDestroy() {
        executor.shutdownNow()
        super.onDestroy()
    }

    companion object {
        private const val PARALLEL_JOBS = 3
        const val EXTRA_JOB = "job"
        const val EXTRA_URL = "url"

        /** Добавляет загрузку в список и запускает её. */
        fun enqueue(ctx: Context, url: String, format: Format, hint: String? = null): Job {
            val job = Jobs.create(url, format, hint)
            androidx.core.content.ContextCompat.startForegroundService(ctx, Intent(ctx, DownloadService::class.java).putExtra(EXTRA_JOB, job.id))
            return job
        }
    }
}
