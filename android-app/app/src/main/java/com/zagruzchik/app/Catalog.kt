package com.zagruzchik.app

import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.Executors

/** Альбом. [id] — Deezer; если null (чарт Apple), альбом находим поиском при открытии. */
data class Album(
    val id: Long?, val title: String, val artist: String, val cover: String?, val year: String? = null, val explicit: Boolean = false,
    /** album / single / ep / compile — у исполнителя альбомы и синглы показываем отдельно. */
    val type: String = "album", val date: String? = null,
) {
    val isSingle get() = type == "single" || type == "ep"
}

data class Artist(val id: Long, val name: String, val picture: String?, val fans: Int = 0)

class ArtistPage(val artist: Artist, val top: List<Track>, val albums: List<Album>, val related: List<Artist>) {
    /** Альбомы (новые — первыми) и отдельно синглы/EP. */
    val longPlays get() = albums.filter { !it.isSingle }.sortedByDescending { it.date }
    val singles get() = albums.filter { it.isSingle }.sortedByDescending { it.date }
}

/**
 * Каталог как в стриминговом сервисе: чарты, новинки, исполнители, альбомы, радио похожих песен.
 * Открытые API без ключей: Apple (чарты России) и Deezer (всё остальное, с превью и пометкой explicit).
 * Версии без цензуры всегда выше «чистых».
 */
object Catalog {
    private const val DZ = "https://api.deezer.com"
    private val pool = Executors.newFixedThreadPool(10)

    private class Cached<T>(val time: Long, val value: T)
    private val cache = java.util.concurrent.ConcurrentHashMap<String, Cached<Any>>()

    @Suppress("UNCHECKED_CAST")
    private fun <T : Any> cached(key: String, ttlMin: Int, load: () -> T): T {
        cache[key]?.takeIf { System.currentTimeMillis() - it.time < ttlMin * 60_000L }?.let { return it.value as T }
        if (Http.isOffline) return load() // с телефона — не запоминаем, сразу после этого придёт свежее
        return load().also { if (!(it is List<*> && it.isEmpty())) cache[key] = Cached(System.currentTimeMillis(), it) }
    }

    // ---------------- Главная ----------------

    /**
     * Чарт России: Apple Music (Россия), а если не ответил — Яндекс Музыка (работает из России без VPN).
     * Песни дополняются данными Deezer: фрагмент для мгновенного старта, длительность, explicit.
     */
    fun chartRu(): List<Track> = cached("chartRu", 30) {
        val apple = runCatching { appleFeed("songs") }.getOrDefault(emptyList()).map { o ->
            Track(o.optString("name"), o.optString("artistName"), cover = bigApple(o.optString("artworkUrl100")),
                url = o.optString("url").ifEmpty { null }, explicit = o.optString("contentAdvisoryRating").startsWith("Expl"))
        }
        val list = apple.ifEmpty { runCatching { yandexChart() }.getOrDefault(emptyList()) }
        parallel(list) { t -> runCatching { if (t.preview == null) enrich(t) else t }.getOrDefault(t) }
    }

    /** Мировой чарт (Deezer). */
    fun chartWorld(): List<Track> = cached("chartWorld", 30) { deezerTracks("$DZ/chart/0/tracks?limit=50") }

    private fun yandexChart(): List<Track> {
        val tracks = Http.cachedJson("https://api.music.yandex.net/landing3/chart/russia", 7000)
            .optJSONObject("result")?.optJSONObject("chart")?.optJSONArray("tracks") ?: return emptyList()
        return (0 until minOf(tracks.length(), 50)).mapNotNull { i -> tracks.optJSONObject(i)?.optJSONObject("track")?.let { YandexSource.track(it) } }
    }

    /**
     * Лента Apple «самое популярное в России». Сервер Apple иногда долго отвечает на один размер
     * и быстро на другой — спрашиваем оба сразу и берём что успело (лучше 50, чем 25).
     */
    private fun appleFeed(kind: String): List<JSONObject> {
        // Сервер Apple отвечает через раз (502, или молчит полминуты), причём на разные размеры по-разному.
        // Просим 100/50/25/10 сразу, каждый — до двух попыток по 6 с, и берём самый полный из ответивших.
        // Не ответил никто — Http.cachedJson отдаст последний сохранённый на телефоне.
        fun load(n: Int) = submit {
            val url = "https://rss.marketingtools.apple.com/api/v2/ru/music/most-played/$n/$kind.json"
            val o = runCatching { Http.cachedJson(url, 6000) }.recoverCatching { Thread.sleep(500); Http.cachedJson(url, 6000) }.getOrThrow()
            val r = o.getJSONObject("feed").getJSONArray("results")
            (0 until r.length()).map { r.getJSONObject(it) }
        }
        val jobs = listOf(100, 50, 25, 10).map { load(it) }
        val started = System.currentTimeMillis()
        fun result(f: java.util.concurrent.Future<List<JSONObject>>) = if (f.isDone) runCatching { f.get() }.getOrDefault(emptyList()) else emptyList()
        while (true) {
            // Самый большой уже ответил — сразу; через 4 с — самый большой из ответивших; через 13 с — что есть.
            result(jobs[0]).takeIf { it.isNotEmpty() }?.let { return it }
            val elapsed = System.currentTimeMillis() - started
            if (elapsed > 4000 || jobs.all { it.isDone }) jobs.map(::result).firstOrNull { it.isNotEmpty() }?.let { return it }
            if (jobs.all { it.isDone } || elapsed > 13_000) return emptyList()
            Thread.sleep(100)
        }
    }

