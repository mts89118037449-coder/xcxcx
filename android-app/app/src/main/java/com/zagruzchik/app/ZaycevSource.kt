package com.zagruzchik.app

import org.json.JSONArray
import org.json.JSONObject

/**
 * Zaycev.net — открытый бесплатный плеер без входа: MP3 до 320 kbps.
 * Те же запросы, что делает их собственная страница: поиск → отметка трека → ссылка на звук.
 */
object ZaycevSource {
    private const val BASE = "https://zaycev.net"

    /** [explicit] — запись помечена как версия без цензуры. */
    class Found(val id: Long, val title: String, val artist: String, val durationSec: Int, val bitrate: Int, val cover: String?, val explicit: Boolean = false)

    internal fun sanitizeQuery(q: String): String {
        var s = q
            .replace(Regex("""\[[^\]]*]"""), " ")
            .replace(Regex("""\((?:feat\.?|ft\.?|with)\b[^)]*\)""", RegexOption.IGNORE_CASE), " ")
            .replace(Regex("""\b(?:feat\.?|ft\.?)\b.*$""", RegexOption.IGNORE_CASE), " ")
            .replace(',', ' ')
            .replace('&', ' ')
            .replace(Regex("""\s+"""), " ")
            .trim()
        if (s.length > 60) {
            val cut = s.substring(0, 60)
            s = cut.substringBeforeLast(' ', cut).trim().ifBlank { cut.trim() }
        }
        return s
    }

    /** Результаты поиска (только те, что можно слушать), в порядке выдачи. Ответ — около килобайта. */
    fun search(query: String): List<Found> = twice {
        val clean = sanitizeQuery(query).ifBlank { query.take(60).trim() }
        val raw = try {
            Http.get("$BASE/api/external/pages/search/tracks?q=${Http.enc(clean)}&page=1&limit=10", Http.DESKTOP_UA, 8000, headers = mapOf("Referer" to "$BASE/"))
        } catch (e: Exception) {
            val shorter = clean.take(32).substringBeforeLast(' ', clean.take(32)).trim()
            if (shorter.isNotBlank() && shorter.length < clean.length) {
                Http.get("$BASE/api/external/pages/search/tracks?q=${Http.enc(shorter)}&page=1&limit=10", Http.DESKTOP_UA, 8000, headers = mapOf("Referer" to "$BASE/"))
            } else throw e
        }
        return parseSearchJson(raw)
    }

    internal fun parseSearchJson(raw: String): List<Found> {
        val o = JSONObject(raw)
        val ids = o.optJSONArray("trackIds") ?: return emptyList()
        val info = o.optJSONObject("tracksInfo") ?: return emptyList()
        return (0 until ids.length()).mapNotNull { i ->
            val id = ids.optLong(i)
            val t = info.optJSONObject(id.toString()) ?: return@mapNotNull null
            if (!t.optBoolean("playbackEnabled")) return@mapNotNull null
            val dur = t.optString("duration").split(':').mapNotNull { it.toIntOrNull() }.fold(0) { acc, x -> acc * 60 + x }
            Found(id, t.optString("track"), t.optString("artistName"), dur, t.optInt("bitrate"),
                t.optString("imageJpg").takeIf { it.isNotBlank() }?.let { if (it.startsWith("//")) "https:$it" else it }, t.optBoolean("explicit"))
        }
    }

    /** Ссылка на звук (живёт недолго). null — трек не отдаётся. */
    fun streamUrl(id: Long): String? = twice {
        val meta = post("$BASE/api/external/track/filezmeta", JSONObject().put("trackIds", JSONArray().put(id)).put("subscription", false).toString())
        val hash = JSONObject(meta).optJSONArray("tracks")?.optJSONObject(0)?.optString("streaming")?.takeIf { it.isNotBlank() && it != "false" && it != "null" } ?: return null
        return JSONObject(Http.get("$BASE/api/external/track/play/$hash", Http.DESKTOP_UA, 8000, headers = mapOf("Referer" to "$BASE/"))).optString("url").takeIf { it.startsWith("http") }
    }

    /** Сеть флапается (журнал 24.11: «Read timed out» за 3 с, а через 5 с — ответ 320 kbps) — даём вторую попытку. */
    private inline fun <T> twice(block: () -> T): T =
        try { block() } catch (e: java.net.SocketTimeoutException) { block() } catch (e: java.net.SocketException) { block() }

    private fun post(url: String, body: String): String =
        Http.post(url, body, ua = Http.DESKTOP_UA, timeoutMs = 8000, headers = mapOf("Referer" to "$BASE/"))
}
