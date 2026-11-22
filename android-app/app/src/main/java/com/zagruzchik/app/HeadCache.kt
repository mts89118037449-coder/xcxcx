package com.zagruzchik.app

import android.content.Context
import android.net.Uri
import androidx.media3.common.C
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DataSource
import androidx.media3.datasource.DataSpec
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.TransferListener
import org.json.JSONObject
import java.io.File
import java.io.IOException
import java.io.RandomAccessFile
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.Future
import java.util.concurrent.TimeUnit

/**
 * Мгновенный старт: начало полной версии каждой песни (первые ~256 КБ того же файла, что будет играть)
 * заранее лежит на телефоне. По нажатию проигрыватель сразу читает его с телефона, а ссылка на остальное
 * берётся, пока звучат первые секунды, — дальше тот же файл продолжается из сети с нужного байта.
 * Никаких фрагментов и стыков: это одна и та же запись с первой секунды.
 */
object HeadCache {
    const val HEAD = 256 * 1024L
    private const val LIMIT = 1024L * 1024 * 1024 // всего под начала песен — до 1 ГБ (≈4000 песен), старые вытесняются

    class Entry(
        val id: String, val key: String, val title: String, val artist: String, val durationSec: Int,
        /** Откуда песня (как в памяти источников): zaycev:…, tg:…, ссылка на страницу. */
        val where: String, val label: String, val total: Long, val headLen: Long, val ext: String, @Volatile var used: Long,
    ) {
        val file: File get() = File(dir, "$id.head")
        val track: Track get() = Track(title, artist, durationSec)
        val uri: Uri get() = Uri.parse("aura://head/$id.$ext")
    }

    private lateinit var dir: File
    private val byKey = ConcurrentHashMap<String, Entry>()
    private val byId = ConcurrentHashMap<String, Entry>()
    private val pool = Executors.newFixedThreadPool(2)
    private val saver = Executors.newSingleThreadScheduledExecutor()
    @Volatile private var dirty = false

    fun init(ctx: Context) {
        dir = File(ctx.filesDir, "heads").apply { mkdirs() }
        runCatching {
            val arr = org.json.JSONArray(File(dir, "index.json").readText())
            for (i in 0 until arr.length()) {
                val o = arr.getJSONObject(i)
                val e = Entry(o.getString("id"), o.getString("key"), o.getString("title"), o.optString("artist"), o.optInt("duration"),
                    o.getString("where"), o.optString("label"), o.getLong("total"), o.getLong("head"), o.optString("ext", "mp3"), o.optLong("used"))
                if (e.file.length() == e.headLen) { byKey[e.key] = e; byId[e.id] = e }
            }
        }
        saver.scheduleWithFixedDelay({ if (dirty) { dirty = false; runCatching { save() } } }, 5, 5, TimeUnit.SECONDS)
    }

    val count get() = byKey.size

    fun entry(t: Track): Entry? {
        if (!::dir.isInitialized) return null
        val e = byKey[Library.key(t)] ?: return null
        // За песней закреплён другой источник — начало от прежнего не годится.
        val pin = Streams.chosen(t)
        if (pin != null && e.where != pin) { drop(t); return null }
        return e
    }
    fun byId(id: String?): Entry? = id?.substringBeforeLast('.')?.let { byId[it] }
    fun has(t: Track) = entry(t) != null

    fun drop(t: Track) {
        if (!::dir.isInitialized) return
        byKey.remove(Library.key(t))?.let { byId.remove(it.id); it.file.delete(); dirty = true }
    }

    /** Убрать сохранённые начала, взятые из источников, подходящих под условие. */
    fun dropWhere(match: (String) -> Boolean) {
        if (!::dir.isInitialized) return
        byKey.values.filter { match(it.where) }.forEach { e -> byKey.remove(e.key); byId.remove(e.id); e.file.delete(); dirty = true }
    }

    /** Сохранить начало в фоне (песня на экране, только что найдена). */
    fun storeAsync(t: Track, s: StreamInfo) {
        if (!::dir.isInitialized || has(t) || !storable(s)) return
        pool.execute { runCatching { store(t, s) } }
    }

    private fun storable(s: StreamInfo) = !s.url.contains(".m3u8") && !s.url.startsWith("file:") && s.url.startsWith("http")

