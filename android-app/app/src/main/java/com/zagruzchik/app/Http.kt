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

    fun get(url: String, ua: String = MOBILE_UA): String {
        val conn = URL(url).openConnection() as HttpURLConnection
        conn.setRequestProperty("User-Agent", ua)
        conn.setRequestProperty("Accept-Language", "ru,en;q=0.8")
        conn.connectTimeout = 15_000
        conn.readTimeout = 20_000
        try {
            val code = conn.responseCode
            if (code !in 200..299) throw HttpError(code, url)
            return conn.inputStream.bufferedReader().use { it.readText() }
        } finally {
            conn.disconnect()
        }
    }

    fun json(url: String): JSONObject = JSONObject(get(url))

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
