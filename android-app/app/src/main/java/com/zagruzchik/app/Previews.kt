package com.zagruzchik.app

/**
 * Официальные 30-секундные фрагменты Deezer. Ссылка на фрагмент живёт ~15 минут (в ней срок — exp=…),
 * поэтому сохранённая (чарт, любимое, новинки) часто уже не открывается — берём свежую.
 */
object Previews {
    private val EXP = Regex("""exp=(\d+)""")

    /** Ссылка ещё живёт хотя бы минуту (или срока в ней нет — не Deezer). */
    fun fresh(url: String): Boolean {
        val exp = EXP.find(url)?.groupValues?.get(1)?.toLongOrNull() ?: return true
        return exp * 1000 - System.currentTimeMillis() > 60_000
    }

    /** Свежая ссылка на фрагмент: по ISRC (точно та же запись) или поиском по исполнителю и названию. */
    fun refresh(t: Track): String? {
        t.isrc?.let { isrc ->
            runCatching {
                val body = Http.get("https://api.deezer.com/track/isrc:$isrc", timeoutMs = 4000)
                org.json.JSONObject(body).optString("preview").takeIf { p -> p.startsWith("http") }
            }.getOrNull()?.let { return it }
        }
        val data = Http.json("https://api.deezer.com/search?limit=6&q=" + Http.enc("${t.artist} ${t.title}")).optJSONArray("data") ?: return null
        val found = (0 until data.length()).map { DeezerSource.track(data.getJSONObject(it)) }
        return Match.best(t, found) { Triple(it.title, it.artist, it.durationSec) }?.preview
    }
}
