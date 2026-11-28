package com.zagruzchik.app

import okhttp3.HttpUrl.Companion.toHttpUrlOrNull

object PublicTelegram {
    private val post = Regex("""/(?:s/)?([a-zA-Z][a-zA-Z0-9_]{3,31})/([1-9][0-9]*)/?""")
    private val media = Regex("""<(audio|source)\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']""", RegexOption.IGNORE_CASE)
    private val audioFile = Regex("""\.(?:mp3|m4a|aac|ogg|opus|flac|wav)$""", RegexOption.IGNORE_CASE)

    internal fun canonical(url: String): String? {
        val parsed = url.toHttpUrlOrNull() ?: return null
        if (parsed.host !in setOf("t.me", "telegram.me")) return null
        val (channel, id) = post.matchEntire(parsed.encodedPath)?.destructured ?: return null
        return "https://t.me/$channel/$id"
    }

    internal fun audioUrl(html: String): String? = media.findAll(html).firstNotNullOfOrNull { match ->
        val raw = match.groupValues[2].replace("&amp;", "&").replace("&#38;", "&")
        val url = (if (raw.startsWith("//")) "https:$raw" else raw).toHttpUrlOrNull() ?: return@firstNotNullOfOrNull null
        val fromTelegram = url.host == "cdn-telegram.org" || url.host.endsWith(".cdn-telegram.org") ||
            url.host.endsWith(".telesco.pe") || url.host == "t.me" || url.host.endsWith(".t.me") || url.host == "telegram.org" || url.host.endsWith(".telegram.org")
        url.toString().takeIf { url.isHttps && fromTelegram &&
            (match.groupValues[1].equals("audio", true) || audioFile.containsMatchIn(url.encodedPath)) }
    }

    fun stream(url: String, fallbackTitle: String): StreamInfo? {
        val page = canonical(url) ?: return null
        val html = Http.get("$page?embed=1", timeoutMs = 6000)
        val audio = audioUrl(html) ?: return null
        return StreamInfo(audio, page, "Telegram", null, fallbackTitle)
    }
}