    /** Популярные альбомы России (Apple), иначе — чарт альбомов Deezer. */
    fun topAlbums(): List<Album> = cached("albums", 60) {
        appleFeed("albums").map { o ->
            Album(null, o.optString("name"), o.optString("artistName"), bigApple(o.optString("artworkUrl100")),
                o.optString("releaseDate").take(4).ifEmpty { null }, o.optString("contentAdvisoryRating").startsWith("Expl"))
        }.ifEmpty { albums(Http.cachedJson("$DZ/chart/0/albums?limit=25").optJSONArray("data")) }
    }

    /** Популярные исполнители (Deezer). */
    fun topArtists(): List<Artist> = cached("artists", 60) { artists(Http.cachedJson("$DZ/chart/0/artists?limit=20").optJSONArray("data")) }

    // ---------------- Поиск ----------------

    fun searchArtists(q: String): List<Artist> = cached("sa:$q", 30) { artists(Http.json("$DZ/search/artist?limit=8&q=" + Http.enc(q)).optJSONArray("data")) }

    fun searchAlbums(q: String): List<Album> = cached("sal:$q", 30) {
        albums(Http.json("$DZ/search/album?limit=12&q=" + Http.enc(q)).optJSONArray("data")).let(::uncensoredFirst)
    }

    // ---------------- Исполнитель и альбом ----------------

    fun artist(id: Long): ArtistPage = cached("artist:$id", 30) {
        val a = pool.submit<JSONObject> { Http.json("$DZ/artist/$id") }
        val top = pool.submit<List<Track>> { deezerTracks("$DZ/artist/$id/top?limit=20") }
        val albums = pool.submit<List<Album>> { albums(Http.json("$DZ/artist/$id/albums?limit=50").optJSONArray("data")) }
        val related = pool.submit<List<Artist>> { artists(Http.json("$DZ/artist/$id/related?limit=12").optJSONArray("data")) }
        val o = a.get()
        o.optJSONObject("error")?.let { throw UserError("Исполнитель не найден") }
        val me = artist(o)
        val al = runCatching { albums.get() }.getOrDefault(emptyList()).map { if (it.artist.isEmpty()) it.copy(artist = me.name) else it }
        ArtistPage(me, runCatching { top.get() }.getOrDefault(emptyList()), uncensoredFirst(al), runCatching { related.get() }.getOrDefault(emptyList()))
    }

    /** Исполнитель по имени (из плеера, из строки песни). */
    fun artistByName(name: String): Artist? {
        val main = name.split(Regex("""\s*(,|&| feat\.? | ft\.? | x | и )\s*""", RegexOption.IGNORE_CASE)).first().trim()
        if (main.isEmpty()) return null
        val found = searchArtists(main)
        return found.firstOrNull { Match.norm(it.name) == Match.norm(main) } ?: found.firstOrNull()
    }

    /** Треки альбома. Альбом из чарта Apple сначала находим в Deezer (версию без цензуры — в приоритете). */
    fun album(a: Album): Pair<Album, List<Track>> = cached("album:${a.id}:${a.artist}:${a.title}", 30) {
        val id = a.id ?: run {
            val found = albums(Http.json("$DZ/search/album?limit=10&q=" + Http.enc("${a.artist} ${a.title}")).optJSONArray("data"))
            val same = found.filter { Match.base(it.title) == Match.base(a.title) }
            (uncensoredFirst(same).firstOrNull() ?: found.firstOrNull())?.id
        } ?: throw UserError("Альбом «${a.title}» не нашёлся в каталоге")
        val o = Http.json("$DZ/album/$id")
        o.optJSONObject("error")?.let { throw UserError("Альбом не найден") }
        val cover = o.optString("cover_xl").ifEmpty { o.optString("cover_big") }.ifEmpty { null }
        val data = o.optJSONObject("tracks")?.optJSONArray("data") ?: JSONArray()
        val tracks = (0 until data.length()).map { DeezerSource.track(data.getJSONObject(it)).let { t -> if (t.cover == null) t.copy(cover = cover) else t } }
        val full = Album(id, o.optString("title"), o.optJSONObject("artist")?.optString("name").orEmpty(), cover,
            o.optString("release_date").take(4).ifEmpty { null }, o.optBoolean("explicit_lyrics"))
        full to tracks
    }

    // ---------------- Новинки ----------------

