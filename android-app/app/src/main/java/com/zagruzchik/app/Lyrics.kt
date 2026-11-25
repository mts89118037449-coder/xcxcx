package com.zagruzchik.app

import org.json.JSONArray

/**
 * Текст песни. Сначала Genius (самые полные тексты, в т.ч. русский рэп), а для караоке —
 * LRCLIB: там у многих песен есть строки с временем, и текст подсвечивается вместе с музыкой.
 */
object Lyrics {
    class Line(val timeMs: Long, val text: String)

    /** [text] — весь текст; [synced] — строки с временем (если нашлись); [source] — откуда. */
    class Result(val text: String, val source: String, val url: String?, val synced: List<Line>)

    private val cache = java.util.concurrent.ConcurrentHashMap<String, Result>()
    private val pool = java.util.concurrent.Executors.newCachedThreadPool()

    fun find(t: Track): Result? {
        val k = Library.key(t)
        cache[k]?.let { return it }
        val genius = pool.submit<Pair<String, String>?> { runCatching { genius(t) }.getOrNull() }
        val lrc = pool.submit<Pair<String?, List<Line>>?> { runCatching { lrclib(t) }.getOrNull() }
        val g = runCatching { genius.get(15, java.util.concurrent.TimeUnit.SECONDS) }.getOrNull()
        val l = runCatching { lrc.get(15, java.util.concurrent.TimeUnit.SECONDS) }.getOrNull()
        val synced = l?.second.orEmpty()
        val r = when {
            g != null -> Result(g.first, "Genius", g.second, synced)
            l?.first != null -> Result(l.first!!, "LRCLIB", null, synced)
            synced.isNotEmpty() -> Result(synced.joinToString("\n") { it.text }, "LRCLIB", null, synced)
            else -> return null
        }
        cache[k] = r
        return r
    }

    // ---------------- Genius ----------------

    private val SKIP_ARTISTS = listOf("genius romanizations", "genius english translations", "genius translations", "genius")

    private fun genius(t: Track): Pair<String, String>? {
        val q = "${t.artist.substringBefore(",").substringBefore(" & ")} ${Match.base(t.title)}"
        val hits = Http.json("https://genius.com/api/search/song?per_page=10&q=" + Http.enc(q))
            .optJSONObject("response")?.optJSONArray("sections")?.optJSONObject(0)?.optJSONArray("hits") ?: return null
        val base = Match.base(t.title)
        val songs = (0 until hits.length()).mapNotNull { hits.optJSONObject(it)?.optJSONObject("result") }
            .filter { r -> Match.norm(r.optJSONObject("primary_artist")?.optString("name").orEmpty()) !in SKIP_ARTISTS }
        val best = songs.firstOrNull { r ->
            val title = Match.base(r.optString("title"))
            (title == base || title.contains(base) || base.contains(title)) && artistMatches(t.artist, r.optString("artist_names"))
        } ?: songs.firstOrNull { Match.base(it.optString("title")) == base } ?: return null
        val url = best.optString("url").takeIf { it.startsWith("https://genius.com/") } ?: return null
        val text = parseGenius(Http.get(url)) ?: return null
        return text to url
    }

    private fun artistMatches(want: String, got: String): Boolean {
        val g = Match.norm(got)
        return want.isBlank() || want.split(Regex("""\s*(,|&| feat\.? | ft\.? )\s*""", RegexOption.IGNORE_CASE))
            .map { Match.norm(it.trim()) }.any { it.isNotEmpty() && g.contains(it) }
    }

    /** Текст со страницы Genius: блоки data-lyrics-container, без служебной шапки. */
    internal fun parseGenius(html: String): String? {
        val parts = mutableListOf<String>()
        var from = 0
        while (true) {
            val i = html.indexOf("data-lyrics-container=\"true\"", from)
            if (i < 0) break
            val start = html.indexOf('>', i) + 1
            val end = closingDiv(html, start)
            if (start <= 0 || end < 0) break
            parts += html.substring(start, end)
            from = end
        }
        if (parts.isEmpty()) return null
        val text = parts.joinToString("\n") { p ->
            var s = removeExcluded(p)
            s = s.replace(Regex("""<br\s*/?>""", RegexOption.IGNORE_CASE), "\n")
            s = s.replace(Regex("""<[^>]+>"""), "")
            decode(s)
        }
        return text.lines().joinToString("\n") { it.trim() }.replace(Regex("""\n{3,}"""), "\n\n").trim().ifEmpty { null }
    }

