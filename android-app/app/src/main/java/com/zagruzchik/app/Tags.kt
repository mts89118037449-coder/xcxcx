package com.zagruzchik.app

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import kotlin.math.sqrt

/**
 * Теги песни — из чего она сделана: жанр (Deezer, по альбому), язык, приметы в названии (slowed, phonk, remix…),
 * а у прослушанных — темп и «басовитость», измеренные в самом звуке. По тегам любимых песен складывается вкус,
 * по нему подбираются новые песни (см. [Recs]). Всё хранится только на телефоне.
 */
object Tags {
    private lateinit var file: File
    private val map = HashMap<String, JSONObject>()
    private val albumGenres = HashMap<Long, List<String>>()
    @Volatile private var dirty = false

    fun init(ctx: Context) {
        file = File(ctx.filesDir, "tags.json")
        val o = runCatching { JSONObject(file.readText()) }.getOrNull() ?: return
        synchronized(this) { o.keys().forEach { k -> o.optJSONObject(k)?.let { map[k] = it } } }
    }

    // Приметы в названии: версия и стиль, которые часто ищут именно в такой форме.
    private val MARKERS = listOf(
        "slowed" to "slowed", "reverb" to "slowed", "sped up" to "speed up", "speed up" to "speed up", "nightcore" to "speed up",
        "phonk" to "phonk", "jumpstyle" to "jumpstyle", "hardstyle" to "hardstyle", "drill" to "drill", "remix" to "ремикс",
        "acoustic" to "акустика", "акустик" to "акустика", "live" to "live", "lofi" to "lo-fi", "lo-fi" to "lo-fi", "instrumental" to "инструментал",
    )

    // Жанры Deezer — по-русски и покороче.
    private val GENRE_RU = mapOf("Rap/Hip Hop" to "рэп", "Pop" to "поп", "Rock" to "рок", "Dance" to "танцевальная", "Electro" to "электроника",
        "Alternative" to "альтернатива", "R&B" to "r&b", "Metal" to "метал", "Reggaeton" to "реггетон", "Soul & Funk" to "соул",
        "Jazz" to "джаз", "Classical" to "классика", "Folk" to "фолк", "Films/Games" to "саундтрек", "Indie Pop" to "инди", "Indie Rock" to "инди")

    /** Теги, которые видны сразу, без сети: язык и приметы в названии. */
    private fun local(t: Track): List<String> {
        val out = ArrayList<String>()
        val text = (t.title + " " + t.artist)
        out += if (text.any { it in 'а'..'я' || it in 'А'..'Я' || it == 'ё' }) "русский" else "иностранный"
        val low = t.title.lowercase()
        MARKERS.forEach { (w, tag) -> if (w in low && tag !in out) out += tag }
        if (t.explicit) out += "без цензуры"
        return out
    }

    /** Все теги песни: известные (жанр, темп) и те, что видны по названию. */
    @Synchronized fun of(t: Track): List<String> {
        val o = map[Library.key(t)]
        val out = ArrayList(local(t))
        o?.optJSONArray("g")?.let { g -> for (i in 0 until g.length()) g.optString(i).takeIf { it.isNotBlank() && it !in out }?.let { out += it } }
        o?.optInt("bpm")?.takeIf { it > 0 }?.let { out += when { it < 90 -> "медленная"; it > 135 -> "быстрая"; else -> "средний темп" } }
        if (o != null && o.has("bass")) bassTag(o.optDouble("bass"))?.let { out += it }
        return out
    }

    /** «Басовая» — если доля баса выше, чем у большинства уже измеренных песен (по самой медиатеке, без выдуманных порогов). */
    private var bassCut: Double? = null
    private var bassCutValid = false
    private fun bassTag(share: Double): String? {
        if (!bassCutValid) {
            val all = map.values.mapNotNull { v -> v.optDouble("bass").takeIf { v.has("bass") && !it.isNaN() } }.sorted()
            bassCut = if (all.size < 10) null else all[(all.size * 0.7).toInt().coerceAtMost(all.size - 1)]
            bassCutValid = true
        }
        val cut = bassCut ?: return null
        return if (share >= cut) "басовая" else null
    }

