package com.zagruzchik.app

import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedWriter
import java.io.File
import java.util.concurrent.CompletableFuture
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import java.util.concurrent.TimeoutException
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicLong

/**
 * Постоянно запущенный yt-dlp. Обычный запуск — это каждый раз новый Python (3–4 с только на старт),
 * а здесь Python и yt-dlp загружены один раз, и поиск/ссылка на звук отвечают примерно за секунду.
 * Запросы и ответы — строки JSON. Если процесс упал или завис — перезапускаем; если не смог
 * запуститься — вызывающий код возвращается к обычному запуску yt-dlp.
 */
object YtdlpDaemon {
    private const val TAG = "YtdlpDaemon"

    private class Proc(val p: Process, val stdin: BufferedWriter) {
        val pending = ConcurrentHashMap<Long, CompletableFuture<JSONObject>>()
    }

    @Volatile private var proc: Proc? = null
    private val ids = AtomicLong()
    private val timeouts = AtomicInteger()
    @Volatile private var brokenUntil = 0L

    /** Запустить заранее, чтобы первый поиск не ждал старта Python. */
    fun warmUp() { Thread({ runCatching { ensure() } }, "ytd-warmup").start() }

    /** Перезапуск — после обновления yt-dlp, чтобы подхватить новую версию. */
    fun restart() = synchronized(this) { stop() }

    private fun stop() {
        proc?.let { old ->
            old.p.destroy()
            old.pending.values.forEach { it.completeExceptionally(IllegalStateException("restart")) }
            old.pending.clear()
        }
        proc = null
    }

    /** Процесс жив — или поднимаем его. null — не получилось (тогда обычный yt-dlp). */
    private fun ensure(): Proc? = synchronized(this) {
        proc?.takeIf { it.p.isAlive }?.let { return it }
        proc = null
        if (System.currentTimeMillis() < brokenUntil) return null
        App.awaitReadyOrNull() ?: return null
        val started = runCatching { start() }.onFailure { Log.w(TAG, "start failed", it) }.getOrNull()
        if (started == null) brokenUntil = System.currentTimeMillis() + 60_000 // не мучаем каждый запрос
        proc = started
        started
    }

    private fun start(): Proc {
        val ctx = App.instance
        val root = File(ctx.noBackupFilesDir, "youtubedl-android")
        val pkgs = File(root, "packages")
        val native = ctx.applicationInfo.nativeLibraryDir
        val script = File(ctx.filesDir, "ytd_daemon.py")
        val text = ctx.assets.open("ytd_daemon.py").use { it.readBytes() }
        if (!script.exists() || !script.readBytes().contentEquals(text)) script.writeBytes(text)
        val cache = File(ctx.cacheDir, "yt-dlp").apply { mkdirs() }
        val p = ProcessBuilder(
            File(native, "libpython.so").absolutePath, "-u", script.absolutePath,
            File(root, "yt-dlp/yt-dlp").absolutePath, File(native, "libqjs.so").absolutePath, cache.absolutePath,
        ).apply {
            environment().apply {
                this["LD_LIBRARY_PATH"] = "$pkgs/python/usr/lib:$pkgs/ffmpeg/usr/lib:$pkgs/aria2c/usr/lib"
                this["SSL_CERT_FILE"] = "$pkgs/python/usr/etc/tls/cert.pem"
                this["PYTHONHOME"] = "$pkgs/python/usr"
                this["HOME"] = "$pkgs/python/usr"
                this["TMPDIR"] = ctx.cacheDir.absolutePath
                this["PATH"] = System.getenv("PATH") + ":" + native
            }
            redirectError(File("/dev/null"))
        }.start()
        val reader = p.inputStream.bufferedReader()
        // Ждём «готов» не дольше 30 секунд.
        val ready = CompletableFuture<String?>()
        Thread({ ready.complete(runCatching { reader.readLine() }.getOrNull()) }, "ytd-ready").start()
        val first = runCatching { ready.get(30, TimeUnit.SECONDS) }.getOrNull()
        if (first == null || !first.contains("\"ready\"")) {
            p.destroy()
            throw IllegalStateException("daemon not ready: $first")
        }
        val me = Proc(p, p.outputStream.bufferedWriter())
        Thread({
            try {
                while (true) {
                    val line = reader.readLine() ?: break
                    val o = runCatching { JSONObject(line) }.getOrNull() ?: continue
                    me.pending.remove(o.optLong("id", -1))?.complete(o)
                }
            } catch (_: Exception) {
            }
            // Процесс умер — все, кто ждёт, получают ошибку и идут обычным путём.
            synchronized(this) { if (proc === me) { proc = null } }
            me.pending.values.forEach { it.completeExceptionally(IllegalStateException("daemon died")) }
        }, "ytd-reader").apply { isDaemon = true }.start()
        timeouts.set(0)
        Log.i(TAG, "started: $first")
        return me
    }