    /** Релизы исполнителя за последние [days] дней (новые — первыми). */
    fun recentReleases(artist: String, days: Int): List<Album> {
        val a = artistByName(artist) ?: return emptyList()
        if (Match.norm(a.name) != Match.norm(artist.split(Regex("""\s*(,|&| feat\.? | ft\.? )\s*""", RegexOption.IGNORE_CASE)).first().trim())) return emptyList()
        val since = java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US).format(java.util.Date(System.currentTimeMillis() - days * 86_400_000L))
        val today = java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US).format(java.util.Date())
        return albums(Http.json("$DZ/artist/${a.id}/albums?limit=100").optJSONArray("data"))
            .map { if (it.artist.isEmpty()) it.copy(artist = a.name) else it }
            .filter { d -> d.date != null && d.date >= since && d.date <= today }
            .let(::uncensoredFirst)
    }

    // ---------------- Радио ----------------

    /**
     * Похожая музыка для автопродолжения, когда очередь закончилась:
     * радио исполнителя в Deezer (его песни вперемешку с похожими). [exclude] — уже звучавшие.
     */
    fun radio(seed: Track, exclude: Collection<Track>): List<Track> {
        val a = artistByName(seed.artist) ?: return emptyList()
        val played = exclude.map { Match.base(it.title) + "|" + Match.norm(it.artist) }.toHashSet()
        val list = deezerTracks("$DZ/artist/${a.id}/radio?limit=40")
        // Пропускаемое не предлагаем; исполнители, которых слушаете чаще, — ближе к началу.
        val fresh = list.filter { played.add(Match.base(it.title) + "|" + Match.norm(it.artist)) && !Taste.disliked(it) }.take(15)
        return Taste.smart(fresh) { it }
    }

    private val covers = java.util.concurrent.ConcurrentHashMap<String, String>()
    /** Обложка песни, у которой её нет (нашлась на площадке без картинки): ищем ту же песню в каталоге. null — не нашлась. */
    fun coverFor(t: Track): String? {
        val k = Library.key(t)
        covers[k]?.let { return it.ifEmpty { null } }
        val c = runCatching { enrich(t.copy(cover = null)).cover }.getOrElse { return null } // сеть не ответила — попробуем в другой раз
        covers[k] = c.orEmpty()
        return c
    }

    // ---------------- Разбор ----------------

    /** Ищем ту же песню в Deezer: превью для мгновенного старта, длительность, версия без цензуры. */
    private fun enrich(t: Track): Track {
        val data = Http.cachedJson("$DZ/search?limit=6&q=" + Http.enc("${t.artist} ${t.title}"), 8000).optJSONArray("data") ?: return t
        val found = (0 until data.length()).map { DeezerSource.track(data.getJSONObject(it)) }
        val ok = Match.ranked(t, found) { Triple(it.title, it.artist, it.durationSec) }
        val best = ok.firstOrNull { it.explicit } ?: ok.firstOrNull() ?: return t
        return best.copy(title = t.title, artist = t.artist, cover = t.cover ?: best.cover, explicit = best.explicit || t.explicit)
    }

    private fun deezerTracks(url: String): List<Track> {
        val d = Http.cachedJson(url).optJSONArray("data") ?: return emptyList()
        return (0 until d.length()).map { DeezerSource.track(d.getJSONObject(it)) }
    }

    private fun albums(d: JSONArray?): List<Album> = d?.let {
        (0 until it.length()).map { i ->
            val o = it.getJSONObject(i)
            Album(o.optLong("id"), o.optString("title"), o.optJSONObject("artist")?.optString("name").orEmpty(),
                o.optString("cover_big").ifEmpty { null }, o.optString("release_date").take(4).ifEmpty { null }, o.optBoolean("explicit_lyrics"),
                o.optString("record_type").ifEmpty { "album" }, o.optString("release_date").ifEmpty { null })
        }
    }.orEmpty()

    private fun artists(d: JSONArray?): List<Artist> = d?.let { (0 until it.length()).map { i -> artist(it.getJSONObject(i)) } }.orEmpty()

    private fun artist(o: JSONObject) = Artist(o.optLong("id"), o.optString("name"),
        o.optString("picture_big").ifEmpty { o.optString("picture_medium") }.ifEmpty { null }, o.optInt("nb_fan"))

    /** Из одинаковых альбомов (explicit и «чистый») оставляем версию без цензуры. */
    private fun uncensoredFirst(list: List<Album>): List<Album> {
        val byKey = LinkedHashMap<String, Album>()
        for (a in list) {
            val k = Match.base(a.title) + "|" + Match.norm(a.artist)
            val prev = byKey[k]
            if (prev == null || (a.explicit && !prev.explicit)) byKey[k] = a
        }
        return byKey.values.toList()
    }

    private fun bigApple(u: String) = u.ifEmpty { null }?.replace(Regex("""/\d+x\d+bb\."""), "/600x600bb.")

    private fun <T, R> parallel(items: List<T>, f: (T) -> R): List<R> = items.map { x -> submit { f(x) } }.map { it.get() }

    /** В фон — с тем же режимом «только с телефона», что у вызывающего. */
    private fun <T> submit(f: () -> T): java.util.concurrent.Future<T> {
        val off = Http.isOffline
        return pool.submit<T> { if (off) Http.fromDisk(f) else f() }
    }
}
