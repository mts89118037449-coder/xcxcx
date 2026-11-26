package com.zagruzchik.app

import org.json.JSONArray

/**
 * Hearthis.at — открытая музыкальная платформа (API v2 без ключа):
 * один HTTP-запрос возвращает прямую ссылку на MP3-поток, длительность и обложку.
 */
object HearthisSource {
    private const val BASE = "https://api-v2.hearthis.at"

    class Found(val title: String, val artist: String, val durationSec: Int, val url: String, val cover: String?, val views: Long = 0)

    fun search(query: String, limit: Int = 10): List<Found> {
        val raw = Http.get("$BASE/search/?t=${Http.enc(query)}&page=1&count=$limit", timeoutMs = 2500)
        return parseJson(raw, limit)
    }

    internal fun parseJson(raw: String, limit: Int = 10): List<Found> {
        val trimmed = raw.trim()
        if (!trimmed.startsWith("[")) return emptyList()
        val arr = JSONArray(trimmed)
        return (0 until arr.length()).mapNotNull { i ->
            val o = arr.optJSONObject(i) ?: return@mapNotNull null
            val url = o.optString("stream_url").takeIf { it.startsWith("http") } ?: return@mapNotNull null
            val title = o.optString("title").trim()
            if (title.isEmpty()) return@mapNotNull null
            val artist = o.optJSONObject("user")?.optString("username")?.trim().orEmpty()
            val dur = o.optString("duration").toIntOrNull() ?: o.optInt("duration")
            val cover = o.optString("artwork_url").ifBlank { o.optString("thumb") }.takeIf { it.startsWith("http") }
            val views = o.optString("playback_count").toLongOrNull() ?: o.optLong("playback_count")
            Found(title, artist, dur, url, cover, views)
        }.take(limit)
    }
}
