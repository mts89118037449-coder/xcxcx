package com.zagruzchik.app

import android.content.Context
import android.content.res.ColorStateList
import android.graphics.Color
import android.net.Uri
import android.widget.TextView
import com.google.android.material.button.MaterialButtonToggleGroup

fun Context.dp(v: Int) = (v * resources.displayMetrics.density).toInt()

/** Кружок с буквой и фирменным цветом сервиса (вместо логотипов). */
class Badge(val text: String, val color: Int, val textColor: Int = Color.WHITE)

fun TextView.showBadge(b: Badge) {
    text = b.text
    setTextColor(b.textColor)
    backgroundTintList = ColorStateList.valueOf(b.color)
}

val Service.badge: Badge
    get() = when (this) {
        Service.SPOTIFY -> Badge("S", Color.parseColor("#1DB954"))
        Service.YANDEX -> Badge("Я", Color.parseColor("#FFCC00"), Color.BLACK)
        Service.APPLE -> Badge("A", Color.parseColor("#FA243C"))
        Service.YOUTUBE_MUSIC -> Badge("♪", Color.parseColor("#FF0033"))
        Service.YOUTUBE -> Badge("▶", Color.parseColor("#FF0033"))
        Service.VK -> Badge("VK", Color.parseColor("#0077FF"))
        Service.DEEZER -> Badge("D", Color.parseColor("#A238FF"))
        Service.SOUNDCLOUD -> Badge("SC", Color.parseColor("#FF5500"))
        Service.ZVUK -> Badge("Зв", Color.WHITE, Color.BLACK)
        Service.ZAYCEV -> Badge("Z", Color.parseColor("#E5482B"))
    }

fun siteBadge(name: String): Badge = when (name) {
    "YouTube" -> Badge("▶", Color.parseColor("#FF0033"))
    "Instagram" -> Badge("IG", Color.parseColor("#E1306C"))
    "TikTok" -> Badge("TT", Color.parseColor("#111111"))
    "X (Twitter)" -> Badge("X", Color.parseColor("#111111"))
    "ВКонтакте" -> Badge("VK", Color.parseColor("#0077FF"))
    "Facebook" -> Badge("f", Color.parseColor("#1877F2"))
    else -> Badge(name.take(1), Color.GRAY)
}

/** Короткое название — для компактных кнопок на карточках. */
val Service.short: String
    get() = when (this) {
        Service.YANDEX -> "Яндекс"
        Service.VK -> "VK"
        Service.APPLE -> "Apple"
        Service.YOUTUBE_MUSIC -> "YT Music"
        Service.ZAYCEV -> "Зайцев"
        else -> title
    }

/** Название сервиса в предложном падеже: «Открыть в Яндекс Музыке». */
val Service.inTitle: String
    get() = when (this) {
        Service.YANDEX -> "Яндекс Музыке"
        Service.VK -> "VK Музыке"
        Service.ZVUK -> "Звуке"
        else -> title
    }

/** Короткое описание ссылки для подсказки под полем: «TikTok · видео», «Spotify · альбом → MP3». */
object Describe {
    private val SITES = listOf(
        "tiktok.com" to "TikTok", "instagram.com" to "Instagram", "x.com" to "X", "twitter.com" to "X",
        "vk.com" to "VK", "vk.ru" to "VK", "vkvideo.ru" to "VK Видео", "youtube.com" to "YouTube", "youtu.be" to "YouTube",
        "rutube.ru" to "Rutube", "dzen.ru" to "Дзен", "snapchat.com" to "Snapchat", "reddit.com" to "Reddit",
        "pinterest." to "Pinterest", "ok.ru" to "Одноклассники", "twitch.tv" to "Twitch", "discordapp.com" to "Discord",
        "discordapp.net" to "Discord", "discord.com" to "Discord", "yandex.ru" to "Яндекс", "facebook.com" to "Facebook",
        "vimeo.com" to "Vimeo", "bandcamp.com" to "Bandcamp",
    )

    /** Название сервиса по ссылке — для фильтра загрузок: «YouTube», «TikTok», «Spotify»… */
    fun site(url: String): String {
        Service.of(url)?.let { return it.title }
        val host = runCatching { Uri.parse(url).host.orEmpty().lowercase().removePrefix("www.").removePrefix("m.") }.getOrDefault("")
        return SITES.firstOrNull { host.endsWith(it.first) || host.contains(it.first) }?.second ?: host.ifEmpty { "Другое" }
    }

    fun of(url: String): String {
        val service = Service.of(url)
        if (service != null && service != Service.YOUTUBE) {
            val kind = when {
                url.contains("/album/") && !url.contains("?i=") && !url.contains("/track/") -> "альбом"
                url.contains("/playlist") -> "плейлист"
                else -> "трек"
            }
            return "${service.title} · $kind" + if (Music.needsSearch(url)) " → MP3" else ""
        }
        return "${site(url)} · видео"
    }
}

/** Переключатель «Видео | 720p | MP3». Для музыкальных сервисов без видео оставляет только MP3. */
object FormatPicker {
    fun setup(group: MaterialButtonToggleGroup, url: String?) {
        val onlyMp3 = url != null && Music.needsSearch(url)
        group.findViewById<android.view.View>(R.id.fmtVideo).isEnabled = !onlyMp3
        group.findViewById<android.view.View>(R.id.fmt720).isEnabled = !onlyMp3
        val f = if (url == null) Format.BEST else Links.defaultFormat(url)
        group.check(idOf(f))
    }

    fun selected(group: MaterialButtonToggleGroup) = when (group.checkedButtonId) {
        R.id.fmt720 -> Format.P720
        R.id.fmtMp3 -> Format.MP3
        else -> Format.BEST
    }

    private fun idOf(f: Format) = when (f) {
        Format.BEST -> R.id.fmtVideo
        Format.P720 -> R.id.fmt720
        Format.MP3 -> R.id.fmtMp3
    }
}