    /** Скачать и сохранить начало этой записи. true — сохранено (или уже было). */
    fun store(t: Track, s: StreamInfo): Boolean {
        if (!::dir.isInitialized) return false
        val key = Library.key(t)
        if (byKey.containsKey(key)) return true
        if (!storable(s) || Streams.detoured(t)) return false
        val where = Streams.whereOf(t) ?: return false // без памяти источника продолжить ту же запись не получится
        val id = java.util.UUID.nameUUIDFromBytes((key + "|" + where).toByteArray()).toString().replace("-", "")
        val c = Net.open(URL(s.url))
        c.connectTimeout = 8000; c.readTimeout = 15000
        c.setRequestProperty("User-Agent", Http.DESKTOP_UA)
        c.setRequestProperty("Range", "bytes=0-${HEAD - 1}")
        try {
            val code = c.responseCode
            val total = when (code) {
                206 -> c.getHeaderField("Content-Range")?.substringAfter('/')?.toLongOrNull() ?: return false
                200 -> c.contentLengthLong.takeIf { it > 0 } ?: return false
                else -> return false
            }
            val tmp = File(dir, "$id.tmp")
            var n = 0L
            c.inputStream.use { ins -> tmp.outputStream().use { out ->
                val buf = ByteArray(32 * 1024)
                while (n < HEAD) { val r = ins.read(buf, 0, minOf(buf.size.toLong(), HEAD - n).toInt()); if (r < 0) break; out.write(buf, 0, r); n += r }
            } }
            if (n < minOf(HEAD, total)) { tmp.delete(); return false }
            val type = c.contentType.orEmpty()
            val ext = when {
                type.contains("webm") || type.contains("opus") -> "webm"
                type.contains("mp4") || type.contains("m4a") || type.contains("aac") -> "m4a"
                type.contains("flac") -> "flac"
                type.contains("ogg") -> "ogg"
                else -> "mp3"
            }
            val e = Entry(id, key, t.title, t.artist, t.durationSec, where, s.source, total, n, ext, System.currentTimeMillis())
            tmp.renameTo(e.file)
            byKey[key] = e; byId[id] = e; dirty = true
            trim()
            return true
        } finally { c.disconnect() }
    }

    private fun trim() {
        var sum = byKey.values.sumOf { it.headLen }
        if (sum <= LIMIT) return
        for (e in byKey.values.sortedBy { it.used }) {
            if (sum <= LIMIT * 9 / 10) break
            byKey.remove(e.key); byId.remove(e.id); e.file.delete(); sum -= e.headLen
        }
    }

    private fun save() {
        val arr = org.json.JSONArray()
        byKey.values.forEach { e ->
            arr.put(JSONObject().put("id", e.id).put("key", e.key).put("title", e.title).put("artist", e.artist).put("duration", e.durationSec)
                .put("where", e.where).put("label", e.label).put("total", e.total).put("head", e.headLen).put("ext", e.ext).put("used", e.used))
        }
        File(dir, "index.json.tmp").apply { writeText(arr.toString()) }.renameTo(File(dir, "index.json"))
    }

    // ---------------- Продолжение из сети ----------------

    private val tails = ConcurrentHashMap<String, Pair<Long, Future<String>>>()

    /** Начать готовить ссылку на продолжение (если ещё не готовится). */
    fun resolveAsync(e: Entry): Future<String> {
        e.used = System.currentTimeMillis(); dirty = true
        tails[e.id]?.let { (time, f) -> if (System.currentTimeMillis() - time < 8 * 60 * 1000L && !(f.isDone && runCatching { f.get() }.isFailure)) return f }
        val f = pool2.submit<String> {
            val t = e.track
            // Та же запись, что и начало: тот же источник и тот же размер файла.
            val s = Streams.streamFrom(t, e.where, e.total) ?: throw IOException("Источник больше не отдаёт эту песню")
            val total = totalOf(s.url, e.headLen)
            if (total != e.total) throw IOException("Запись у источника изменилась")
            runCatching { MediaCache.store(App.instance, t, s) } // целиком — в память: в следующий раз без сети
            s.url
        }
        tails[e.id] = System.currentTimeMillis() to f
        return f
    }
    private val pool2 = Executors.newCachedThreadPool()

