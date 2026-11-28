package com.zagruzchik.app

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.Calendar
import java.util.concurrent.Executors
import kotlin.math.ln
import kotlin.math.pow

/**
 * Предпочтения: что слушают до конца и часто, что пролистывают, каких исполнителей любят.
 * Отсюда «умная» сортировка медиатеки и порядок песен в радио. Хранится только на телефоне.
 */
object Taste {
    private class Stat(var plays: Int = 0, var skips: Int = 0, var last: Long = 0, val slots: IntArray = IntArray(4))

    private const val HALF_LIFE_MS = 21.0 * 86_400_000.0
    private const val ARTIST_COOLDOWN_MS = 2 * 3_600_000.0

    private lateinit var file: File
    private val tracks = HashMap<String, Stat>()
    private val artists = HashMap<String, Int>()
    private val names = HashMap<String, String>() // ключ → имя как пишется (для поиска новинок)
    private val artistSkips = HashMap<String, Long>() // ключ артиста → время последнего пропуска
    private val io = Executors.newSingleThreadExecutor { r -> Thread(r, "taste-io") }

    internal fun daySlotOf(hour: Int): Int = when (hour) {
        in 5..11 -> 0  // утро
        in 12..17 -> 1 // день
        in 18..22 -> 2 // вечер
        else -> 3      // ночь
    }

    internal fun currentDaySlot(): Int = daySlotOf(Calendar.getInstance().get(Calendar.HOUR_OF_DAY))

    internal fun daySlotName(slot: Int): String = when (slot) {
        0 -> "утро"
        1 -> "день"
        2 -> "вечер"
        else -> "ночь"
    }

    internal fun timeDecay(ageMs: Long): Double {
        if (ageMs <= 0L) return 1.0
        return 0.5.pow(ageMs.toDouble() / HALF_LIFE_MS)
    }

    fun init(ctx: Context) {
        file = File(ctx.filesDir, "taste.json")
        val o = runCatching { JSONObject(file.readText()) }.getOrNull() ?: return
        merge(o)
    }

    @Synchronized private fun merge(o: JSONObject) {
        o.optJSONObject("t")?.let { t ->
            t.keys().forEach { k ->
                val a = t.optJSONArray(k) ?: return@forEach
                val stat = tracks.getOrPut(k) { Stat() }
                stat.plays = maxOf(stat.plays, a.optInt(0).coerceIn(0, 1_000_000))
                stat.skips = maxOf(stat.skips, a.optInt(1).coerceIn(0, 1_000_000))
                stat.last = maxOf(stat.last, a.optLong(2).coerceAtMost(System.currentTimeMillis()))
                for (i in 0..3) stat.slots[i] = maxOf(stat.slots[i], a.optInt(3 + i).coerceIn(0, 1_000_000))
            }
        }
        o.optJSONObject("a")?.let { a -> a.keys().forEach { k -> artists[k] = maxOf(artists[k] ?: 0, a.optInt(k).coerceIn(0, 1_000_000)) } }
        o.optJSONObject("n")?.let { n -> n.keys().forEach { k -> names.putIfAbsent(k, n.optString(k)) } }
        o.optJSONObject("as")?.let { sk -> sk.keys().forEach { k -> artistSkips[k] = maxOf(artistSkips[k] ?: 0, sk.optLong(k).coerceAtMost(System.currentTimeMillis())) } }
    }

    @Synchronized internal fun restore(snapshot: JSONObject) {
        merge(snapshot)
        favMemo = null
        save()
    }

    private val artistSplit = Regex("""\s*(,|&| feat\.? | ft\.? )\s*""", RegexOption.IGNORE_CASE)
    private fun mainArtist(a: String) = a.split(artistSplit).first().trim()
    // Нормализация имени дорогая (Unicode + регулярные выражения); на 1400 любимых это 2–2,7 с в главном потоке
    // (журнал 17.11: «ЗАВИСАНИЕ ИНТЕРФЕЙСА … Taste.favoriteArtists»). Запоминаем.
    private val keys = java.util.concurrent.ConcurrentHashMap<String, String>()
    private val shownNames = java.util.concurrent.ConcurrentHashMap<String, String>()
    private fun artistKey(a: String) = keys.getOrPut(a) { Match.norm(mainArtist(a)) }
    private fun mainName(a: String) = shownNames.getOrPut(a) { mainArtist(a) }
    @Volatile private var favMemo: Triple<Int, Int, List<String>>? = null // (размер медиатеки, n, ответ)

