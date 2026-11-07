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

    private fun prefs(ctx: Context) = ctx.getSharedPreferences("app", Context.MODE_PRIVATE)

    fun quality(ctx: Context) = runCatching { Quality.valueOf(prefs(ctx).getString("quality", null)!!) }.getOrDefault(Quality.MP3)
    fun setQuality(ctx: Context, q: Quality) = prefs(ctx).edit().putString("quality", q.name).apply()

    fun sourceOrder(ctx: Context) = runCatching { SourceOrder.valueOf(prefs(ctx).getString("source", null)!!) }.getOrDefault(SourceOrder.AUTO)
    fun setSourceOrder(ctx: Context, s: SourceOrder) = prefs(ctx).edit().putString("source", s.name).apply()

    /** Мой музыкальный сервис: его ссылка показывается первой, кнопка «Открыть в …». null — выбрать автоматически. */
    fun myService(ctx: Context) = prefs(ctx).getString("myService", null)?.let { runCatching { Service.valueOf(it) }.getOrNull() }
    fun setMyService(ctx: Context, s: Service?) = prefs(ctx).edit().putString("myService", s?.name).apply()
}