    private fun totalOf(url: String, from: Long): Long {
        val c = Net.open(URL(url))
        c.connectTimeout = 6000; c.readTimeout = 6000
        c.setRequestProperty("User-Agent", Http.DESKTOP_UA)
        c.setRequestProperty("Range", "bytes=$from-${from + 1}")
        try {
            if (c.responseCode != 206) return -1
            return c.getHeaderField("Content-Range")?.substringAfter('/')?.toLongOrNull() ?: -1
        } finally { c.disconnect() }
    }

    fun awaitTail(e: Entry): String = try {
        resolveAsync(e).get(40, TimeUnit.SECONDS)
    } catch (x: java.util.concurrent.ExecutionException) {
        throw IOException(x.cause?.message ?: "Не получилось продолжить песню", x.cause)
    } catch (x: Exception) {
        throw IOException("Не получилось продолжить песню: ${x.message}", x)
    }
}

/** Источник данных проигрывателя: «aura://head/…» — начало с телефона, продолжение из сети; всё остальное — как обычно. */
@UnstableApi
class AuraDataSourceFactory(ctx: Context) : DataSource.Factory {
    private val base = DefaultDataSource.Factory(ctx)
    override fun createDataSource(): DataSource = AuraDataSource(base)
}

/**
 * Чтение кусками по 1 МБ. YouTube режет скорость (≈30 КБ/с), если просить файл «до конца» одним запросом,
 * а ограниченные по размеру запросы отдаёт на полной скорости — так звук подгружается с запасом и не обрывается.
 */
@UnstableApi
private class Chunked(private val base: DataSource.Factory, private val listeners: List<TransferListener>) {
    private var ds: DataSource? = null
    private var uri: Uri? = null
    private var pos = 0L
    private var remaining = -1L // сколько ещё отдать; -1 — пока неизвестно
    private var chunkLeft = 0L
    var headers: Map<String, List<String>> = emptyMap(); private set

    fun open(uri: Uri, position: Long, length: Long): Long {
        this.uri = uri; pos = position
        remaining = if (length != C.LENGTH_UNSET.toLong()) length else -1L
        val total = openChunk()
        if (remaining < 0) remaining = if (total > 0) total - position else C.LENGTH_UNSET.toLong()
        return remaining
    }

    /** Открыть следующий кусок; возвращает полный размер файла (из ответа сервера) или -1. */
    private fun openChunk(): Long {
        runCatching { ds?.close() }
        // Ссылка YouTube привязана к адресу, с которого её взяли: если брали мимо VPN — и читаем мимо VPN.
        val d = if (Net.youtubeDirect) NetDataSource() else base.createDataSource().also { x -> listeners.forEach(x::addTransferListener) }
        val want = if (remaining > 0) minOf(CHUNK, remaining) else CHUNK
        d.open(DataSpec.Builder().setUri(uri!!).setPosition(pos).setLength(want).build())
        ds = d
        headers = d.responseHeaders
        val total = headers.entries.firstOrNull { it.key.equals("Content-Range", true) }?.value?.firstOrNull()?.substringAfter('/')?.toLongOrNull() ?: -1L
        chunkLeft = if (total > 0) minOf(want, total - pos) else want
        return total
    }

    fun read(buffer: ByteArray, offset: Int, length: Int): Int {
        if (length == 0) return 0
        if (remaining == 0L) return C.RESULT_END_OF_INPUT
        if (chunkLeft <= 0L) openChunk()
        var want = minOf(length.toLong(), chunkLeft)
        if (remaining > 0) want = minOf(want, remaining)
        val n = ds!!.read(buffer, offset, want.toInt())
        if (n == C.RESULT_END_OF_INPUT) {
            // Кусок кончился раньше ожидаемого: файл короче, чем думали, — это конец.
            if (remaining > 0 && chunkLeft > 0) { remaining = 0 }
            return C.RESULT_END_OF_INPUT
        }
        pos += n; chunkLeft -= n
        if (remaining > 0) remaining -= n
        return n
    }

    fun close() { runCatching { ds?.close() }; ds = null }

    companion object {
        const val CHUNK = 1024 * 1024L
        fun fits(uri: Uri) = uri.host?.endsWith("googlevideo.com") == true
    }
}

