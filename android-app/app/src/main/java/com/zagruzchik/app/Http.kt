package com.zagruzchik.app

import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

/** Простые HTTP-запросы для открытых API музыкальных сервисов. */
object Http {
    const val MOBILE_UA = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36"
    const val DESKTOP_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36"

    class HttpError(val code: Int, url: String) : Exception("HTTP $code: $url")

    fun get(url: String, ua: String = MOBILE_UA, timeoutMs: Int = 20_000): String {
        val conn = URL(url).openConnection() as HttpURLConnection
        conn.setRequestProperty("User-Agent", ua)
        conn.setRequestProperty("Accept-Language", "ru,en;q=0.8")
        conn.connectTimeout = minOf(15_000, timeoutMs)
        conn.readTimeout = timeoutMs
        try {
            val code = conn.responseCode
            if (code !in 200..299) {
                runCatching { conn.errorStream?.close() }
                throw HttpError(code, url)
            }
            return conn.inputStream.bufferedReader().use { it.readText() }
        } finally {
            conn.disconnect()
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
            val conn = URL(current).openConnection() as HttpURLConnection
            conn.instanceFollowRedirects = false
            conn.setRequestProperty("User-Agent", DESKTOP_UA)
            conn.connectTimeout = 15_000
            conn.readTimeout = 15_000
            try {
                val location = conn.getHeaderField("Location")
                    ?: return runCatching { conn.inputStream.bufferedReader().use { it.readText() } }.getOrDefault(current)
                if (done(location)) return location
                val next = runCatching { URL(URL(current), location).toString() }.getOrNull() ?: return location
                if (!next.startsWith("http")) return location
                current = next
            } finally {
                conn.disconnect()
            }
        }
        return current
    }
}
