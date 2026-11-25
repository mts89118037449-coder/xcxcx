package com.zagruzchik.app

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.concurrent.CopyOnWriteArraySet
import java.util.concurrent.Executors

/** История: что слушали и смотрели (новое — первым). Отсюда всё включается снова — мгновенно, если есть в памяти. */
object History {
    class Entry(
        val track: Track,
        val kind: Kind,
        val pageUrl: String?,
        val sourceUrl: String?,
        val local: SavedFile?,
        val time: Long,
    )

    private lateinit var file: File
    private val list = mutableListOf<Entry>()
    private val listeners = CopyOnWriteArraySet<() -> Unit>()
    private val io = Executors.newSingleThreadExecutor { r -> Thread(r, "history-io") }
    private const val MAX = 200

    fun init(ctx: Context) {
        file = File(ctx.filesDir, "history.json")
        val arr = runCatching { JSONArray(file.readText()) }.getOrNull() ?: return
        val loaded = ArrayList<Entry>(arr.length())
        for (i in 0 until arr.length()) {
            val o = arr.getJSONObject(i)
            loaded += Entry(
                Track(o.getString("title"), o.optString("artist"), cover = o.optString("cover").ifEmpty { null }),
                runCatching { Kind.valueOf(o.getString("kind")) }.getOrDefault(Kind.MUSIC),
                o.optString("page").ifEmpty { null }, o.optString("source").ifEmpty { null },
                o.optString("localUri").takeIf { it.isNotEmpty() }?.let { SavedFile(it, o.optString("localName"), o.optString("localMime")) },
                o.optLong("time"),
            )
        }
        synchronized(list) { list.clear(); list.addAll(loaded) }
    }

    val all: List<Entry> get() = synchronized(list) { list.toList() }

    fun add(e: Entry) {
        val k = Library.key(e.track)
        val snapshot = synchronized(list) {
            list.removeAll { Library.key(it.track) == k && it.kind == e.kind }
            list.add(0, e)
            while (list.size > MAX) list.removeAt(list.lastIndex)
            list.toList()
        }
        save(snapshot)
        listeners.forEach { it() }
    }

    fun clear() {
        synchronized(list) { list.clear() }
        save(emptyList())
        listeners.forEach { it() }
    }

    fun listen(l: () -> Unit) { listeners += l }
    fun unlisten(l: () -> Unit) { listeners -= l }

    private fun save(snapshot: List<Entry>) {
        val arr = JSONArray()
        snapshot.forEach { e ->
            arr.put(JSONObject().put("title", e.track.title).put("artist", e.track.artist).put("cover", e.track.cover ?: "")
                .put("kind", e.kind.name).put("page", e.pageUrl ?: "").put("source", e.sourceUrl ?: "")
                .put("localUri", e.local?.uri ?: "").put("localName", e.local?.name ?: "").put("localMime", e.local?.mime ?: "")
                .put("time", e.time))
        }
        val json = arr.toString()
        io.execute { runCatching { File(file.path + ".tmp").apply { writeText(json) }.renameTo(file) } }
    }
}
