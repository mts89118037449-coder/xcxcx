package com.zagruzchik.app

import okhttp3.ConnectionPool
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.net.URL
import java.net.URLEncoder
import java.util.concurrent.TimeUnit

/** Простые HTTP-запросы для открытых API музыкальных сервисов (с общим Keep-Alive / HTTP/2 пулом). */
object Http {
    const val MOBILE_UA = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36"
    const val DESKTOP_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36"

    class HttpError(val code: Int, url: String) : Exception("HTTP $code: $url")

    private val client = OkHttpClient.Builder()
        .connectionPool(ConnectionPool(10, 5, TimeUnit.MINUTES))
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .followRedirects(true)
        .build()

    private val noRedirectClient = client.newBuilder()
        .followRedirects(false)
        .followSslRedirects(false)
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .build()

    private fun clientFor(timeoutMs: Int): OkHttpClient =
        if (timeoutMs == 20_000) client
        else client.newBuilder()
            .connectTimeout(minOf(15_000, timeoutMs).toLong(), TimeUnit.MILLISECONDS)
            .readTimeout(timeoutMs.toLong(), TimeUnit.MILLISECONDS)
            .build()

    fun get(url: String, ua: String = MOBILE_UA, timeoutMs: Int = 20_000, headers: Map<String, String> = emptyMap()): String {
        val req = Request.Builder().url(url)
            .header("User-Agent", ua)
            .header("Accept-Language", "ru,en;q=0.8")
            .apply { headers.forEach { (k, v) -> header(k, v) } }
            .build()
        clientFor(timeoutMs).newCall(req).execute().use { resp ->
            if (!resp.isSuccessful) throw HttpError(resp.code, url)
            return resp.body?.string().orEmpty()
        }
    }

    fun isDirectAudio(url: String): Boolean = runCatching {
        val uri = java.net.URI(url)
        uri.scheme?.lowercase() in setOf("http", "https") && uri.host != null &&
            uri.path.substringAfterLast('.').lowercase() in setOf("mp3", "flac", "m4a", "ogg", "oga", "opus", "wav", "aac")
    }.getOrDefault(false)

    private val probeClient = client.newBuilder().callTimeout(2500, TimeUnit.MILLISECONDS).build()

    fun canReadAudio(url: String, referer: String? = null): Boolean = runCatching {
        val request = Request.Builder().url(url).header("User-Agent", DESKTOP_UA)
            .header("Range", "bytes=0-0")
            .apply { if (referer != null) header("Referer", referer) }
            .build()
        probeClient.newCall(request).execute().use { response ->
            val type = response.header("Content-Type").orEmpty().substringBefore(';').lowercase()
            response.isSuccessful && (type.startsWith("audio/") || type.startsWith("video/") ||
                type.isEmpty() || type == "application/octet-stream" || type == "application/ogg") && response.body?.source()?.exhausted() == false
        }
    }.getOrDefault(false)

    fun bytes(url: String, ua: String = MOBILE_UA, timeoutMs: Int = 15_000, maxBytes: Long = Long.MAX_VALUE): ByteArray {
        val req = Request.Builder().url(url)
            .header("User-Agent", ua)
            .build()
        clientFor(timeoutMs).newCall(req).execute().use { resp ->
            if (!resp.isSuccessful) throw HttpError(resp.code, url)
            val source = resp.body?.source() ?: return ByteArray(0)
            if (maxBytes != Long.MAX_VALUE && source.request(maxBytes + 1)) {
                throw java.io.IOException("Изображение слишком большое")
            }
            return source.readByteArray()
        }
    }

    fun post(
        url: String,
        body: String,
        contentType: String = "application/json",
        ua: String = DESKTOP_UA,
        timeoutMs: Int = 15_000,
        headers: Map<String, String> = emptyMap(),
    ): String {
        val req = Request.Builder().url(url)
            .post(body.toRequestBody(contentType.toMediaType()))
            .header("User-Agent", ua)
            .header("Accept-Language", "ru,en;q=0.8")
            .apply { headers.forEach { (k, v) -> header(k, v) } }
            .build()
        clientFor(timeoutMs).newCall(req).execute().use { resp ->
            if (!resp.isSuccessful) throw HttpError(resp.code, url)
            return resp.body?.string().orEmpty()
        }
    }

    fun json(url: String): JSONObject = JSONObject(get(url))

    // ---------------- Ответы на телефоне (главная открывается мгновенно) ----------------

    private val offline = ThreadLocal<Boolean>()

    /** Выполнить [block], беря ответы только с телефона (что сохранено в прошлый раз), без сети. */
    fun <T> fromDisk(block: () -> T): T {
        offline.set(true)
        try { return block() } finally { offline.set(false) }
    }

    val isOffline get() = offline.get() == true

    private val sha1Digest = ThreadLocal.withInitial { java.security.MessageDigest.getInstance("SHA-1") }

    internal fun sha1(s: String): String {
        val bytes = sha1Digest.get()!!.apply { reset() }.digest(s.toByteArray())
        val hex = CharArray(bytes.size * 2)
        val digits = "0123456789abcdef"
        for (i in bytes.indices) {
            val v = bytes[i].toInt() and 0xFF
            hex[i * 2] = digits[v ushr 4]
            hex[i * 2 + 1] = digits[v and 0x0F]
        }
        return String(hex)
    }

    private fun diskFile(url: String): java.io.File =
        java.io.File(App.instance.cacheDir, "http/${sha1(url)}").apply { parentFile?.mkdirs() }

    /**
     * JSON с сохранением на телефон. В режиме [fromDisk] — только сохранённое (любой давности);
     * иначе из сети, а если сеть не ответила — последнее сохранённое.
     */
    fun cachedJson(url: String, timeoutMs: Int = 20_000): JSONObject {
        val f = diskFile(url)
        if (isOffline) return JSONObject(f.readText())
        return try {
            val text = get(url, timeoutMs = timeoutMs)
            val json = JSONObject(text)
            runCatching {
                val tmp = java.io.File(f.parentFile, "${f.name}.tmp.${Thread.currentThread().id}")
                tmp.writeText(text)
                if (!tmp.renameTo(f)) tmp.delete()
            }
            json
        } catch (e: Exception) {
            if (f.exists()) {
                runCatching { JSONObject(f.readText()) }.getOrElse {
                    f.delete()
                    throw e
                }
            } else throw e
        }
    }

    fun enc(s: String): String = URLEncoder.encode(s, "UTF-8")

    /**
     * Раскрывает короткую ссылку (spotify.link, deezer.page.link и т.п.), не переходя в приложения:
     * притворяемся компьютером, иначе сервисы отправляют телефон по intent://.
     * Возвращает первый адрес, на котором сработал [done], или последний адрес / тело страницы.
     */
    fun expand(url: String, done: (String) -> Boolean): String {
        var current = url
        repeat(6) {
            val req = Request.Builder().url(current).header("User-Agent", DESKTOP_UA).build()
            noRedirectClient.newCall(req).execute().use { resp ->
                val location = resp.header("Location")
                    ?: return runCatching { resp.body?.string().orEmpty() }.getOrDefault(current)
                if (done(location)) return location
                val next = runCatching { URL(URL(current), location).toString() }.getOrNull() ?: return location
                if (!next.startsWith("http")) return location
                current = next
            }
        }
        return current
    }
}
