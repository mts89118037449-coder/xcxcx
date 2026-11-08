package com.zagruzchik.app

import android.content.Context

/** Настройки приложения (вкладка «Настройки»). */
object Settings {
    enum class Quality(val label: String, val hint: String) {
        MP3("MP3", "Открывается везде. Лучшее качество MP3 (VBR ~245 кбит/с)"),
        ORIGINAL("Оригинал", "Без перекодирования: M4A/Opus как в источнике — чуть лучше звук"),
    }

    enum class SourceOrder(val label: String, val hint: String) {
        AUTO("Сначала YouTube Music", "Альбомные версии без цензуры, потом SoundCloud, потом YouTube"),
        SOUNDCLOUD("Сначала SoundCloud", "Потом YouTube Music и YouTube"),
    }

    enum class Theme(val label: String, val mode: Int) {
        DARK("Тёмная", androidx.appcompat.app.AppCompatDelegate.MODE_NIGHT_YES),
        LIGHT("Светлая", androidx.appcompat.app.AppCompatDelegate.MODE_NIGHT_NO),
        SYSTEM("Как в системе", androidx.appcompat.app.AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM),
    }

    private fun prefs(ctx: Context) = ctx.getSharedPreferences("app", Context.MODE_PRIVATE)

    /** Тема по умолчанию — тёмная. */
    fun theme(ctx: Context) = runCatching { Theme.valueOf(prefs(ctx).getString("theme", null)!!) }.getOrDefault(Theme.DARK)

    fun setTheme(ctx: Context, t: Theme) {
        prefs(ctx).edit().putString("theme", t.name).apply()
        androidx.appcompat.app.AppCompatDelegate.setDefaultNightMode(t.mode) // экраны перерисуются сами
    }

    /** Скачивать песню на телефон, когда ставишь ♥. */
    fun saveLiked(ctx: Context) = prefs(ctx).getBoolean("saveLiked", true)
    fun setSaveLiked(ctx: Context, on: Boolean) = prefs(ctx).edit().putBoolean("saveLiked", on).apply()

    /** Сколько места под память прослушанного (МБ). 0 — не запоминать. */
    val CACHE_OPTIONS = listOf(0, 500, 1024, 2048, 5120)
    fun cacheLimitMb(ctx: Context) = prefs(ctx).getInt("cacheMb", 2048)
    fun setCacheLimitMb(ctx: Context, mb: Int) = prefs(ctx).edit().putInt("cacheMb", mb).apply()

    fun quality(ctx: Context) = runCatching { Quality.valueOf(prefs(ctx).getString("quality", null)!!) }.getOrDefault(Quality.MP3)
    fun setQuality(ctx: Context, q: Quality) = prefs(ctx).edit().putString("quality", q.name).apply()

    fun sourceOrder(ctx: Context) = runCatching { SourceOrder.valueOf(prefs(ctx).getString("source", null)!!) }.getOrDefault(SourceOrder.AUTO)
    fun setSourceOrder(ctx: Context, s: SourceOrder) = prefs(ctx).edit().putString("source", s.name).apply()

    /** Мой музыкальный сервис: его ссылка показывается первой, кнопка «Открыть в …». null — выбрать автоматически. */
    fun myService(ctx: Context) = prefs(ctx).getString("myService", null)?.let { runCatching { Service.valueOf(it) }.getOrNull() }
    fun setMyService(ctx: Context, s: Service?) = prefs(ctx).edit().putString("myService", s?.name).apply()
}
