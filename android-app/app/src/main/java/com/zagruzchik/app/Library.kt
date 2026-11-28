package com.zagruzchik.app

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.concurrent.CopyOnWriteArraySet

/**
 * Библиотека: сохранённые песни (♥) и скачанная музыка.
 * Сохранённые играют из интернета; если такая песня уже скачана — с телефона, мгновенно и без сети.
 */
object Library {
    private lateinit var file: File
    private val saved = mutableListOf<Track>()
    private val listeners = CopyOnWriteArraySet<() -> Unit>()

    fun init(ctx: Context) {
        loadAlbums(ctx)
        loadPlaylists(ctx)
        file = File(ctx.filesDir, "library.json")
        synchronized(saved) { saved.clear(); savedKeys = emptySet(); savedLoose = emptySet(); savedVersion++ }
        val arr = runCatching { JSONArray(file.readText()) }.getOrNull() ?: return
        val loaded = ArrayList<Track>(arr.length())
        for (i in 0 until arr.length()) {
            val o = arr.getJSONObject(i)
            loaded += Track(
                o.getString("title"), o.optString("artist"), o.optInt("duration"),
                isrc = o.optString("isrc").ifEmpty { null }, cover = o.optString("cover").ifEmpty { null },
                url = o.optString("url").ifEmpty { null }, preview = o.optString("preview").ifEmpty { null },
            )
        }
        // Перенос из файла в 6.3 мог записать вместо исполнителя «spotify:artist:…» — такие песни убираем (перенесите файл заново).
        // …и подписи кнопок, попавшие в медиатеку при переносе с экрана («Открыть контекстное меню для элемента…»).
        val cleaned = synchronized(saved) {
            saved.addAll(loaded)
            savedVersion++
            saved.removeAll { Importer.isId(it.artist) || ScreenImportService.isUiText(it.artist) || ScreenImportService.isUiText(it.title) }
        }
        scheduleRebuildSavedIndex()
        if (cleaned) save()
    }

    // Ключ песни считается через нормализацию текста — недёшево, а в списках он нужен десятки раз: запоминаем.
    private val keys = java.util.concurrent.ConcurrentHashMap<String, String>()
    private val looseKeys = java.util.concurrent.ConcurrentHashMap<String, String>()

    // ---------------- Сохранённые альбомы (♥ на странице альбома) ----------------

    private lateinit var albumsFile: File
    private val savedAlbums = mutableListOf<Album>()
    val albums: List<Album> get() = synchronized(savedAlbums) { savedAlbums.toList() }

    private fun albumKey(a: Album) = a.id?.toString() ?: (Match.base(a.title) + "|" + Match.norm(a.artist))
    fun isAlbumSaved(a: Album) = synchronized(savedAlbums) { savedAlbums.any { albumKey(it) == albumKey(a) } }

    fun toggleAlbum(a: Album): Boolean {
        val (was, snapshot) = synchronized(savedAlbums) {
            val w = savedAlbums.removeAll { albumKey(it) == albumKey(a) }
            if (!w) savedAlbums.add(0, a)
            w to savedAlbums.toList()
        }
        runCatching {
            val arr = JSONArray()
            snapshot.forEach { x ->
                arr.put(JSONObject().put("id", x.id ?: 0).put("title", x.title).put("artist", x.artist).put("cover", x.cover ?: "")
                    .put("year", x.year ?: "").put("explicit", x.explicit).put("type", x.type))
            }
            File(albumsFile.path + ".tmp").apply { writeText(arr.toString()) }.renameTo(albumsFile)
        }
        changed()
        return !was
    }

    private fun loadAlbums(ctx: Context) {
        albumsFile = File(ctx.filesDir, "library_albums.json")
        val arr = runCatching { JSONArray(albumsFile.readText()) }.getOrNull()
        val loaded = ArrayList<Album>()
        if (arr != null) {
        for (i in 0 until arr.length()) {
            val o = arr.getJSONObject(i)
            loaded += Album(o.optLong("id").takeIf { it > 0 }, o.optString("title"), o.optString("artist"), o.optString("cover").ifEmpty { null },
                o.optString("year").ifEmpty { null }, o.optBoolean("explicit"), o.optString("type", "album"))
        }
        }
        synchronized(savedAlbums) { savedAlbums.clear(); savedAlbums.addAll(loaded) }
    }

    // ---------------- Плейлисты (перенесённые из других сервисов) ----------------

    class Playlist(val id: String, val name: String, val source: String, val tracks: List<Track>, val created: Long)