    /** Песня дослушана: темп и доля баса, измеренные в звуке (BeatSink). */
    @Synchronized fun heard(t: Track, bpm: Int, bassShare: Float) {
        if (bpm <= 0 && bassShare <= 0f) return
        val o = map.getOrPut(Library.key(t)) { JSONObject() }
        if (bpm > 0) o.put("bpm", bpm)
        if (bassShare > 0f) { o.put("bass", bassShare.toDouble()); bassCutValid = false }
        dirty = true
    }

    @Synchronized private fun known(t: Track) = map[Library.key(t)]?.has("g") == true

    /** Жанр из Deezer (одна-две сетевые просьбы; жанры альбома запоминаются). Звать не из главного потока. */
    fun enrich(t: Track): Boolean {
        if (known(t) || t.artist.isBlank()) return false
        val data = runCatching { Http.cachedJson("https://api.deezer.com/search?limit=5&q=" + Http.enc("${t.artist} ${t.title}"), 8000).optJSONArray("data") }
            .getOrNull() ?: return false
        val items = (0 until data.length()).map { data.getJSONObject(it) }
        val best = Match.ranked(t, items) { Triple(it.optString("title"), it.optJSONObject("artist")?.optString("name").orEmpty(), it.optInt("duration")) }
            .firstOrNull()
        val albumId = best?.optJSONObject("album")?.optLong("id") ?: 0L
        val artistId = best?.optJSONObject("artist")?.optLong("id") ?: 0L
        val genres = if (albumId > 0) synchronized(this) { albumGenres[albumId] } ?: runCatching {
            val g = Http.json("https://api.deezer.com/album/$albumId").optJSONObject("genres")?.optJSONArray("data") ?: JSONArray()
            (0 until g.length()).mapNotNull { i -> g.getJSONObject(i).optString("name").let { GENRE_RU[it] ?: it.lowercase() }.takeIf { it.isNotBlank() } }
        }.getOrDefault(emptyList()).also { synchronized(this) { albumGenres[albumId] = it } } else emptyList()
        synchronized(this) {
            val o = map.getOrPut(Library.key(t)) { JSONObject() }
            o.put("g", JSONArray(genres.distinct().take(3)))
            if (artistId > 0) o.put("a", artistId)
            dirty = true
        }
        return true
    }

    /** Deezer-номер исполнителя песни (если уже узнали). */
    @Synchronized fun artistId(t: Track): Long = map[Library.key(t)]?.optLong("a") ?: 0L

    /** Вкус: вес каждого тега по любимым и часто слушаемым песням (Taste.score). Чем больше вес — тем сильнее тег. */
    fun profile(): Map<String, Double> {
        val w = HashMap<String, Double>()
        Library.favorites.forEach { t -> val s = 1.0 + maxOf(0.0, Taste.score(t)) * 0.3; of(t).forEach { w.merge(it, s, Double::plus) } }
        val total = w.values.maxOrNull() ?: return emptyMap()
        return w.mapValues { it.value / total }
    }

    /** Косинусная близость профиля вкуса и тегов трека. */
    internal fun cosineScore(profile: Map<String, Double>, tags: Collection<String>): Double {
        if (profile.isEmpty() || tags.isEmpty()) return 0.0
        val uniq = tags.toSet()
        var dot = 0.0
        for (t in uniq) dot += profile[t] ?: 0.0
        if (dot <= 0.0) return 0.0
        var sumSq = 0.0
        for (v in profile.values) sumSq += v * v
        val normP = sqrt(sumSq)
        val normT = sqrt(uniq.size.toDouble())
        if (normP <= 0.0 || normT <= 0.0) return 0.0
        return dot / (normP * normT)
    }

    /** Самые «ваши» теги — для подписи на главной. */
    fun top(n: Int): List<String> = profile().entries.filter { it.key != "иностранный" }.sortedByDescending { it.value }.take(n).map { it.key }

    /** Готовые «ваши» теги для экрана — считаются фоном (на 1000+ песнях это заметная работа для главного потока). */
    @Volatile var topCached: List<String> = emptyList()
        private set
    fun refreshTop() { topCached = runCatching { top(3) }.getOrDefault(emptyList()) }

    @Synchronized internal fun backup(): JSONObject = JSONObject().apply { map.forEach { (key, value) -> put(key, JSONObject(value.toString())) } }

