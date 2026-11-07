package com.zagruzchik.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.Uri
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.Log
import java.util.UUID
import java.util.concurrent.Executors

object Notifications {
    const val PROGRESS = "progress"
    const val RESULT = "result"
    const val FOREGROUND_ID = 1

    fun createChannels(ctx: Context) {
        val nm = ctx.getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(PROGRESS, "Ход загрузки", NotificationManager.IMPORTANCE_LOW))
        nm.createNotificationChannel(NotificationChannel(RESULT, "Готовые файлы", NotificationManager.IMPORTANCE_DEFAULT))
    }

    fun progress(ctx: Context, title: String, text: String, percent: Int): Notification =
        Notification.Builder(ctx, PROGRESS)
            .setSmallIcon(R.drawable.ic_download)
            .setContentTitle(title)
            .setContentText(text)
            .setOnlyAlertOnce(true)
            .setOngoing(true)
            .setProgress(100, percent.coerceIn(0, 100), percent < 0)
            .build()
}

/** Скачивает ссылки по очереди в фоне — можно закрыть приложение и заниматься своими делами. */
class DownloadService : Service() {

    private val executor = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())
    private val nm by lazy { getSystemService(NotificationManager::class.java) }
    @Volatile private var queued = 0

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startForeground(
            Notifications.FOREGROUND_ID,
            Notifications.progress(this, "Загрузчик", "Готовлюсь…", -1),
            ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC,
        )
        val url = intent?.getStringExtra(EXTRA_URL)
        val format = intent?.getStringExtra(EXTRA_FORMAT)?.let { runCatching { Format.valueOf(it) }.getOrNull() }
        if (url == null || format == null) {
            if (queued == 0) stopSelf(startId)
            return START_NOT_STICKY
        }
        queued++
        executor.execute { runJob(url, format, startId) }
        return START_NOT_STICKY
    }

    private fun runJob(url: String, format: Format, startId: Int) {
        val jobId = UUID.randomUUID().toString()
        val resultId = jobId.hashCode()
        var lastUpdate = 0L
        val title = "Скачиваю (${format.label})"
        try {
            nm.notify(Notifications.FOREGROUND_ID, Notifications.progress(this, title, url, -1))
            val files = Downloader.download(this, url, format, jobId) { p, line ->
                val now = System.currentTimeMillis()
                if (now - lastUpdate > 700) {
                    lastUpdate = now
                    val text = if (p > 0) "${p.toInt()}%" else line.take(80)
                    nm.notify(Notifications.FOREGROUND_ID, Notifications.progress(this, title, text, if (p > 0) p.toInt() else -1))
                }
            }
            nm.notify(Notifications.FOREGROUND_ID, Notifications.progress(this, "Сохраняю в «Загрузки»", "", -1))
            val saved = files.map { Storage.publish(this, it) }
            val first = files.first().name
            val text = if (files.size == 1) first else "$first и ещё ${files.size - 1}"
            notifyResult(resultId, "Скачано ✓", text, openFile(saved.first().first, saved.first().second))
        } catch (e: Exception) {
            Log.e("Zagruzchik", "download failed: $url", e)
            val msg = (e as? UserError)?.message ?: e.message ?: "Неизвестная ошибка"
            val retry = Intent(this, MainActivity::class.java).putExtra(EXTRA_URL, url)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            notifyResult(resultId, "Не получилось скачать", msg, retry)
        } finally {
            main.post {
                queued--
                stopSelf(startId)
            }
        }
    }

    private fun openFile(uri: Uri, mime: String) = Intent(Intent.ACTION_VIEW)
        .setDataAndType(uri, mime)
        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)

    private fun notifyResult(id: Int, title: String, text: String, tap: Intent) {
        val pi = PendingIntent.getActivity(this, id, tap, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val n = Notification.Builder(this, Notifications.RESULT)
            .setSmallIcon(R.drawable.ic_download)
            .setContentTitle(title)
            .setContentText(text)
            .setStyle(Notification.BigTextStyle().bigText(text))
            .setContentIntent(pi)
            .setAutoCancel(true)
            .build()
        nm.notify(id, n)
    }

    override fun onDestroy() {
        executor.shutdownNow()
        super.onDestroy()
    }

    companion object {
        const val EXTRA_URL = "url"
        const val EXTRA_FORMAT = "format"

        fun start(ctx: Context, url: String, format: Format) {
            ctx.startForegroundService(
                Intent(ctx, DownloadService::class.java)
                    .putExtra(EXTRA_URL, url)
                    .putExtra(EXTRA_FORMAT, format.name)
            )
        }
    }
}
