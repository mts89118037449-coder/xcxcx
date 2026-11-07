package com.zagruzchik.app

import org.json.JSONObject

/**
 * Трансфер: по треку из одного сервиса находит этот же трек в других.
 * Где у сервиса есть открытый поиск — даём прямую ссылку на трек,
 * где нет (Spotify, VK) — ссылку на поиск внутри сервиса.
 */
object Transfer {

    class Link(val service: Service, val url: String, val exact: Boolean)

    /** Порядок сервисов в списке. */
    val ORDER = listOf(
        Service.YANDEX, Service.SPOTIFY, Service.APPLE, Service.YOUTUBE_MUSIC,
        Service.VK, Service.ZVUK, Service.YOUTUBE, Service.DEEZER, Service.SOUNDCLOUD, Service.ZAYCEV,
    )

    /**
     * Находит ссылку в одном сервисе. Никогда не падает: при любой ошибке возвращает ссылку на поиск.
     * [youtubeId] — поиск видео на YouTube (в приложении через yt-dlp); null — не искать.
     */
    fun find(service: Service, t: Track, youtubeId: ((String) -> String?)?): Link {
        val exact = runCatching {
            when (service) {
                Service.DEEZER -> deezer(t)
                Service.APPLE -> apple(t)
                Service.YANDEX -> yandex(t)
                Service.YOUTUBE_MUSIC -> youtubeId?.invoke(t.query)?.let { "https://music.youtube.com/watch?v=$it" }
                Service.YOUTUBE -> youtubeId?.invoke(t.query)?.let { "https://www.youtube.com/watch?v=$it" }
                Service.SPOTIFY, Service.VK, Service.SOUNDCLOUD, Service.ZVUK, Service.ZAYCEV -> null
            }
        }.getOrNull()
        return if (exact != null) Link(service, exact, true) else Link(service, service.searchUrl(t.query), false)
    }

    /** Дополняет трек длительностью, ISRC и обложкой — это помогает точнее искать в других сервисах. */
    fun enrich(t: Track): Track {
        if (t.durationSec > 0 && t.cover != null) return t
        val d = runCatching { deezerMatch(t) }.getOrNull()
        val a = if (d == null) runCatching { appleMatch(t) }.getOrNull() else null
        val m = d ?: a ?: return t
        return t.copy(
            durationSec = if (t.durationSec > 0) t.durationSec else m.durationSec,
            isrc = t.isrc ?: m.isrc,
            cover = t.cover ?: m.cover,
        )
    }

    // ---------- Deezer ----------

    private fun deezerMatch(t: Track): Track? {
        t.isrc?.let { isrc ->
            val o = Http.json("https://api.deezer.com/track/isrc:$isrc")
            if (o.optJSONObject("error") == null && o.has("id")) return DeezerSource.track(o)
        }
        val data = Http.json("https://api.deezer.com/search?limit=15&q=" + Http.enc(t.query)).optJSONArray("data") ?: return null
        val items = (0 until data.length()).map { data.getJSONObject(it) }
        val best = Match.best(t, items) { Triple(it.optString("title"), it.optJSONObject("artist")?.optString("name").orEmpty(), it.optInt("duration")) }
        return best?.let(DeezerSource::track)
    }

    private fun deezer(t: Track): String? {
        t.isrc?.let { isrc ->
            val o = Http.json("https://api.deezer.com/track/isrc:$isrc")
            if (o.optJSONObject("error") == null) o.optString("link").takeIf { it.isNotEmpty() }?.let { return it }
        }
        val data = Http.json("https://api.deezer.com/search?limit=15&q=" + Http.enc(t.query)).optJSONArray("data") ?: return null
        val items = (0 until data.length()).map { data.getJSONObject(it) }
        return Match.best(t, items) { Triple(it.optString("title"), it.optJSONObject("artist")?.optString("name").orEmpty(), it.optInt("duration")) }
            ?.optString("link")
    }

    // ---------- Apple Music ----------

    private fun appleSearch(t: Track): JSONObject? {
        val r = Http.json("https://itunes.apple.com/search?entity=song&limit=15&country=us&term=" + Http.enc(t.query)).getJSONArray("results")
        val items = (0 until r.length()).map { r.getJSONObject(it) }
        return Match.best(t, items) { Triple(it.optString("trackName"), it.optString("artistName"), it.optInt("trackTimeMillis") / 1000) }
    }

    private fun appleMatch(t: Track) = appleSearch(t)?.let(AppleSource::track)

    private fun apple(t: Track) = appleSearch(t)?.optString("trackViewUrl")?.substringBefore("&uo=")?.takeIf { it.isNotEmpty() }

    // ---------- Яндекс Музыка ----------

    private fun yandex(t: Track): String? {
        val o = Http.json("https://api.music.yandex.net/search?type=track&page=0&text=" + Http.enc(t.query))
        val r = o.optJSONObject("result")?.optJSONObject("tracks")?.optJSONArray("results") ?: return null
        val items = (0 until r.length()).map { r.getJSONObject(it) }
        val best = Match.best(t, items) { val y = YandexSource.track(it); Triple(y.title, y.artist, y.durationSec) } ?: return null
        return YandexSource.link(best)
    }

    /**
     * Сообщение для мессенджера: «🎵 Исполнитель — Название» и ссылки по сервисам.
     * Сначала точные ссылки, потом поиск. Укладываемся в 1000 символов — лимит подписи к картинке в Telegram.
     */
    fun shareText(t: Track, links: List<Link>): String {
        val head = "🎵 ${t.label}\n"
        val sorted = links.filter { it.exact } + links.filter { !it.exact }
        val sb = StringBuilder(head)
        for (l in sorted) {
            val line = "\n${l.service.title}: ${pretty(l.url)}"
            if (sb.length + line.length > 1000) break
            sb.append(line)
        }
        return sb.toString()
    }

    /** Делает ссылку читаемой: «%D0%9A%D0%B8%D0%BD%D0%BE» → «Кино». Мессенджеры такие ссылки тоже распознают. */
    fun pretty(url: String): String = Regex("""(%[89A-Fa-f][0-9A-Fa-f])+""").replace(url) { m ->
        // Только байты ≥ 0x80 (русские буквы и т.п.); пробелы (%20) и спецсимволы остаются закодированными.
        val bytes = m.value.chunked(3).map { it.substring(1).toInt(16).toByte() }.toByteArray()
        runCatching { String(bytes, Charsets.UTF_8).takeIf { !it.contains('\uFFFD') } }.getOrNull() ?: m.value
    }
}
