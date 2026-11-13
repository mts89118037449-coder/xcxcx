package com.zagruzchik.app

import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * Zaycev.net — открытый бесплатный плеер без входа: MP3 до 320 kbps.
 * Те же запросы, что делает их собственная страница: поиск → отметка трека → ссылка на звук.
 */
object ZaycevSource {
    private const val BASE = "https://zaycev.net"

    class Found(val id: Long, val title: String, val artist: String, val durationSec: Int, val bitrate: Int, val cover: String?)

    /** Результаты поиска (только те, что можно слушать), в порядке выдачи. Ответ — около килобайта. */
    fun search(query: String): List<Found> {
        val o = JSONObject(Http.get("$BASE/api/external/pages/search/tracks?q=${Http.enc(query)}&page=1&limit=10", Http.DESKTOP_UA, 6000))
        val ids = o.optJSONArray("trackIds") ?: return emptyList()
        val info = o.optJSONObject("tracksInfo") ?: return emptyList()
        return (0 until ids.length()).mapNotNull { i ->
            val id = ids.optLong(i)
            val t = info.optJSONObject(id.toString()) ?: return@mapNotNull null
            if (!t.optBoolean("playbackEnabled")) return@mapNotNull null
            val dur = t.optString("duration").split(':').mapNotNull { it.toIntOrNull() }.fold(0) { acc, x -> acc * 60 + x }
            Found(id, t.optString("track"), t.optString("artistName"), dur, t.optInt("bitrate"),
                t.optString("imageJpg").takeIf { it.isNotBlank() }?.let { if (it.startsWith("//")) "https:$it" else it })
        }
    }

    /** Ссылка на звук (живёт недолго). null — трек не отдаётся. */
    fun streamUrl(id: Long): String? {
        val meta = post("$BASE/api/external/track/filezmeta", JSONObject().put("trackIds", JSONArray().put(id)).put("subscription", false).toString())
        val hash = JSONObject(meta).optJSONArray("tracks")?.optJSONObject(0)?.optString("streaming")?.takeIf { it.isNotBlank() && it != "false" && it != "null" } ?: return null
        return JSONObject(Http.get("$BASE/api/external/track/play/$hash", Http.DESKTOP_UA, 8000)).optString("url").takeIf { it.startsWith("http") }
    }

    private fun post(url: String, body: String): String {
        val c = URL(url).openConnection() as HttpURLConnection
        c.requestMethod = "POST"; c.doOutput = true
        c.setRequestProperty("User-Agent", Http.DESKTOP_UA)
        c.setRequestProperty("Content-Type", "application/json")
        c.setRequestProperty("Referer", "$BASE/")
        c.connectTimeout = 8000; c.readTimeout = 8000
        try {
            c.outputStream.use { it.write(body.toByteArray()) }
            if (c.responseCode !in 200..299) throw Http.HttpError(c.responseCode, url)
            return c.inputStream.bufferedReader().use { it.readText() }
        } finally { c.disconnect() }
    }
}
