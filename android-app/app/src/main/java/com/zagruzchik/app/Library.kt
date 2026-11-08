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