    private lateinit var playlistsFile: File
    private val savedPlaylists = mutableListOf<Playlist>()
    val playlists: List<Playlist> get() = synchronized(savedPlaylists) { savedPlaylists.toList() }
    fun playlist(id: String) = synchronized(savedPlaylists) { savedPlaylists.firstOrNull { it.id == id } }

    fun addPlaylist(name: String, source: String, tracks: List<Track>): Playlist {
        val p = Playlist(java.util.UUID.randomUUID().toString(), name, source, tracks, System.currentTimeMillis())
        synchronized(savedPlaylists) { savedPlaylists.add(0, p) }; savePlaylists(); changed()
        return p
    }

    fun removePlaylist(id: String) {
        synchronized(savedPlaylists) { savedPlaylists.removeAll { it.id == id } }; savePlaylists(); changed()
    }

    private fun trackJson(t: Track) = JSONObject().put("title", t.title).put("artist", t.artist).put("duration", t.durationSec)
        .put("isrc", t.isrc ?: "").put("cover", t.cover ?: "").put("url", t.url ?: "").put("explicit", t.explicit)

    private fun trackFrom(o: JSONObject) = Track(o.getString("title"), o.optString("artist"), o.optInt("duration"),
        isrc = o.optString("isrc").ifEmpty { null }, cover = o.optString("cover").ifEmpty { null },
        url = o.optString("url").ifEmpty { null }, explicit = o.optBoolean("explicit"))

    private fun savePlaylists() = runCatching {
        val arr = JSONArray()
        val snapshot = synchronized(savedPlaylists) { savedPlaylists.toList() }
        snapshot.forEach { p ->
            arr.put(JSONObject().put("id", p.id).put("name", p.name).put("source", p.source).put("created", p.created)
                .put("tracks", JSONArray().apply { p.tracks.forEach { put(trackJson(it)) } }))
        }
        File(playlistsFile.path + ".tmp").apply { writeText(arr.toString()) }.renameTo(playlistsFile)
    }

    private fun loadPlaylists(ctx: Context) {
        playlistsFile = File(ctx.filesDir, "playlists.json")
        var broken = false
        val loaded = ArrayList<Playlist>()
        val arr = runCatching { JSONArray(playlistsFile.readText()) }.getOrNull()
        if (arr != null) {
        for (i in 0 until arr.length()) runCatching {
            val o = arr.getJSONObject(i)
            val ta = o.optJSONArray("tracks") ?: JSONArray()
            val tracks = (0 until ta.length()).map { trackFrom(ta.getJSONObject(it)) }
            val good = tracks.filterNot { Importer.isId(it.artist) }
            if (good.isNotEmpty()) loaded += Playlist(o.getString("id"), o.optString("name"), o.optString("source"), good, o.optLong("created"))
            if (good.size != tracks.size) broken = true
        }
        }
        synchronized(savedPlaylists) { savedPlaylists.clear(); savedPlaylists.addAll(loaded) }
        if (broken) savePlaylists()
    }

    /**
     * Много песен в «Любимое» разом (перенос медиатеки): без скачивания каждой — сотни загрузок
     * никому не нужны; скачать можно потом. Повторы пропускаются. Возвращает, сколько добавлено.
     */
    fun addFavorites(tracks: List<Track>): Int {
        val fresh = synchronized(saved) {
            val have = saved.map(::key).toHashSet()
            tracks.filter { have.add(key(it)) }.also {
                if (it.isNotEmpty()) {
                    saved.addAll(0, it)
                    savedVersion++
                    savedKeys = savedKeys + it.map(::key)
                    savedLoose = savedLoose + it.map(::looseKey)
                }
            }
        }
        if (fresh.isNotEmpty()) scheduleRebuildSavedIndex()
        save()
        changed()
        if (fresh.isNotEmpty()) runCatching { Warm.start(App.instance) } // перенесённое — тоже готовим заранее
        return fresh.size
    }

    /**
     * Обложки и длительность, найденные после переноса: заменяем песни (по ключу исходной) в «Любимом»
     * и в плейлисте [playlistId]. [pairs] — исходная → дополненная.
     */
    fun enriched(playlistId: String?, pairs: List<Pair<Track, Track>>) {
        val by = HashMap<String, Track>(); pairs.forEach { (old, new) -> if (old != new) by[key(old)] = new }
        if (by.isEmpty()) return
        synchronized(saved) { saved.replaceAll { by[key(it)] ?: it }; savedVersion++ }
        scheduleRebuildSavedIndex()
        save()
        playlistId?.let { id ->
            synchronized(savedPlaylists) {
                val i = savedPlaylists.indexOfFirst { it.id == id }
                if (i >= 0) savedPlaylists[i].let { p -> savedPlaylists[i] = Playlist(p.id, p.name, p.source, p.tracks.map { by[key(it)] ?: it }, p.created) }
            }
            runCatching { savePlaylists() }
        }
        changed()
    }