    internal fun restore(snapshot: JSONObject) {
        synchronized(this) {
            snapshot.keys().forEach { key ->
                val incoming = snapshot.optJSONObject(key) ?: return@forEach
                val current = map.getOrPut(key) { JSONObject() }
                if (!current.has("bpm")) incoming.optInt("bpm").takeIf { it in 30..400 }?.let { current.put("bpm", it) }
                if (!current.has("bass")) incoming.optDouble("bass").takeIf { it in 0.0..1.0 }?.let { current.put("bass", it) }
                if (!current.has("a")) incoming.optLong("a").takeIf { it > 0L }?.let { current.put("a", it) }
                if (!current.has("g")) incoming.optJSONArray("g")?.let { genres ->
                    current.put("g", JSONArray((0 until minOf(16, genres.length())).mapNotNull { i ->
                        genres.optString(i).takeIf { it.isNotBlank() && it.length <= 80 }
                    }))
                }
            }
            bassCutValid = false
            dirty = true
        }
        save()
        refreshTop()
    }

    fun save() {
        if (!::file.isInitialized) return
        val json = synchronized(this) {
            if (!dirty) return
            val o = JSONObject()
            map.forEach { (k, v) -> o.put(k, v) }
            dirty = false
            o.toString()
        }
        synchronized(file) { runCatching { File(file.path + ".tmp").apply { writeText(json) }.renameTo(file) } }
    }

    @Volatile private var enriching = false

    /** Фоном: жанры для любимых песен, у которых их ещё нет. Уступает нажатому; не чаще трёх запросов в секунду. */
    fun enrichFavorites() {
        if (enriching) return
        enriching = true
        Thread({
            try {
                refreshTop()
                Thread.sleep(30_000) // не в первые секунды после запуска
                val todo = Library.favorites.filter { !known(it) && it.artist.isNotBlank() && !it.title.equals(it.artist, true) }
                var n = 0
                for (t in todo) {
                    Streams.waitForeground()
                    if (runCatching { enrich(t) }.getOrDefault(false)) n++
                    if (n % 20 == 0) save()
                    Thread.sleep(350)
                }
                save()
                refreshTop()
                if (n > 0) AppLog.add("ТЕГИ: добавлены жанры для $n песен; ваши теги: ${topCached.joinToString(", ")}")
            } finally { enriching = false }
        }, "tags").start()
    }
}

/**
 * Новые песни по вкусу: исполнители, похожие на любимых (Deezer «related»), и чарт любимого жанра. Из них — то, чего ещё
 * нет в медиатеке и что не пропускали, по совпадению тегов с вашим вкусом. Собирается раз в день и запоминается.
 */
object Recs {
    private fun file(ctx: Context) = File(ctx.filesDir, "recs.json")
    internal fun invalidate(ctx: Context) { file(ctx).delete() }
    private fun day() = System.currentTimeMillis() / 86_400_000L

    // Жанры Deezer для чарта любимого жанра (номера из api.deezer.com/genre).
    private val GENRE_ID = mapOf("рэп" to 116, "поп" to 132, "рок" to 152, "танцевальная" to 113, "электроника" to 106,
        "альтернатива" to 85, "r&b" to 165, "метал" to 464, "соул" to 169)

    /** Подборка на сегодня (из файла, если уже собрана). Звать не из главного потока. */
    fun today(ctx: Context, n: Int = 30): List<Track> {
        runCatching {
            val o = JSONObject(file(ctx).readText())
            if (o.optLong("day") == day()) {
                val a = o.getJSONArray("t")
                return (0 until a.length()).map { trackFrom(a.getJSONObject(it)) }
            }
        }
        return build(n).also { list ->
            if (list.isNotEmpty()) runCatching {
                file(ctx).writeText(JSONObject().put("day", day()).put("t", JSONArray(list.map(::trackTo))).toString())
            }
        }
    }

