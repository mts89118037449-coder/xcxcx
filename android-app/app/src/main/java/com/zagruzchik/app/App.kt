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
        com.google.android.material.color.DynamicColors.applyToActivitiesIfAvailable(this)
        androidx.appcompat.app.AppCompatDelegate.setDefaultNightMode(Settings.theme(this).mode)
        Notifications.createChannels(this)
        Jobs.init(this)
        Library.init(this)
        History.init(this)
        MediaCache.init(this)
        Shortcuts.publish(this)
        // Первый запуск распаковывает Python и ffmpeg — делаем это в фоне.
        thread(name = "ytdl-init") {
            try {
                YoutubeDL.getInstance().init(this)
                FFmpeg.getInstance().init(this)
                updateIfNeeded()
            } catch (t: Throwable) {
                Log.e(TAG, "init failed", t)
                initError = t
            }
            ready.countDown()
        }
    }

    // Сайты постоянно меняются, поэтому раз в неделю обновляем yt-dlp (до первой загрузки, чтобы не мешать ей).
    private fun updateIfNeeded() {
        val prefs = getSharedPreferences("app", MODE_PRIVATE)
        val now = System.currentTimeMillis()
        if (now - prefs.getLong("lastUpdate", 0) < WEEK_MS) return
        try {
            YoutubeDL.getInstance().updateYoutubeDL(this, YoutubeDL.UpdateChannel.STABLE)
            prefs.edit().putLong("lastUpdate", now).apply()
        } catch (e: Exception) {
            Log.w(TAG, "yt-dlp update failed", e)
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
            initError?.let { throw IllegalStateException("Не удалось запустить загрузчик: ${it.message}", it) }
        }
    }
}
