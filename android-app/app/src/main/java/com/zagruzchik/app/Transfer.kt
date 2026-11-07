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
        Service.VK, Service.YOUTUBE, Service.DEEZER, Service.SOUNDCLOUD,
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
                Service.SPOTIFY, Service.VK, Service.SOUNDCLOUD -> null
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

    /** Текст «Исполнитель — Название» и ссылки по сервисам — чтобы переслать другу. */
    fun shareText(t: Track, links: List<Link>) = buildString {
        appendLine(t.label)
        appendLine()
        links.forEach { appendLine("${it.service.title}: ${it.url}") }
    }.trim()
}
