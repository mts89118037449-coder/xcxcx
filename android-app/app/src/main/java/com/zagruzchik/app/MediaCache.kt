package com.zagruzchik.app

import android.content.Context
import com.yausername.youtubedl_android.YoutubeDL
import com.yausername.youtubedl_android.YoutubeDLRequest
import org.json.JSONObject
import java.io.File
import java.util.concurrent.Executors

/**
 * Память прослушанного: всё, что звучало из интернета, тихо сохраняется в приложение,
 * чтобы в следующий раз играть мгновенно и без интернета. Старое удаляется, когда память
 * больше лимита из Настроек (по умолчанию 2 ГБ).
 */
object MediaCache {
    private lateinit var dir: File
    private lateinit var indexFile: File
    private val index = LinkedHashMap<String, JSONObject>() // ключ песни → {file, size, used, title, artist, cover}
    private val pending = mutableSetOf<String>()
    private val worker = Executors.newSingleThreadExecutor()

    fun init(ctx: Context) {
        dir = File(ctx.filesDir, "media_cache").apply { mkdirs() }
        indexFile = File(dir, "index.json")
        runCatching { JSONObject(indexFile.readText()) }.getOrNull()?.let { o ->
            o.keys().forEach { k -> index[k] = o.getJSONObject(k) }
        }
        index.entries.removeAll { !File(dir, it.value.optString("file")).exists() }
    }

    @Synchronized
    fun fileFor(t: Track): File? {
        val e = index[Library.key(t)] ?: return null
        val f = File(dir, e.optString("file"))
        if (!f.exists()) return null
        e.put("used", System.currentTimeMillis())
        save()
        return f
    }

    fun has(t: Track) = fileFor(t) != null

    val sizeBytes: Long @Synchronized get() = index.values.sumOf { it.optLong("size") }

    /** Сохранить песню в память по странице/ссылке, откуда она звучала. Фоном, по одной. */
    fun store(ctx: Context, t: Track, url: String) {
        if (Settings.cacheLimitMb(ctx) <= 0) return
        val key = Library.key(t)
        synchronized(this) { if (index.containsKey(key) || !pending.add(key)) return }
        worker.execute {
            try {
                App.awaitReadyOrNull() ?: return@execute
                val name = key.hashCode().toUInt().toString(16)
                val r = YoutubeDLRequest(url).apply {
                    addOption("--no-playlist")
                    addOption("--no-warnings")
                    addOption("-f", "bestaudio/best")
                    addOption("-N", "4")
                    addOption("-o", File(dir, "$name.%(ext)s").absolutePath)
                }
                runCatching { YoutubeDL.getInstance().execute(r) }
                val f = dir.listFiles().orEmpty().firstOrNull { it.name.startsWith("$name.") && !it.name.endsWith(".part") && !it.name.endsWith(".ytdl") }
                    ?: return@execute
                synchronized(this) {
                    index[key] = JSONObject().put("file", f.name).put("size", f.length()).put("used", System.currentTimeMillis())
                        .put("title", t.title).put("artist", t.artist).put("cover", t.cover ?: "")
                    trim(ctx)
                    save()
                }
            } finally {
                synchronized(this) { pending -= key }
            }
        }
    }

    /** Скопировать песню из памяти — например, чтобы сохранить её в «Загрузки» без повторного скачивания. */
    fun copyOf(t: Track, to: File): File? {
        val f = fileFor(t) ?: return null
        val out = File(to, "${t.label.replace(Regex("""[\\/:*?"<>|]"""), "_").take(120)}.${f.extension}")
        f.copyTo(out, overwrite = true)
        return out
    }

    @Synchronized
    fun clear() {
        index.values.forEach { File(dir, it.optString("file")).delete() }
        index.clear()
        save()
    }

    /** Удаляем давно не звучавшее, пока не уложимся в лимит. */
    private fun trim(ctx: Context) {
        val limit = Settings.cacheLimitMb(ctx) * 1024L * 1024L
        while (sizeBytes > limit && index.isNotEmpty()) {
            val oldest = index.entries.minByOrNull { it.value.optLong("used") } ?: break
            File(dir, oldest.value.optString("file")).delete()
            index.remove(oldest.key)
        }
    }

    private fun save() {
        val o = JSONObject()
        index.forEach { (k, v) -> o.put(k, v) }
        runCatching { File(indexFile.path + ".tmp").apply { writeText(o.toString()) }.renameTo(indexFile) }
    }
}