    /**
     * Запрос. Возвращает data, бросает [UserError] с понятным текстом, если площадка ответила ошибкой,
     * и [Unavailable], если сам процесс недоступен (тогда — обычный yt-dlp).
     */
    private fun call(op: String, url: String, opts: JSONObject, timeoutSec: Long): Any {
        val pr = ensure() ?: throw Unavailable()
        val id = ids.incrementAndGet()
        val f = CompletableFuture<JSONObject>()
        pr.pending[id] = f
        try {
            val line = JSONObject().put("id", id).put("op", op).put("url", url).put("opts", opts)
                .put("bg", Ytdlp.isBackground).toString()
            synchronized(pr) { pr.stdin.write(line); pr.stdin.newLine(); pr.stdin.flush() }
        } catch (e: Exception) {
            pr.pending.remove(id)
            synchronized(this) { if (proc === pr) stop() }
            throw Unavailable()
        }
        val r = try {
            f.get(timeoutSec, TimeUnit.SECONDS)
        } catch (e: TimeoutException) {
            pr.pending.remove(id)
            // Несколько зависаний подряд — процесс, видимо, застрял: перезапускаем.
            if (timeouts.incrementAndGet() >= 3) synchronized(this) { if (proc === pr) stop() }
            throw UserError("Площадка не ответила за $timeoutSec с")
        } catch (e: Exception) {
            throw Unavailable()
        }
        timeouts.set(0)
        if (!r.optBoolean("ok")) throw UserError(Downloader.explain(r.optString("error")))
        return r.opt("data") ?: JSONObject.NULL
    }

    class Unavailable : Exception()

    private fun cookies(o: JSONObject) = o.apply {
        Cookies.file(App.instance).takeIf { it.exists() }?.let { put("cookiefile", it.absolutePath) }
    }

    /** Плоский поиск: «scsearch8:…», «ytsearch8:…» или ссылка на страницу поиска. */
    internal fun search(query: String, source: String, timeoutSec: Long = 30): List<Downloader.Candidate> {
        val a = call("search", query, JSONObject().put("extract_flat", "in_playlist").put("playlistend", 8), timeoutSec) as? JSONArray
            ?: return emptyList()
        return (0 until a.length()).mapNotNull { i ->
            val e = a.optJSONObject(i) ?: return@mapNotNull null
            val url = e.optString("url").takeIf { it.startsWith("http") } ?: return@mapNotNull null
            val title = e.optString("title")
            val author = e.optString("artist").takeIf { it.isNotEmpty() && it != "null" }.orEmpty().removeSuffix(" - Topic")
            val artistField = listOf(author, title.substringBefore(" - ", "")).filter { it.isNotBlank() }.joinToString(" | ")
            Downloader.Candidate(url, title, artistField, e.optDouble("duration", 0.0).toInt(), source, e.optLong("views", 0))
        }
    }

    /** Ссылки на поток для страницы: [format] — выбор yt-dlp. */
    fun stream(pageUrl: String, format: String, timeoutSec: Long = 40): JSONObject? =
        call("stream", pageUrl, cookies(JSONObject().put("format", format).put("noplaylist", true)), timeoutSec) as? JSONObject
}