    /**
     * Любимые исполнители: чьи песни под ♥ (каждая — как 3 прослушивания) и кого слушаете чаще.
     * Из них собираются «Новинки».
     */
    @Synchronized fun favoriteArtists(n: Int): List<String> {
        val fav = Library.favorites
        favMemo?.let { (size, nn, r) -> if (size == fav.size && nn >= n && System.currentTimeMillis() - memoAt < 60_000) return r.take(n) }
        val w = HashMap<String, Double>()
        val shown = HashMap<String, String>()
        fav.filter { it.artist.isNotBlank() }.forEach { t ->
            val k = artistKey(t.artist); w.merge(k, 3.0, Double::plus); shown.putIfAbsent(k, mainName(t.artist))
        }
        artists.forEach { (k, c) -> if (c >= 2) { w.merge(k, c.toDouble(), Double::plus); names[k]?.let { shown.putIfAbsent(k, it) } } }
        return w.entries.sortedByDescending { it.value }.mapNotNull { shown[it.key] }.take(maxOf(n, 12))
            .also { favMemo = Triple(fav.size, maxOf(n, 12), it); memoAt = System.currentTimeMillis() }.take(n)
    }
    @Volatile private var memoAt = 0L

    /**
     * Для экрана: готовый ответ без ожидания (журнал 20.11: первый подсчёт по 1400 любимым в главном потоке — 2,1 с при запуске).
     * Нет готового — пустой список, а подсчёт уходит в фон; [onReady] позовут, когда будет.
     */
    fun favoriteArtistsFast(n: Int, onReady: (() -> Unit)? = null): List<String> {
        favMemo?.let { (_, nn, r) -> if (nn >= n) return r.take(n) }
        if (!warming) { warming = true; Thread({ try { favoriteArtists(12) } finally { warming = false }; onReady?.let { android.os.Handler(android.os.Looper.getMainLooper()).post(it) } }, "taste").start() }
        return emptyList()
    }
    @Volatile private var warming = false

    /** Дослушали (или почти) — плюс песне и исполнителю. */
    @Synchronized fun played(t: Track) {
        val s = tracks.getOrPut(Library.key(t)) { Stat() }
        s.plays++
        s.last = System.currentTimeMillis()
        s.slots[currentDaySlot()]++
        if (t.artist.isNotBlank()) {
            val k = artistKey(t.artist)
            artists.merge(k, 1, Int::plus)
            names[k] = mainArtist(t.artist)
            artistSkips.remove(k)
        }
        save()
    }

    /** Переключили в первые 30 секунд — минус. */
    @Synchronized fun skipped(t: Track) {
        val now = System.currentTimeMillis()
        val s = tracks.getOrPut(Library.key(t)) { Stat() }
        s.skips++
        s.last = now
        if (t.artist.isNotBlank()) {
            artistSkips[artistKey(t.artist)] = now
        }
        save()
    }

