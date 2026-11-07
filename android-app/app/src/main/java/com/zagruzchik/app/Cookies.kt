package com.zagruzchik.app

import android.content.Context
import android.webkit.CookieManager
import java.io.File

/**
 * Входы в аккаунты хранятся в закрытой папке приложения в формате cookies.txt (его понимает yt-dlp).
 * Источники: встроенное окно входа или файл, выгруженный из браузера.
 */
object Cookies {

    data class Site(val name: String, val loginUrl: String, val cookieUrl: String, val domain: String)

    val SITES = listOf(
        Site("YouTube", "https://accounts.google.com/ServiceLogin?service=youtube&continue=https%3A%2F%2Fm.youtube.com%2F", "https://www.youtube.com", ".youtube.com"),
        Site("Instagram", "https://www.instagram.com/accounts/login/", "https://www.instagram.com", ".instagram.com"),
        Site("TikTok", "https://www.tiktok.com/login", "https://www.tiktok.com", ".tiktok.com"),
        Site("X (Twitter)", "https://x.com/i/flow/login", "https://x.com", ".x.com"),
        Site("ВКонтакте", "https://m.vk.com/login", "https://vk.com", ".vk.com"),
        Site("Facebook", "https://m.facebook.com/login", "https://www.facebook.com", ".facebook.com"),
    )

    private const val HEADER = "# Netscape HTTP Cookie File"
    private const val HALF_YEAR_SEC = 180L * 24 * 3600

    fun file(ctx: Context) = File(ctx.filesDir, "cookies.txt")

    /** Ключ записи: домен + путь + имя. Новые записи заменяют старые с тем же ключом. */
    private fun key(line: String): String? {
        val f = line.split('\t')
        if (f.size < 7) return null
        return "${f[0].removePrefix("#HttpOnly_").lowercase()}|${f[2]}|${f[5]}"
    }

    private fun isCookieLine(line: String) = line.startsWith("#HttpOnly_") || (line.isNotBlank() && !line.startsWith("#"))

    private fun merge(ctx: Context, newLines: List<String>): Int {
        val f = file(ctx)
        val map = LinkedHashMap<String, String>()
        if (f.exists()) f.readLines().filter(::isCookieLine).forEach { l -> key(l)?.let { map[it] = l } }
        var added = 0
        newLines.filter(::isCookieLine).forEach { l -> key(l)?.let { map[it] = l; added++ } }
        f.writeText((listOf(HEADER) + map.values).joinToString("\n", postfix = "\n"))
        return added
    }

    /** Импорт файла cookies.txt (например, из расширения «Get cookies.txt LOCALLY»). */
    fun import(ctx: Context, text: String): Int = merge(ctx, text.lines())

    /** Забирает вход из встроенного окна входа. */
    fun saveFromWebView(ctx: Context, site: Site): Int {
        val cm = CookieManager.getInstance()
        cm.flush()
        val raw = cm.getCookie(site.cookieUrl) ?: return 0
        val expires = System.currentTimeMillis() / 1000 + HALF_YEAR_SEC
        val lines = raw.split(';').mapNotNull { part ->
            val p = part.trim()
            val eq = p.indexOf('=')
            if (eq <= 0) null else listOf(site.domain, "TRUE", "/", "TRUE", expires.toString(), p.substring(0, eq), p.substring(eq + 1)).joinToString("\t")
        }
        return merge(ctx, lines)
    }

    fun loggedInSites(ctx: Context): List<String> {
        val f = file(ctx)
        if (!f.exists()) return emptyList()
        val domains = f.readLines().filter(::isCookieLine).mapNotNull { it.split('\t').firstOrNull()?.removePrefix("#HttpOnly_") }.toSet()
        return SITES.filter { s -> domains.any { it.endsWith(s.domain.trimStart('.')) } }.map { it.name }
    }

    fun clear(ctx: Context) {
        file(ctx).delete()
        CookieManager.getInstance().removeAllCookies(null)
        CookieManager.getInstance().flush()
    }
}