    /** Слушатели — это экраны: зовём их в главном потоке (перенос идёт в фоне). */
    private val main by lazy { android.os.Handler(android.os.Looper.getMainLooper()) }
    private fun changed() {
        if (android.os.Looper.myLooper() == android.os.Looper.getMainLooper()) listeners.forEach { it() }
        else main.post { listeners.forEach { it() } }
    }

    fun key(t: Track): String {
        val id = t.title + "\u0000" + t.artist
        return keys[id] ?: (Match.base(t.title) + "|" + Match.norm(t.artist)).also {
            if (keys.size > 100_000) keys.clear()
            keys[id] = it
        }
    }

    @Volatile private var savedKeys: Set<String> = emptySet()
    @Volatile private var savedLoose: Set<String> = emptySet()
    private var savedVersion = 0L
    private val indexIo = java.util.concurrent.Executors.newSingleThreadExecutor { r -> Thread(r, "library-index") }

    private fun scheduleRebuildSavedIndex() {
        indexIo.execute {
            val (ver, snapshot) = synchronized(saved) { savedVersion to saved.toList() }
            val sk = HashSet<String>(snapshot.size)
            val sl = HashSet<String>(snapshot.size)
            snapshot.forEach { t ->
                sk.add(key(t))
                sl.add(looseKey(t))
            }
            val uSk = java.util.Collections.unmodifiableSet(sk)
            val uSl = java.util.Collections.unmodifiableSet(sl)
            synchronized(saved) {
                if (savedVersion == ver) {
                    savedKeys = uSk
                    savedLoose = uSl
                }
            }
        }
    }

    /** Основной исполнитель (первый из «А, Б feat. В»). */
    private val artistSplit = Regex("""\s*(,|&|;| x | feat\.? | ft\.? | и )\s*""", RegexOption.IGNORE_CASE)
    fun mainArtist(a: String) = a.split(artistSplit).first().trim()

    /** Ключ попроще: название + основной исполнитель (совместные песни записаны в сервисах по-разному). */
    fun looseKey(t: Track): String {
        val id = t.title + "\u0000" + t.artist
        return looseKeys[id] ?: (Match.base(t.title) + "|" + Match.fold(Match.norm(mainArtist(t.artist)))).also {
            if (looseKeys.size > 100_000) looseKeys.clear()
            looseKeys[id] = it
        }
    }

    /** Есть ли среди исполнителей песни [artist]. */
    // Нормализация имени дорогая; на 1400 любимых в главном потоке это 1,4 с (журнал 20.11, страница исполнителя). Запоминаем.
    private val folded = java.util.concurrent.ConcurrentHashMap<String, String>()
    private fun fold(a: String) = folded.getOrPut(a) { Match.fold(Match.norm(a)) }
    private val splitCache = java.util.concurrent.ConcurrentHashMap<String, List<String>>()
    fun hasArtist(t: Track, artist: String): Boolean {
        val who = fold(artist)
        return splitCache.getOrPut(t.artist) { t.artist.split(artistSplit).map { fold(it.trim()) } }.any { it == who }
    }

    val favorites: List<Track> get() = synchronized(saved) { saved.toList() }

    fun isSaved(t: Track): Boolean {
        val sk = savedKeys
        val sl = savedLoose
        if (sk.isEmpty() && sl.isEmpty()) return false
        return sk.contains(key(t)) || sl.contains(looseKey(t))
    }

    /** Добавить/убрать из «Избранного». Возвращает, сохранена ли песня теперь. */
    fun toggle(t: Track): Boolean {
        val k = key(t)
        val lk = looseKey(t)
        val was = synchronized(saved) {
            val removed = saved.removeAll { key(it) == k || looseKey(it) == lk }
            if (!removed) saved.add(0, t)
            savedVersion++
            if (removed) {
                savedKeys = savedKeys - k
                savedLoose = savedLoose - lk
            } else {
                savedKeys = savedKeys + k
                savedLoose = savedLoose + lk
            }
            removed
        }
        scheduleRebuildSavedIndex()
        save()
        changed()
        return !was
    }