    /** Индекс закрывающего </div> для блока, начинающегося в [start] (с учётом вложенных div). */
    private fun closingDiv(html: String, start: Int): Int {
        var depth = 1
        var i = start
        val tag = Regex("""<(/?)div\b""", RegexOption.IGNORE_CASE)
        while (true) {
            val m = tag.find(html, i) ?: return -1
            if (m.groupValues[1].isEmpty()) depth++ else depth--
            if (depth == 0) return m.range.first
            i = m.range.last + 1
        }
    }

    /** Убираем вложенные блоки «не для текста» (шапка с числом участников, переводы). */
    private fun removeExcluded(p: String): String {
        var s = p
        while (true) {
            val i = s.indexOf("data-exclude-from-selection=\"true\"")
            if (i < 0) return s
            val open = s.lastIndexOf("<div", i)
            val start = s.indexOf('>', i) + 1
            val end = closingDiv(s, start)
            if (open < 0 || start <= 0 || end < 0) return s
            val closeEnd = s.indexOf('>', end)
            if (closeEnd < 0) return s
            s = s.substring(0, open) + s.substring(closeEnd + 1)
        }
    }

    private fun decode(s: String): String = s
        .replace(Regex("""&#x([0-9a-fA-F]+);""")) { it.groupValues[1].toInt(16).toChar().toString() }
        .replace(Regex("""&#(\d+);""")) { it.groupValues[1].toInt().toChar().toString() }
        .replace("&quot;", "\"").replace("&apos;", "'").replace("&lt;", "<").replace("&gt;", ">")
        .replace("&nbsp;", " ").replace("&amp;", "&")

    // ---------------- LRCLIB ----------------

    private fun lrclib(t: Track): Pair<String?, List<Line>>? {
        val url = "https://lrclib.net/api/search?track_name=" + Http.enc(Match.base(t.title).ifEmpty { t.title }) +
            (if (t.artist.isNotBlank()) "&artist_name=" + Http.enc(t.artist.substringBefore(",").substringBefore(" & ")) else "")
        val arr = JSONArray(Http.get(url))
        val items = (0 until arr.length()).map { arr.getJSONObject(it) }.filter { !it.optBoolean("instrumental") }
        // Ближе по длительности и с синхронным текстом — лучше.
        val best = items.sortedWith(compareBy(
            { if (it.optString("syncedLyrics").isNotBlank()) 0 else 1 },
            { if (t.durationSec > 0) kotlin.math.abs(it.optDouble("duration") - t.durationSec) else 0.0 },
        )).firstOrNull { t.durationSec == 0 || kotlin.math.abs(it.optDouble("duration") - t.durationSec) < 8 } ?: items.firstOrNull() ?: return null
        val plain = best.optString("plainLyrics").takeIf { it.isNotBlank() && it != "null" }
        return plain to parseLrc(best.optString("syncedLyrics"))
    }

    internal fun parseLrc(lrc: String): List<Line> {
        val re = Regex("""\[(\d+):(\d+)(?:[.:](\d+))?]""")
        return lrc.lines().flatMap { line ->
            val times = re.findAll(line).toList()
            if (times.isEmpty()) return@flatMap emptyList()
            val text = line.substring(times.last().range.last + 1).trim()
            times.map { m ->
                val frac = m.groupValues[3]
                val ms = if (frac.isEmpty()) 0 else (frac.padEnd(3, '0').take(3)).toInt()
                Line(m.groupValues[1].toLong() * 60_000 + m.groupValues[2].toLong() * 1000 + ms, text)
            }
        }.sortedBy { it.timeMs }
    }
}
