package com.zagruzchik.app

import android.content.Context

/** Настройки приложения (вкладка «Настройки»). */
object Settings {
    enum class Quality(val label: String, val hint: String) {
        ORIGINAL("Оригинал", "Максимальное качество: звук как в источнике (Opus/AAC до 256 кбит/с), без перекодирования"),
        MP3("MP3", "Для старых плееров и машин. Перекодирование в MP3 (VBR ~245 кбит/с) — чуть хуже звук"),
    }

    enum class SourceOrder(val label: String, val hint: String) {
        AUTO("Сначала YouTube Music", "Альбомные версии без цензуры, потом SoundCloud, потом YouTube"),
        SOUNDCLOUD("Сначала SoundCloud", "Потом YouTube Music и YouTube"),
    }

    /** Вид плеера: «Кольцо» — обложка-диск и кольцо прогресса; «Волна» — обложка и звуковая волна. */
    enum class PlayerStyle(val label: String, val hint: String) {
        RING("Кольцо", "Обложка-диск, прогресс — кольцо ауры вокруг неё"),
        WAVE("Волна", "Большая обложка, перемотка — звуковая волна"),
    }

    fun playerStyle(ctx: Context) = runCatching { PlayerStyle.valueOf(prefs(ctx).getString("playerStyle", null)!!) }.getOrDefault(PlayerStyle.RING)
    fun setPlayerStyle(ctx: Context, s: PlayerStyle) = prefs(ctx).edit().putString("playerStyle", s.name).apply()

    /** Переход с фрагмента на полную: бесшовно в конце фрагмента или сразу (с короткой паузой на подгрузку). */
    enum class JoinMode(val label: String, val hint: String) {
        SEAMLESS("Бесшовно", "Фрагмент доигрывает, полная продолжает с того же места без паузы"),
        IMMEDIATE("Сразу", "Как только полная нашлась — переключаемся на неё с того же места (пауза меньше секунды)"),
    }

    fun joinMode(ctx: Context) = runCatching { JoinMode.valueOf(prefs(ctx).getString("joinMode", null)!!) }.getOrDefault(JoinMode.SEAMLESS)
    fun setJoinMode(ctx: Context, m: JoinMode) = prefs(ctx).edit().putString("joinMode", m.name).apply()

    /** Текст песни прямо в плеере (идёт вместе с музыкой). */
    fun lyricsInPlayer(ctx: Context) = prefs(ctx).getBoolean("lyricsInPlayer", true)
    fun setLyricsInPlayer(ctx: Context, on: Boolean) = prefs(ctx).edit().putBoolean("lyricsInPlayer", on).apply()

    /** Как играть медиатеку. */
    enum class PlayMode(val hint: String) {
        ORDER("Подряд, как в списке"),
        RANDOM("Вперемешку"),
        SMART("По вашему вкусу: любимое, часто слушаемое и любимые исполнители — выше, пропускаемое — ниже"),
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

    fun playMode(ctx: Context) = runCatching { PlayMode.valueOf(prefs(ctx).getString("playMode", null)!!) }.getOrDefault(PlayMode.SMART)
    fun setPlayMode(ctx: Context, m: PlayMode) = prefs(ctx).edit().putString("playMode", m.name).apply()

    /** Когда очередь закончилась — продолжать похожей музыкой. */
    fun radio(ctx: Context) = prefs(ctx).getBoolean("radio", true)
    fun setRadio(ctx: Context, on: Boolean) = prefs(ctx).edit().putBoolean("radio", on).apply()

    /** Скачивать песню на телефон, когда ставишь ♥. */
    fun saveLiked(ctx: Context) = prefs(ctx).getBoolean("saveLiked", true)
    fun setSaveLiked(ctx: Context, on: Boolean) = prefs(ctx).edit().putBoolean("saveLiked", on).apply()

    /** Сколько места под память прослушанного (МБ). 0 — не запоминать. */
    val CACHE_OPTIONS = listOf(0, 500, 1024, 2048, 5120)
    fun cacheLimitMb(ctx: Context) = prefs(ctx).getInt("cacheMb", 2048)
    fun setCacheLimitMb(ctx: Context, mb: Int) = prefs(ctx).edit().putInt("cacheMb", mb).apply()

    fun quality(ctx: Context) = runCatching { Quality.valueOf(prefs(ctx).getString("quality", null)!!) }.getOrDefault(Quality.ORIGINAL)
    fun setQuality(ctx: Context, q: Quality) = prefs(ctx).edit().putString("quality", q.name).apply()

    fun sourceOrder(ctx: Context) = runCatching { SourceOrder.valueOf(prefs(ctx).getString("source", null)!!) }.getOrDefault(SourceOrder.AUTO)
    fun setSourceOrder(ctx: Context, s: SourceOrder) = prefs(ctx).edit().putString("source", s.name).apply()

    /** Мой музыкальный сервис: его ссылка показывается первой, кнопка «Открыть в …». null — выбрать автоматически. */
    fun myService(ctx: Context) = prefs(ctx).getString("myService", null)?.let { runCatching { Service.valueOf(it) }.getOrNull() }
    fun setMyService(ctx: Context, s: Service?) = prefs(ctx).edit().putString("myService", s?.name).apply()
}
