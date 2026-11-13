package com.zagruzchik.app

import android.app.Application
import android.util.Log
import com.yausername.ffmpeg.FFmpeg
import com.yausername.youtubedl_android.YoutubeDL
import java.util.concurrent.CountDownLatch
import kotlin.concurrent.thread

class App : Application() {

    override fun onCreate() {
        super.onCreate()
        instance = this
        // Material You: на Android 12+ цвета приложения подстраиваются под обои.
        // Свои фирменные цвета SoundAura (фиолетово-розовая аура), а не цвета обоев.
        androidx.appcompat.app.AppCompatDelegate.setDefaultNightMode(Settings.theme(this).mode)
        Notifications.createChannels(this)
        Jobs.init(this)
        Library.init(this)
        History.init(this)
        Taste.init(this)
        News.init(this)
        News.checkOnLaunch() // новинки любимых исполнителей — проверяем при каждом запуске
        MediaCache.init(this)
        runCatching { Telegram.start(this) } // если аккаунт Telegram уже подключён — поднимаем его сразу
        Shortcuts.publish(this)
        // Первый запуск распаковывает Python и ffmpeg — делаем это в фоне.
        thread(name = "ytdl-init") {
            try {
                YoutubeDL.getInstance().init(this)
                FFmpeg.getInstance().init(this)
            } catch (t: Throwable) {
                Log.e(TAG, "init failed", t)
                initError = t
            }
            // Движок доступен сразу; обновление — потом и отдельно (раньше всё ждало его и могло зависнуть).
            ready.countDown()
            if (initError == null) {
                YtdlpDaemon.warmUp() // постоянный yt-dlp — первый поиск уже без ожидания старта Python
                Warm.start(this) // в фоне узнаём источники любимых песен — потом включаются сразу
                updateIfNeeded()
            }
        }
    }

    // Сайты постоянно меняются, поэтому раз в неделю обновляем yt-dlp (до первой загрузки, чтобы не мешать ей).
    private fun updateIfNeeded() {
        val prefs = getSharedPreferences("app", MODE_PRIVATE)
        val now = System.currentTimeMillis()
        if (now - prefs.getLong("lastUpdate", 0) < WEEK_MS) return
        // Библиотека ходит на GitHub без таймаута — сначала коротко проверяем, что он отвечает.
        val reachable = runCatching {
            (java.net.URL("https://api.github.com/").openConnection() as java.net.HttpURLConnection).run {
                connectTimeout = 5000; readTimeout = 5000
                responseCode.also { disconnect() } in 200..499
            }
        }.getOrDefault(false)
        if (!reachable) return
        // На время замены движка поиски/загрузки ждут (но не дольше пары минут).
        Ytdlp.exclusive(120) {
            try {
                YoutubeDL.getInstance().updateYoutubeDL(this, YoutubeDL.UpdateChannel.STABLE)
                prefs.edit().putLong("lastUpdate", now).apply()
                YtdlpDaemon.restart() // новая версия — со следующего запроса
            } catch (e: Exception) {
                Log.w(TAG, "yt-dlp update failed", e)
            }
        }
    }

    companion object {
        lateinit var instance: App
            private set

        private const val TAG = "Zagruzchik"
        private const val WEEK_MS = 7L * 24 * 3600 * 1000
        private val ready = CountDownLatch(1)
        @Volatile private var initError: Throwable? = null

        /** То же, но без ошибки: null, если движок не запустился. */
        fun awaitReadyOrNull(): Unit? = runCatching { awaitReady() }.getOrNull()

        fun awaitReady() {
            ready.await()
            initError?.let { throw IllegalStateException("Не удалось запустить движок: ${it.message}", it) }
        }
    }
}
