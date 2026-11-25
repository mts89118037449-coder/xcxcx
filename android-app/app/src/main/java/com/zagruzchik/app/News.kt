package com.zagruzchik.app

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.concurrent.Executors

/**
 * Новинки любимых исполнителей. При каждом запуске приложения проверяем их свежие релизы
 * (за 3 месяца). Релиз, которого не было при прошлой проверке, помечается «новое».
 * Прошлый результат хранится на телефоне — раздел показывается сразу, ещё до проверки.
 */
object News {
    class Release(val album: Album, val firstSeen: Long, val tracks: List<Track>) {
        /** Появился недавно (меньше 3 дней назад) — с пометкой «новое». */
        val isNew get() = System.currentTimeMillis() - firstSeen < 3 * 86_400_000L
    }

    private const val DAYS = 90
    private lateinit var file: File
    @Volatile var releases: List<Release> = emptyList(); private set
    @Volatile var checking = false; private set
    @Volatile var checkedArtists = 0; private set
    @Volatile private var lastChecked = 0L
    private val known = java.util.concurrent.ConcurrentHashMap<Long, Long>() // id релиза → когда впервые увидели
    private val listeners = mutableSetOf<() -> Unit>()
    private val pool = Executors.newFixedThreadPool(4)

    fun listen(l: () -> Unit) { listeners += l }
    fun unlisten(l: () -> Unit) { listeners -= l }
    private fun changed() = android.os.Handler(android.os.Looper.getMainLooper()).post { listeners.toList().forEach { it() } }

    fun init(ctx: Context) {
        file = File(ctx.filesDir, "news.json")
        val o = runCatching { JSONObject(file.readText()) }.getOrNull() ?: return
        lastChecked = o.optLong("checked")
        o.optJSONObject("known")?.let { k -> k.keys().forEach { id -> known[id.toLong()] = k.optLong(id) } }
        val arr = o.optJSONArray("releases") ?: JSONArray()
        releases = (0 until arr.length()).mapNotNull { i -> runCatching { readRelease(arr.getJSONObject(i)) }.getOrNull() }
    }

    /** Проверка при запуске (не чаще раза в 20 минут — повороты экрана и возвраты не считаются). */
    fun checkOnLaunch() {
        if (checking || System.currentTimeMillis() - lastChecked < 20 * 60_000L) return
        check()
    }

    fun check() {
        synchronized(this) {
            if (checking) return
            checking = true
        }
        changed()
        Thread({
            try {
                val artists = Taste.favoriteArtists(25)
                checkedArtists = artists.size
                val found = artists.map { a -> pool.submit<List<Album>> { runCatching { Catalog.recentReleases(a, DAYS) }.getOrDefault(emptyList()) } }
                    .flatMap { runCatching { it.get() }.getOrDefault(emptyList()) }
                    .distinctBy { it.id }
                    .sortedByDescending { it.date }
                    .take(20)
                val now = System.currentTimeMillis()
                val first = known.isEmpty() // самая первая проверка — всё «уже было», без пометок
                // Песни новинок: альбом — первые 3 трека, сингл — все.
                val withTracks = found.map { a ->
                    pool.submit<Release> {
                        val tracks = runCatching { Catalog.album(a).second }.getOrDefault(emptyList()).take(if (a.isSingle) 4 else 3)
                        val seen = known.getOrPut(a.id ?: 0) { if (first) now - 4 * 86_400_000L else now }
                        Release(a, seen, tracks)
                    }
                }.mapNotNull { runCatching { it.get() }.getOrNull() }
                if (withTracks.isNotEmpty() || artists.isEmpty()) releases = withTracks
                save(now)
            } finally {
                checking = false
                changed()
            }
        }, "news").start()
    }

    /** Все песни новинок подряд: сначала самые свежие релизы. */
    val tracks: List<Track> get() = releases.flatMap { it.tracks }

    private fun save(checked: Long) {
        val k = JSONObject(); known.forEach { (id, t) -> k.put(id.toString(), t) }
        val arr = JSONArray()
        releases.forEach { r ->
            val a = r.album
            arr.put(JSONObject().put("id", a.id ?: 0).put("title", a.title).put("artist", a.artist).put("cover", a.cover ?: "")
                .put("year", a.year ?: "").put("explicit", a.explicit).put("type", a.type).put("date", a.date ?: "")
                .put("seen", r.firstSeen)
                .put("tracks", JSONArray().apply {
                    r.tracks.forEach { t ->
                        put(JSONObject().put("title", t.title).put("artist", t.artist).put("dur", t.durationSec).put("cover", t.cover ?: "")
                            .put("url", t.url ?: "").put("explicit", t.explicit).put("isrc", t.isrc ?: ""))
                    }
                }))
        }
        lastChecked = checked
        runCatching { File(file.path + ".tmp").apply { writeText(JSONObject().put("checked", checked).put("known", k).put("releases", arr).toString()) }.renameTo(file) }
    }

    private fun readRelease(o: JSONObject): Release {
        val a = Album(o.optLong("id").takeIf { it > 0 }, o.optString("title"), o.optString("artist"), o.optString("cover").ifEmpty { null },
            o.optString("year").ifEmpty { null }, o.optBoolean("explicit"), o.optString("type", "album"), o.optString("date").ifEmpty { null })
        val ta = o.optJSONArray("tracks") ?: JSONArray()
        val tracks = (0 until ta.length()).map { i ->
            val t = ta.getJSONObject(i)
            // Превью Deezer со временем перестают открываться — не храним, песня найдётся заново.
            Track(t.optString("title"), t.optString("artist"), t.optInt("dur"), isrc = t.optString("isrc").ifEmpty { null },
                cover = t.optString("cover").ifEmpty { null }, url = t.optString("url").ifEmpty { null }, explicit = t.optBoolean("explicit"))
        }
        return Release(a, o.optLong("seen"), tracks)
    }
}