    /** Насколько песня «моя»: прослушивания с затуханием, слот суток, ♥, любимый исполнитель, пропуски и cooldown. */
    @Synchronized fun score(t: Track): Double {
        val now = System.currentTimeMillis()
        val s = tracks[Library.key(t)]
        val maxArtist = (artists.values.maxOrNull() ?: 0).coerceAtLeast(1)
        val ak = if (t.artist.isNotBlank()) artistKey(t.artist) else ""
        val artist = if (ak.isNotEmpty()) (artists[ak] ?: 0) else 0
        var x = 0.0
        if (s != null) {
            val ageMs = (now - s.last).coerceAtLeast(0L)
            val decay = timeDecay(ageMs)
            x += 2.0 * ln(1.0 + s.plays) * (0.4 + 0.6 * decay) - 1.5 * s.skips * decay
            val totalSlots = s.slots.sum()
            val slotHits = s.slots[currentDaySlot()]
            if (totalSlots > 0 && slotHits > 0) {
                x += 1.2 * (slotHits.toDouble() / totalSlots) * ln(1.0 + slotHits).coerceAtMost(2.0)
            }
            val days = ageMs / 86_400_000.0
            if (s.plays > 0 && days < 7) x += 0.5 // недавно нравилось
            if (s.plays > 3 && days < 1) x -= 0.7 // заслушано сегодня — чуть реже
        }
        if (ak.isNotEmpty()) {
            artistSkips[ak]?.let { lastSkip ->
                val skipAge = now - lastSkip
                if (skipAge in 0L until ARTIST_COOLDOWN_MS.toLong()) {
                    x -= 2.5 * (1.0 - skipAge / ARTIST_COOLDOWN_MS)
                }
            }
        }
        if (Library.isSaved(t)) x += 3.0
        x += 2.0 * artist / maxArtist
        return x
    }

    /** Лайкнутые/любимые треки, которые давно не слушали и не пропускали. */
    @Synchronized fun forgottenFavorites(limit: Int, minAgeDays: Int = 14): List<Track> {
        if (limit <= 0) return emptyList()
        val cutoff = System.currentTimeMillis() - minAgeDays.coerceAtLeast(0) * 86_400_000L
        return Library.favorites.filter { t ->
            !disliked(t) && (tracks[Library.key(t)]?.let { it.last < cutoff } ?: true)
        }.shuffled().take(limit)
    }

    /** Умная сортировка: любимое и часто слушаемое — выше, но с долей случайности, чтобы не было одинаково каждый раз. */
    fun <T> smart(items: List<T>, track: (T) -> Track): List<T> {
        val rnd = java.util.Random()
        return items.map { it to score(track(it)) + rnd.nextDouble() * 1.2 }.sortedByDescending { it.second }.map { it.first }
    }

    /** То же без случайности — для показа списка (чтобы он не перемешивался при каждом обновлении). */
    fun <T> smartStable(items: List<T>, track: (T) -> Track): List<T> =
        items.withIndex().sortedWith(compareByDescending<IndexedValue<T>> { score(track(it.value)) }.thenBy { it.index }).map { it.value }

    /** Песню слушали (дослушали или пропустили) после момента [since] — для «Ауры дня»: такое в новый набор не берём. */
    @Synchronized fun heardSince(key: String, since: Long): Boolean = tracks[key]?.let { it.last >= since } ?: false

    /** Часто пропускаемые песни радио не предлагает. */
    @Synchronized fun disliked(t: Track): Boolean = tracks[Library.key(t)]?.let { it.skips >= 2 && it.skips > it.plays } ?: false

    @Synchronized internal fun backup(): JSONObject {
        val t = JSONObject()
        tracks.forEach { (k, s) ->
            t.put(k, JSONArray().put(s.plays).put(s.skips).put(s.last)
                .put(s.slots[0]).put(s.slots[1]).put(s.slots[2]).put(s.slots[3]))
        }
        val a = JSONObject()
        artists.forEach { (k, n) -> a.put(k, n) }
        val n = JSONObject()
        names.forEach { (k, v) -> n.put(k, v) }
        val sk = JSONObject()
        val now = System.currentTimeMillis()
        artistSkips.forEach { (k, ts) -> if (now - ts < ARTIST_COOLDOWN_MS.toLong()) sk.put(k, ts) }
        return JSONObject().put("t", t).put("a", a).put("n", n).put("as", sk)
    }

    private fun save() {
        if (!::file.isInitialized) return
        val json = backup().toString()
        io.execute { runCatching { File(file.path + ".tmp").apply { writeText(json) }.renameTo(file) } }
    }
}
