package com.zagruzchik.app

import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.Executors

/** Альбом. [id] — Deezer; если null (чарт Apple), альбом находим поиском при открытии. */
data class Album(val id: Long?, val title: String, val artist: String, val cover: String?, val year: String? = null, val explicit: Boolean = false)

data class Artist(val id: Long, val name: String, val picture: String?, val fans: Int = 0)

class ArtistPage(val artist: Artist, val top: List<Track>, val albums: List<Album>, val related: List<Artist>)

/**
 * Каталог как в стриминговом сервисе: чарты, новинки, исполнители, альбомы, радио похожих песен.
 * Открытые API без ключей: Apple (чарты России) и Deezer (всё остальное, с превью и пометкой explicit).
 * Версии без цензуры всегда выше «чистых».
 */
object Catalog {
    private const val DZ = "https://api.deezer.com"
    private val pool = Executors.newFixedThreadPool(6)

    private class Cached<T>(val time: Long, val value: T)
    private val cache = java.util.concurrent.ConcurrentHashMap<String, Cached<Any>>()

    @Suppress("UNCHECKED_CAST")
    private fun <T : Any> cached(key: String, ttlMin: Int, load: () -> T): T {
        cache[key]?.takeIf { System.currentTimeMillis() - it.time < ttlMin * 60_000L }?.let { return it.value as T }
        return load().also { if (!(it is List<*> && it.isEmpty())) cache[key] = Cached(System.currentTimeMillis(), it) }
    }

    // ---------------- Главная ----------------

    /** Как называется чарт: России (Apple) или мировой (Deezer, если Apple не ответил). */
    @Volatile var chartTitle = "Чарт России"; private set

    /** Топ песен России (Apple), дополненный данными Deezer: превью для мгновенного старта, длительность, explicit. */
    fun chart(): List<Track> = cached("chart", 30) {
        val apple = appleFeed("songs").map { o ->
            Track(o.optString("name"), o.optString("artistName"), cover = bigApple(o.optString("artworkUrl100")),
                url = o.optString("url").ifEmpty { null }, explicit = o.optString("contentAdvisoryRating").startsWith("Expl"))
        }
        if (apple.isEmpty()) {
            chartTitle = "Мировой чарт"
            return@cached deezerTracks("$DZ/chart/0/tracks?limit=50")
        }
        chartTitle = "Чарт России"
        parallel(apple) { t -> runCatching { enrich(t) }.getOrDefault(t) }
    }

    /**
     * Лента Apple «самое популярное в России». Сервер Apple иногда долго отвечает на один размер
     * и быстро на другой — спрашиваем оба сразу и берём что успело (лучше 50, чем 25).
     */
    private fun appleFeed(kind: String): List<JSONObject> {
        fun load(n: Int) = pool.submit<List<JSONObject>> {
            val r = Http.json("https://rss.marketingtools.apple.com/api/v2/ru/music/most-played/$n/$kind.json")
                .getJSONObject("feed").getJSONArray("results")
            (0 until r.length()).map { r.getJSONObject(it) }
        }
        val big = load(50)
        val small = load(25)
        val fast = runCatching { small.get() }.getOrDefault(emptyList())
        val full = runCatching { big.get(if (fast.isEmpty()) 20 else 3, java.util.concurrent.TimeUnit.SECONDS) }.getOrDefault(emptyList())
        return full.ifEmpty { fast }
    }

    /** Популярные альбомы России (Apple), иначе — чарт альбомов Deezer. */
    fun topAlbums(): List<Album> = cached("albums", 60) {
        appleFeed("albums").map { o ->
            Album(null, o.optString("name"), o.optString("artistName"), bigApple(o.optString("artworkUrl100")),
                o.optString("releaseDate").take(4).ifEmpty { null }, o.optString("contentAdvisoryRating").startsWith("Expl"))
        }.ifEmpty { albums(Http.json("$DZ/chart/0/albums?limit=25").optJSONArray("data")) }
    }

    /** Популярные исполнители (Deezer). */
    fun topArtists(): List<Artist> = cached("artists", 60) { artists(Http.json("$DZ/chart/0/artists?limit=20").optJSONArray("data")) }

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

    // ---------------- Радио ----------------

    /**
     * Похожая музыка для автопродолжения, когда очередь закончилась:
     * радио исполнителя в Deezer (его песни вперемешку с похожими). [exclude] — уже звучавшие.
     */
    fun radio(seed: Track, exclude: Collection<Track>): List<Track> {
        val a = artistByName(seed.artist) ?: return emptyList()
        val played = exclude.map { Match.base(it.title) + "|" + Match.norm(it.artist) }.toHashSet()
        val list = deezerTracks("$DZ/artist/${a.id}/radio?limit=40")
        return list.filter { played.add(Match.base(it.title) + "|" + Match.norm(it.artist)) }.take(15)
    }

    // ---------------- Разбор ----------------

    /** Ищем ту же песню в Deezer: превью для мгновенного старта, длительность, версия без цензуры. */
    private fun enrich(t: Track): Track {
        val data = Http.json("$DZ/search?limit=6&q=" + Http.enc("${t.artist} ${t.title}")).optJSONArray("data") ?: return t
        val found = (0 until data.length()).map { DeezerSource.track(data.getJSONObject(it)) }
        val ok = Match.ranked(t, found) { Triple(it.title, it.artist, it.durationSec) }
        val best = ok.firstOrNull { it.explicit } ?: ok.firstOrNull() ?: return t
        return best.copy(title = t.title, artist = t.artist, cover = t.cover ?: best.cover, explicit = best.explicit || t.explicit)
    }

    private fun deezerTracks(url: String): List<Track> {
        val d = Http.json(url).optJSONArray("data") ?: return emptyList()
        return (0 until d.length()).map { DeezerSource.track(d.getJSONObject(it)) }
    }

    private fun albums(d: JSONArray?): List<Album> = d?.let {
        (0 until it.length()).map { i ->
            val o = it.getJSONObject(i)
            Album(o.optLong("id"), o.optString("title"), o.optJSONObject("artist")?.optString("name").orEmpty(),
                o.optString("cover_big").ifEmpty { null }, o.optString("release_date").take(4).ifEmpty { null }, o.optBoolean("explicit_lyrics"))
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

    private fun <T, R> parallel(items: List<T>, f: (T) -> R): List<R> = items.map { pool.submit<R> { f(it) } }.map { it.get() }
}
