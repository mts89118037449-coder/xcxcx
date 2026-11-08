package com.zagruzchik.app

import android.content.Context
import org.json.JSONObject
import java.io.File
import kotlin.math.ln

/**
 * Предпочтения: что слушают до конца и часто, что пролистывают, каких исполнителей любят.
 * Отсюда «умная» сортировка медиатеки и порядок песен в радио. Хранится только на телефоне.
 */
object Taste {
    private class Stat(var plays: Int = 0, var skips: Int = 0, var last: Long = 0)

    private lateinit var file: File
    private val tracks = HashMap<String, Stat>()
    private val artists = HashMap<String, Int>()

    fun init(ctx: Context) {
        file = File(ctx.filesDir, "taste.json")
        val o = runCatching { JSONObject(file.readText()) }.getOrNull() ?: return
        o.optJSONObject("t")?.let { t ->
            t.keys().forEach { k -> t.optJSONArray(k)?.let { a -> tracks[k] = Stat(a.optInt(0), a.optInt(1), a.optLong(2)) } }
        }
        o.optJSONObject("a")?.let { a -> a.keys().forEach { k -> artists[k] = a.optInt(k) } }
    }

    private fun artistKey(a: String) = Match.norm(a.split(Regex("""\s*(,|&| feat\.? | ft\.? )\s*""", RegexOption.IGNORE_CASE)).first().trim())

    /** Дослушали (или почти) — плюс песне и исполнителю. */
    @Synchronized fun played(t: Track) {
        val s = tracks.getOrPut(Library.key(t)) { Stat() }
        s.plays++; s.last = System.currentTimeMillis()
        if (t.artist.isNotBlank()) artists.merge(artistKey(t.artist), 1, Int::plus)
        save()
    }

    /** Переключили в первые 30 секунд — минус. */
    @Synchronized fun skipped(t: Track) {
        val s = tracks.getOrPut(Library.key(t)) { Stat() }
        s.skips++; s.last = System.currentTimeMillis()
        save()
    }

    /** Насколько песня «моя»: прослушивания, ♥, любимый исполнитель, пропуски, давно ли слушал. */
    @Synchronized fun score(t: Track): Double {
        val s = tracks[Library.key(t)]
        val maxArtist = (artists.values.maxOrNull() ?: 0).coerceAtLeast(1)
        val artist = artists[artistKey(t.artist)] ?: 0
        var x = 0.0
        if (s != null) {
            x += 2.0 * ln(1.0 + s.plays) - 1.5 * s.skips
            val days = (System.currentTimeMillis() - s.last) / 86_400_000.0
            if (s.plays > 0 && days < 7) x += 0.5 // недавно нравилось
            if (s.plays > 3 && days < 1) x -= 0.7 // заслушано сегодня — чуть реже
        }
        if (Library.isSaved(t)) x += 3.0
        x += 2.0 * artist / maxArtist
        return x
    }

    /** Умная сортировка: любимое и часто слушаемое — выше, но с долей случайности, чтобы не было одинаково каждый раз. */
    fun <T> smart(items: List<T>, track: (T) -> Track): List<T> {
        val rnd = java.util.Random()
        return items.map { it to score(track(it)) + rnd.nextDouble() * 1.2 }.sortedByDescending { it.second }.map { it.first }
    }

    /** То же без случайности — для показа списка (чтобы он не перемешивался при каждом обновлении). */
    fun <T> smartStable(items: List<T>, track: (T) -> Track): List<T> =
        items.withIndex().sortedWith(compareByDescending<IndexedValue<T>> { score(track(it.value)) }.thenBy { it.index }).map { it.value }

    /** Часто пропускаемые песни радио не предлагает. */
    @Synchronized fun disliked(t: Track): Boolean = tracks[Library.key(t)]?.let { it.skips >= 2 && it.skips > it.plays } ?: false

    private fun save() {
        val t = JSONObject()
        tracks.forEach { (k, s) -> t.put(k, org.json.JSONArray().put(s.plays).put(s.skips).put(s.last)) }
        val a = JSONObject()
        artists.forEach { (k, n) -> a.put(k, n) }
        runCatching { File(file.path + ".tmp").apply { writeText(JSONObject().put("t", t).put("a", a).toString()) }.renameTo(file) }
    }
}
