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
        file = File(ctx.filesDir, "library.json")
        saved.clear()
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

    fun key(t: Track) = Match.base(t.title) + "|" + Match.norm(t.artist)

    val favorites: List<Track> get() = saved.toList()

    fun isSaved(t: Track) = saved.any { key(it) == key(t) }

    /** Добавить/убрать из «Избранного». Возвращает, сохранена ли песня теперь. */
    fun toggle(t: Track): Boolean {
        val k = key(t)
        val was = saved.removeAll { key(it) == k }
        if (!was) saved.add(0, t)
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
    fun downloading(t: Track): Boolean = Jobs.all.any { it.active && it.kind == Kind.MUSIC && key(it.track()) == key(t) }

    fun listen(l: () -> Unit) { listeners += l }
    fun unlisten(l: () -> Unit) { listeners -= l }

    /** Скачанная музыка: песня + файл. Новые — первыми. */
    fun downloaded(): List<Pair<Track, SavedFile>> =
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

    /** Скачанный файл этой песни, если есть. */
    fun localFor(t: Track): SavedFile? = downloaded().firstOrNull { key(it.first) == key(t) }?.second

    private fun save() {
        val arr = JSONArray()
        saved.forEach { t ->
            arr.put(JSONObject().put("title", t.title).put("artist", t.artist).put("duration", t.durationSec)
                .put("isrc", t.isrc ?: "").put("cover", t.cover ?: "").put("url", t.url ?: "").put("preview", t.preview ?: ""))
        }
        runCatching { File(file.path + ".tmp").apply { writeText(arr.toString()) }.renameTo(file) }
    }
}
