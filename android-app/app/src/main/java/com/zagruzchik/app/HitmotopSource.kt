package com.zagruzchik.app

import org.json.JSONObject

/**
 * Hitmotop (rus.hitmotop.com) — открытый MP3-каталог без входа и без Python:
 * один быстрый HTTP-запрос сразу даёт прямую ссылку на MP3, длительность и обложку.
 */
object HitmotopSource {
    private const val BASE = "https://rus.hitmotop.com"
    private val ITEM_RE = Regex("""data-musmeta='(\{[^']+\})'([\s\S]{0,1500}?)<div class="track__fulltime">([^<]+)</div>""")

    class Found(val title: String, val artist: String, val durationSec: Int, val url: String, val cover: String?)

    fun search(query: String, limit: Int = 15): List<Found> {
        val html = Http.get("$BASE/search?q=${Http.enc(query)}", Http.DESKTOP_UA, 7000)
        return ITEM_RE.findAll(html).mapNotNull { m ->
            val o = runCatching { JSONObject(m.groupValues[1]) }.getOrNull() ?: return@mapNotNull null
            val url = o.optString("url").takeIf { it.startsWith("http") } ?: return@mapNotNull null
            val title = o.optString("title").trim()
            val artist = o.optString("artist").trim()
            if (title.isEmpty() || artist.isEmpty()) return@mapNotNull null
            val dur = m.groupValues[3].trim().split(':').mapNotNull { it.toIntOrNull() }.fold(0) { acc, x -> acc * 60 + x }
            val cover = o.optString("img").takeIf { it.startsWith("http") }
            Found(title, artist, dur, url, cover)
        }.take(limit).toList()
    }
}