    /**
     * ♥ — это «в мою медиатеку»: песня сохраняется на телефон.
     * Уже звучала — копируем из памяти прослушанного (мгновенно), иначе скачиваем.
     * Возвращает, понравилась ли песня теперь.
     */
    fun like(ctx: Context, t: Track, pageUrl: String? = null, sourceUrl: String? = null): Boolean {
        val now = toggle(t)
        if (!now || !Settings.saveLiked(ctx) || localFor(t) != null || downloading(t)) return now
        val app = ctx.applicationContext
        if (MediaCache.has(t)) {
            // Из памяти — в «Загрузки» как обычная загрузка, без повторного скачивания.
            val job = Jobs.create(pageUrl ?: sourceUrl ?: t.url ?: "memory:" + key(t), Format.MP3, t.label)
            Jobs.update(job.id, save = true) { title = t.label; status = Status.RUNNING; detail = "Сохраняю из памяти…"; coverUrl = t.cover }
            Thread {
                val tmp = File(app.cacheDir, "like").apply { mkdirs() }
                val copy = runCatching { MediaCache.copyOf(t, tmp) }.getOrNull()
                val saved = copy?.let { f -> runCatching { Storage.publish(app, f) }.getOrNull()?.let { (uri, mime) -> SavedFile(uri.toString(), f.name, mime) } }
                Jobs.update(job.id, save = true) {
                    if (saved != null) { status = Status.DONE; files = listOf(saved); progress = 100f; detail = saved.name }
                    else { status = Status.FAILED; error = "Не получилось сохранить из памяти" }
                }
            }.start()
        } else {
            val url = pageUrl ?: sourceUrl ?: t.url ?: return now
            DownloadService.enqueue(app, url, Format.MP3, t.label)
        }
        return now
    }

    /** Песня уже качается (поставили ♥ или нажали «Скачать»). */
    // Раньше на каждую строку списка перебирались все загрузки и каждая заново разбирала название — журнал 20.11:
    // «ЗАВИСАНИЕ ИНТЕРФЕЙСА 7,3 с: Job.track ← Library.downloading ← Rows.statusOf». Теперь набор считается раз в 1,5 с.
    @Volatile private var dlKeys: Set<String>? = null
    @Volatile private var dlAt = 0L
    fun downloading(t: Track): Boolean {
        val now = android.os.SystemClock.uptimeMillis()
        var set = dlKeys
        if (set == null || now - dlAt > 1500) {
            set = Jobs.all.filter { it.active && it.kind == Kind.MUSIC }.map { key(it.track()) }.toHashSet()
            dlKeys = set; dlAt = now
        }
        return set.isNotEmpty() && key(t) in set
    }

    fun listen(l: () -> Unit) { listeners += l }
    fun unlisten(l: () -> Unit) { listeners -= l }

    /** Скачанная музыка: песня + файл. Новые — первыми. */
    fun downloaded(): List<Pair<Track, SavedFile>> = synchronized(this) { refreshDownloaded(); dl }

    /** Скачанный файл этой песни, если есть. */
    fun localFor(t: Track): SavedFile? = synchronized(this) { refreshDownloaded(); dlByKey[key(t)] }

    // Список скачанного пересчитываем, только когда изменились загрузки (раньше — для каждой строки списка).
    private var dlVersion = -1
    private var dl: List<Pair<Track, SavedFile>> = emptyList()
    private var dlByKey: Map<String, SavedFile> = emptyMap()

    private fun refreshDownloaded() {
        val v = Jobs.version
        if (v == dlVersion) return
        dl = buildDownloaded()
        dlByKey = HashMap<String, SavedFile>().apply { dl.asReversed().forEach { (t, f) -> put(key(t), f) } } // новые — главнее
        dlVersion = v
    }

    private fun buildDownloaded(): List<Pair<Track, SavedFile>> =
        Jobs.all.filter { it.status == Status.DONE && it.kind == Kind.MUSIC }.flatMap { j ->
            j.files.filter { it.mime.startsWith("audio") }.map { f ->
                val name = f.name.substringBeforeLast('.').replace(Regex("""\s*\[[^\]]+]$"""), "")
                val parts = name.split(" — ", limit = 2)
                val t = when {
                    parts.size == 2 -> Track(parts[1].trim(), parts[0].trim())
                    j.files.size == 1 -> j.track()
                    else -> Track(name, "")
                }
                t.copy(cover = t.cover ?: j.coverUrl) to f
            }
        }


    @Synchronized private fun save() {
        val arr = JSONArray()
        favorites.forEach { t ->
            arr.put(JSONObject().put("title", t.title).put("artist", t.artist).put("duration", t.durationSec)
                .put("isrc", t.isrc ?: "").put("cover", t.cover ?: "").put("url", t.url ?: "").put("preview", t.preview ?: ""))
        }
        runCatching { File(file.path + ".tmp").apply { writeText(arr.toString()) }.renameTo(file) }
    }
}