@UnstableApi
private class AuraDataSource(private val base: DataSource.Factory) : DataSource {
    private val listeners = mutableListOf<TransferListener>()
    private var plain: DataSource? = null      // обычная ссылка/файл
    private var chunked: Chunked? = null       // YouTube — кусками (и обычная ссылка, и продолжение песни)
    private var upstream: DataSource? = null   // продолжение песни из сети
    private var file: RandomAccessFile? = null
    private var entry: HeadCache.Entry? = null
    private var uri: Uri? = null
    private var pos = 0L
    private var remaining = 0L
    private var started = false
    private var spec: DataSpec? = null

    override fun addTransferListener(transferListener: TransferListener) { listeners += transferListener }
    private fun bytesTransferred(n: Int) { val d = spec ?: return; listeners.forEach { it.onBytesTransferred(this, d, true, n) } }

    override fun open(dataSpec: DataSpec): Long {
        uri = dataSpec.uri
        if (dataSpec.uri.scheme != "aura") {
            if (Chunked.fits(dataSpec.uri) && dataSpec.httpBody == null) {
                val c = Chunked(base, listeners)
                chunked = c
                return c.open(dataSpec.uri, dataSpec.position, dataSpec.length)
            }
            val d = base.createDataSource().also { ds -> listeners.forEach(ds::addTransferListener) }
            plain = d
            return d.open(dataSpec)
        }
        spec = dataSpec
        listeners.forEach { it.onTransferInitializing(this, dataSpec, true) }
        val e = HeadCache.byId(dataSpec.uri.lastPathSegment) ?: throw IOException("Начало песни не найдено")
        entry = e
        pos = dataSpec.position
        if (pos > e.total) throw androidx.media3.datasource.DataSourceException(androidx.media3.common.PlaybackException.ERROR_CODE_IO_READ_POSITION_OUT_OF_RANGE)
        remaining = if (dataSpec.length != C.LENGTH_UNSET.toLong()) minOf(dataSpec.length, e.total - pos) else e.total - pos
        HeadCache.resolveAsync(e) // ссылка на продолжение готовится, пока играет начало
        if (pos < e.headLen) file = RandomAccessFile(e.file, "r").also { it.seek(pos) }
        started = true
        listeners.forEach { it.onTransferStart(this, dataSpec, true) }
        return remaining
    }

    override fun read(buffer: ByteArray, offset: Int, length: Int): Int {
        plain?.let { return it.read(buffer, offset, length) }
        if (entry == null) chunked?.let { return it.read(buffer, offset, length) }
        if (length == 0) return 0
        if (remaining <= 0L) return C.RESULT_END_OF_INPUT
        val e = entry ?: throw IOException("Источник не открыт")
        if (pos < e.headLen) {
            val n = file?.read(buffer, offset, minOf(length.toLong(), e.headLen - pos, remaining).toInt()) ?: -1
            if (n > 0) { pos += n; remaining -= n; bytesTransferred(n); return n }
        }
        if (upstream == null && chunked == null) {
            val url = Uri.parse(HeadCache.awaitTail(e))
            if (Chunked.fits(url)) chunked = Chunked(base, listeners).also { it.open(url, pos, remaining) }
            else upstream = base.createDataSource().also { it.open(DataSpec.Builder().setUri(url).setPosition(pos).setLength(remaining).build()) }
        }
        val want = minOf(length.toLong(), remaining).toInt()
        val n = chunked?.read(buffer, offset, want) ?: upstream!!.read(buffer, offset, want)
        if (n == C.RESULT_END_OF_INPUT) return n
        pos += n; remaining -= n; bytesTransferred(n)
        return n
    }

    override fun getUri(): Uri? = plain?.uri ?: uri

    override fun getResponseHeaders(): Map<String, List<String>> = plain?.responseHeaders ?: chunked?.headers ?: emptyMap()

    override fun close() {
        try { plain?.close() } finally {
            plain = null
            runCatching { file?.close() }; file = null
            runCatching { upstream?.close() }; upstream = null
            runCatching { chunked?.close() }; chunked = null
            entry = null
            if (started) { started = false; spec?.let { d -> listeners.forEach { it.onTransferEnd(this, d, true) } } }
        }
    }
}