    private fun build(n: Int): List<Track> {
        val profile = Tags.profile()
        val known = HashSet<String>()
        Library.favorites.forEach { known += Library.key(it) }
        History.all.forEach { known += Library.key(it.track) }
        val favArtists = Taste.favoriteArtists(8)
        val favKeys = favArtists.map { Match.norm(it) }.toSet()
        val rnd = java.util.Random(day())

        val pool = Executors.newFixedThreadPool(5)
        try {
            // Чарт самого «вашего» жанра — запускаем параллельно с похожими артистами.
            val topGenre = profile.entries.filter { it.key in GENRE_ID }.maxByOrNull { it.value }?.key
            val chartFuture = topGenre?.let { g ->
                pool.submit<List<Pair<Track, Double>>> {
                    val d = runCatching { Http.cachedJson("https://api.deezer.com/chart/${GENRE_ID[g]}/tracks?limit=40").optJSONArray("data") }.getOrNull()
                        ?: return@submit emptyList()
                    (0 until d.length()).map { DeezerSource.track(d.getJSONObject(it)) to 0.6 }
                }
            }

            // Похожие исполнители: чем к большему числу любимых они «похожи», тем выше.
            val relatedFutures = favArtists.map { name ->
                pool.submit<List<Artist>> {
                    val a = runCatching { Catalog.artistByName(name) }.getOrNull() ?: return@submit emptyList()
                    val page = runCatching { Catalog.artist(a.id) }.getOrNull() ?: return@submit emptyList()
                    page.related.filter { Match.norm(it.name) !in favKeys }
                }
            }
            val related = HashMap<Long, Pair<Artist, Int>>()
            relatedFutures.forEach { f ->
                val list = runCatching { f.get(10, TimeUnit.SECONDS) }.getOrDefault(emptyList())
                list.forEach { r -> related[r.id] = r to ((related[r.id]?.second ?: 0) + 1) }
            }

            val topFutures = related.values.sortedByDescending { it.second }.take(12).map { (artist, votes) ->
                pool.submit<List<Pair<Track, Double>>> {
                    val top = runCatching { Catalog.artist(artist.id).top }.getOrDefault(emptyList()).take(5)
                    top.map { it to (1.0 + 0.5 * votes) }
                }
            }
            val candidates = ArrayList<Pair<Track, Double>>()
            topFutures.forEach { f ->
                candidates += runCatching { f.get(10, TimeUnit.SECONDS) }.getOrDefault(emptyList())
            }
            chartFuture?.let { f ->
                candidates += runCatching { f.get(10, TimeUnit.SECONDS) }.getOrDefault(emptyList())
            }

            val seen = HashSet<String>()
            val scored = candidates.filter { (t, _) -> val k = Library.key(t); k !in known && seen.add(k) && !Taste.disliked(t) && t.title.isNotBlank() }
                .map { (t, base) ->
                    val cos = Tags.cosineScore(profile, Tags.of(t))
                    t to (base + 2.5 * cos + rnd.nextDouble() * 0.4)
                }
                .toMutableList()

            val picked = ArrayList<Track>(minOf(n, scored.size))
            val artistCount = HashMap<String, Int>()
            while (picked.size < n && scored.isNotEmpty()) {
                var bestIdx = 0
                var bestScore = Double.NEGATIVE_INFINITY
                for (i in scored.indices) {
                    val (track, sc) = scored[i]
                    val ak = Match.norm(Library.mainArtist(track.artist))
                    val cnt = if (ak.isNotEmpty()) (artistCount[ak] ?: 0) else 0
                    val adj = sc - 0.8 * cnt
                    if (adj > bestScore) {
                        bestScore = adj
                        bestIdx = i
                    }
                }
                val chosen = scored.removeAt(bestIdx).first
                picked += chosen
                val ak = Match.norm(Library.mainArtist(chosen.artist))
                if (ak.isNotEmpty()) artistCount[ak] = (artistCount[ak] ?: 0) + 1
            }
            return picked
        } finally {
            pool.shutdownNow()
        }
    }

    private fun trackTo(t: Track) = JSONObject().put("t", t.title).put("a", t.artist).put("d", t.durationSec).put("c", t.cover ?: "")
        .put("u", t.url ?: "").put("p", t.preview ?: "").put("e", t.explicit)
    private fun trackFrom(o: JSONObject) = Track(o.optString("t"), o.optString("a"), o.optInt("d"), cover = o.optString("c").ifEmpty { null },
        url = o.optString("u").ifEmpty { null }, preview = o.optString("p").ifEmpty { null }, explicit = o.optBoolean("e"))
}
