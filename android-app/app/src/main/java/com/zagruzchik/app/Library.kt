package com.zagruzchik.app

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/**
 * Библиотека: сохранённые песни (♥) и скачанная музыка.
 * Сохранённые играют из интернета; если такая песня уже скачана — с телефона, мгновенно и без сети.
 */
object Library {
    private lateinit var file: File
    private val saved = mutableListOf<Track>()
    private val listeners = mutableSetOf<() -> Unit>()

    fun init(ctx: Context) {
        loadAlbums(ctx)
        file = File(ctx.filesDir, "library.json")
        saved.clear()
        savedKeys = null
        val arr = runCatching { JSONArray(file.readText()) }.getOrNull() ?: return
        for (i in 0 until arr.length()) {
            val o = arr.getJSONObject(i)
            saved += Track(
                o.getString("title"), o.optString("artist"), o.optInt("duration"),
                isrc = o.optString("isrc").ifEmpty { null }, cover = o.optString("cover").ifEmpty { null },
                url = o.optString("url").ifEmpty { null }, preview = o.optString("preview").ifEmpty { null },
            )
        }
    }

    // Ключ песни считается через нормализацию текста — недёшево, а в списках он нужен десятки раз: запоминаем.
    private val keys = java.util.concurrent.ConcurrentHashMap<Track, String>()

    // ---------------- Сохранённые альбомы (♥ на странице альбома) ----------------

    private lateinit var albumsFile: File
    private val savedAlbums = mutableListOf<Album>()
    val albums: List<Album> get() = savedAlbums.toList()

    private fun albumKey(a: Album) = a.id?.toString() ?: (Match.base(a.title) + "|" + Match.norm(a.artist))
    fun isAlbumSaved(a: Album) = savedAlbums.any { albumKey(it) == albumKey(a) }

    fun toggleAlbum(a: Album): Boolean {
        val was = savedAlbums.removeAll { albumKey(it) == albumKey(a) }
        if (!was) savedAlbums.add(0, a)
        runCatching {
            val arr = JSONArray()
            savedAlbums.forEach { x ->
                arr.put(JSONObject().put("id", x.id ?: 0).put("title", x.title).put("artist", x.artist).put("cover", x.cover ?: "")
                    .put("year", x.year ?: "").put("explicit", x.explicit).put("type", x.type))
            }
            File(albumsFile.path + ".tmp").apply { writeText(arr.toString()) }.renameTo(albumsFile)
        }
        listeners.toList().forEach { it() }
        return !was
    }

    private fun loadAlbums(ctx: Context) {
        albumsFile = File(ctx.filesDir, "library_albums.json")
        savedAlbums.clear()
        val arr = runCatching { JSONArray(albumsFile.readText()) }.getOrNull() ?: return
        for (i in 0 until arr.length()) {
            val o = arr.getJSONObject(i)
            savedAlbums += Album(o.optLong("id").takeIf { it > 0 }, o.optString("title"), o.optString("artist"), o.optString("cover").ifEmpty { null },
                o.optString("year").ifEmpty { null }, o.optBoolean("explicit"), o.optString("type", "album"))
        }
    }

    fun key(t: Track): String = keys[t] ?: (Match.base(t.title) + "|" + Match.norm(t.artist)).also {
        if (keys.size > 5000) keys.clear()
        keys[t] = it
    }

    @Volatile private var savedKeys: Set<String>? = null

    val favorites: List<Track> get() = saved.toList()

    fun isSaved(t: Track): Boolean = (savedKeys ?: saved.toList().map(::key).toHashSet().also { savedKeys = it }).contains(key(t))

    /** Добавить/убрать из «Избранного». Возвращает, сохранена ли песня теперь. */
    fun toggle(t: Track): Boolean {
        val k = key(t)
        val was = saved.removeAll { key(it) == k }
        if (!was) saved.add(0, t)
        savedKeys = null
        save()
        listeners.toList().forEach { it() }
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
    fun downloading(t: Track): Boolean = Jobs.all.filter { it.active && it.kind == Kind.MUSIC }.let { a -> a.isNotEmpty() && a.any { key(it.track()) == key(t) } }

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


    private fun save() {
        val arr = JSONArray()
        saved.forEach { t ->
            arr.put(JSONObject().put("title", t.title).put("artist", t.artist).put("duration", t.durationSec)
                .put("isrc", t.isrc ?: "").put("cover", t.cover ?: "").put("url", t.url ?: "").put("preview", t.preview ?: ""))
        }
        runCatching { File(file.path + ".tmp").apply { writeText(arr.toString()) }.renameTo(file) }
    }
}
