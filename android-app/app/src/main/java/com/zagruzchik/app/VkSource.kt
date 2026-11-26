package com.zagruzchik.app

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * ВКонтакте как источник музыки. Вход — в свой аккаунт через встроенный браузер (Настройки → «Музыка из ВК»).
 * Ищем так же, как мобильный сайт ВК: внутренние запросы al_audio с куками этой сессии.
 * Чужих ключей нет — только сессия самого человека на его телефоне.
 * Только по нажатию (в фоновой подготовке не участвует): ВК ограничивает частые запросы.
 */
object VkSource {
    private const val UA = "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36"
    private const val KATE_UA = "KateMobileAndroid/109.1 lite-550 (Android 13; SDK 33; x86_64; Google Pixel 5; ru)"
    private const val API_VER = "5.131"
    private val HOSTS = listOf("vk.ru", "m.vk.ru", "vk.com", "m.vk.com")

    private lateinit var app: Context
    private val prefs by lazy { app.getSharedPreferences("vk", Context.MODE_PRIVATE) }

    @Volatile var userId: Long = 0; private set
    @Volatile private var accessToken: String = ""
    /** ВК показал капчу или просил подождать — до этого времени к нему не ходим. */
    @Volatile var pausedUntil = 0L; private set

    fun init(ctx: Context) {
        if (::app.isInitialized) return
        app = ctx.applicationContext
        userId = prefs.getLong("user_id", 0)
        accessToken = prefs.getString("token", null).orEmpty()
    }

    private fun cookie(host: String): String = if (::app.isInitialized) prefs.getString("cookies_$host", null).orEmpty() else ""

    /** User-Agent сессии: ВК привязывает вход к браузеру — запросы тем же UA, что у встроенного браузера (журнал 24.11: «Сессия истекла»). */
    private fun ua(): String = if (::app.isInitialized) prefs.getString("ua", null) ?: UA else UA
    fun saveUa(value: String) { prefs.edit().putString("ua", value).apply() }

    val hasToken: Boolean get() = accessToken.isNotBlank()
    /** Есть живая сессия (Kate token или куки входа; сдохшую заметим по ответу ВК). */
    val loggedIn: Boolean get() = accessToken.isNotBlank() || HOSTS.any { cookie(it).contains("remixsid") }
    val available: Boolean get() = loggedIn && System.currentTimeMillis() >= pausedUntil

    fun saveToken(token: String, uid: Long) {
        accessToken = token.trim()
        if (uid != 0L) userId = uid
        prefs.edit().putString("token", accessToken).apply {
            if (uid != 0L) putLong("user_id", uid)
        }.apply()
    }

    fun clearToken() {
        accessToken = ""
        if (::app.isInitialized) prefs.edit().remove("token").apply()
    }

    /** Сохранить куки из встроенного браузера после входа. */
    fun saveCookies(manager: android.webkit.CookieManager) {
        val e = prefs.edit()
        HOSTS.forEach { h -> manager.getCookie("https://$h")?.takeIf { it.isNotBlank() }?.let { e.putString("cookies_$h", it) } }
        e.apply()
    }

    fun setUserId(id: Long) { userId = id; prefs.edit().putLong("user_id", id).apply() }

    fun logout() {
        prefs.edit().clear().apply()
        accessToken = ""
        userId = 0
        pausedUntil = 0
    }

    class Found(val id: String, val ownerId: String, val h1: String, val h2: String,
                val title: String, val artist: String, val durationSec: Int, val cover: String?,
                val directUrl: String = "", val accessKey: String = "") {
        val key: String get() = if (directUrl.isNotBlank() || (h1.isEmpty() && h2.isEmpty())) "vkapi:${ownerId}_${id}" else "vk:${ownerId}_${id}_${h1}_${h2}"
    }

    internal fun parseOAuthRedirect(url: String): Pair<String, Long>? {
        val frag = url.substringAfter('#', "").ifBlank { url.substringAfter('?', "") }
        if (frag.isBlank()) return null
        var token = ""
        var uid = 0L
        for (part in frag.split('&')) {
            val eq = part.indexOf('=')
            if (eq <= 0) continue
            val k = part.substring(0, eq)
            val v = java.net.URLDecoder.decode(part.substring(eq + 1), "UTF-8")
            if (k == "access_token") token = v
            else if (k == "user_id") uid = v.toLongOrNull() ?: 0L
        }
        return token.takeIf { it.isNotBlank() }?.let { it to uid }
    }

    private fun checkApiError(json: JSONObject) {
        val err = json.optJSONObject("error") ?: return
        val code = err.optInt("error_code", 0)
        when (code) {
            5 -> {
                clearToken()
                throw UserError("Сессия ВК истекла — войдите заново: Настройки → «Музыка из ВК»")
            }
            6, 9, 14 -> {
                pausedUntil = System.currentTimeMillis() + 5 * 60_000L
                throw UserError("ВК просит подождать (слишком частые запросы или капча)")
            }
            else -> throw UserError("ВК API: ${err.optString("error_msg").ifBlank { "ошибка $code" }}")
        }
    }

    internal fun parseApiSearch(raw: String): List<Found> {
        val json = JSONObject(raw)
        checkApiError(json)
        val items = json.optJSONObject("response")?.optJSONArray("items") ?: return emptyList()
        val out = ArrayList<Found>(items.length())
        for (i in 0 until items.length()) {
            val o = items.optJSONObject(i) ?: continue
            val id = o.opt("id")?.toString().orEmpty()
            val owner = o.opt("owner_id")?.toString().orEmpty()
            val title = o.optString("title").trim()
            val artist = o.optString("artist").trim()
            if (id.isEmpty() || owner.isEmpty() || title.isEmpty()) continue
            val dur = o.optInt("duration", 0)
            val direct = o.optString("url").takeIf { it.startsWith("http") }.orEmpty()
            val accessKey = o.optString("access_key")
            val thumb = o.optJSONObject("album")?.optJSONObject("thumb")
            val cover = thumb?.optString("photo_600")?.takeIf { it.startsWith("http") }
                ?: thumb?.optString("photo_300")?.takeIf { it.startsWith("http") }
            out += Found(id, owner, "", "", title, artist, dur, cover, direct, accessKey)
        }
        return out
    }

    private fun apiRequest(url: String): String {
        val c = (URL(url).openConnection() as HttpURLConnection).apply {
            connectTimeout = 15_000; readTimeout = 15_000
            setRequestProperty("User-Agent", KATE_UA)
        }
        try {
            val code = c.responseCode
            val text = (if (code in 200..299) c.inputStream else c.errorStream)?.bufferedReader(Charsets.UTF_8)?.readText().orEmpty()
            if (code !in 200..299 && text.isBlank()) throw UserError("ВК API ответил кодом $code")
            return text
        } finally {
            c.disconnect()
        }
    }

    private fun apiGetById(audios: List<String>, tok: String): Map<String, String> {
        if (audios.isEmpty()) return emptyMap()
        val raw = apiRequest("https://api.vk.com/method/audio.getById?audios=${Http.enc(audios.joinToString(","))}&v=$API_VER&access_token=${Http.enc(tok)}")
        val json = JSONObject(raw)
        checkApiError(json)
        val arr = json.optJSONArray("response") ?: return emptyMap()
        val out = HashMap<String, String>(arr.length())
        for (i in 0 until arr.length()) {
            val o = arr.optJSONObject(i) ?: continue
            val u = o.optString("url").takeIf { it.startsWith("http") } ?: continue
            val id = o.opt("id")?.toString().orEmpty()
            val owner = o.opt("owner_id")?.toString().orEmpty()
            if (id.isNotEmpty() && owner.isNotEmpty()) out["${owner}_$id"] = u
        }
        return out
    }

    // ---------------- Поиск (Kate Mobile API или fallback на сайт m.vk.ru) ----------------

    fun search(query: String): List<Found> {
        val tok = accessToken
        if (tok.isNotBlank()) {
            val raw = apiRequest("https://api.vk.com/method/audio.search?q=${Http.enc(query)}&count=15&auto_complete=1&v=$API_VER&access_token=${Http.enc(tok)}")
            return parseApiSearch(raw)
        }
        ensureUserId()
        val body = "al=1&act=section&claim=0&is_layer=0&owner_id=$userId&section=search&q=" + Http.enc(query)
        val raw = request("https://vk.ru/al_audio.php", body, xrw = true)
        val json = JSONObject(raw.removePrefix("<!--"))
        val section = json.optJSONArray("payload")?.opt(1)?.let { it as? JSONArray }?.optJSONObject(1)
        val list = section?.optJSONObject("playlist")?.optJSONArray("list")
            ?: section?.optJSONArray("playlists")?.optJSONObject(0)?.optJSONArray("list")
            ?: return emptyList()
        val out = ArrayList<Found>(list.length())
        for (i in 0 until list.length()) {
            val a = list.optJSONArray(i) ?: continue
            val hashes = a.optString(13).split("/")
            val h1 = hashes.getOrNull(2).orEmpty(); val h2 = hashes.getOrNull(5).orEmpty()
            val id = a.opt(0)?.toString().orEmpty(); val owner = a.opt(1)?.toString().orEmpty()
            if (id.isEmpty() || owner.isEmpty() || h1.isEmpty() || h2.isEmpty()) continue
            val dur = a.optInt(5, 0)
            val cover = a.optString(14).split(',').firstOrNull()?.takeIf { it.startsWith("http") }
            out += Found(id, owner, h1, h2, stripHtml(a.optString(3)), stripHtml(a.optString(4)), dur, cover)
        }
        return out
    }

    /** Свежая ссылка на звук для запомненного ключа «vkapi:owner_id» или «vk:owner_id_h1_h2». */
    fun streamOf(t: Track, where: String): StreamInfo? {
        if (!available) throw UserError("ВК не подключён")
        if (where.startsWith("vkapi:")) {
            val tok = accessToken.takeIf { it.isNotBlank() } ?: return null
            val oidId = where.removePrefix("vkapi:")
            val u = apiGetById(listOf(oidId), tok)[oidId] ?: return null
            return StreamInfo(u, "https://vk.ru/audio", "VK Музыка · MP3", t.cover, t.title)
        }
        ensureUserId()
        val p = where.removePrefix("vk:").split('_')
        if (p.size < 4) return null
        val urls = reload(listOf(Found(p[1], p[0], p[2], p[3], t.title, t.artist, t.durationSec, null)))
        val u = urls[p[0] + "_" + p[1]] ?: return null
        return StreamInfo(u, "https://vk.ru/audio", "VK Музыка · MP3", t.cover, t.title)
    }

    /** Из подходящих вариантов — первый, для которого ВК отдал играющую ссылку. */
    fun streamOf(t: Track, candidates: List<Found>): Pair<String, StreamInfo>? {
        val tok = accessToken
        if (tok.isNotBlank()) {
            for (c in candidates) {
                if (c.directUrl.startsWith("http")) {
                    return c.key to StreamInfo(c.directUrl, "https://vk.ru/audio", "VK Музыка · MP3", t.cover ?: c.cover, c.title)
                }
            }
            val ids = candidates.take(10).map {
                if (it.accessKey.isNotBlank()) "${it.ownerId}_${it.id}_${it.accessKey}" else "${it.ownerId}_${it.id}"
            }
            val urls = apiGetById(ids, tok)
            for (c in candidates) {
                val u = urls["${c.ownerId}_${c.id}"] ?: continue
                return c.key to StreamInfo(u, "https://vk.ru/audio", "VK Музыка · MP3", t.cover ?: c.cover, c.title)
            }
            return null
        }
        ensureUserId()
        val urls = reload(candidates.take(10))
        for (c in candidates) {
            val u = urls[c.ownerId + "_" + c.id] ?: continue
            return c.key to StreamInfo(u, "https://vk.ru/audio", "VK Музыка · MP3", t.cover ?: c.cover, c.title)
        }
        return null
    }

    /** Пакетное получение ссылок (до 10 за запрос) — как сайт при нажатии «играть». */
    private fun reload(list: List<Found>): Map<String, String> {
        if (list.isEmpty()) return emptyMap()
        val ids = list.joinToString(",") { "${it.ownerId}_${it.id}_${it.h1}_${it.h2}" }
        val raw = request("https://m.vk.ru/audio", "act=reload_audio&ids=" + Http.enc(ids), xrw = true)
        val json = JSONObject(raw.removePrefix("<!--"))
        val data = json.optJSONArray("data")?.optJSONArray(0) ?: return emptyMap()
        val out = HashMap<String, String>(data.length())
        for (i in 0 until data.length()) {
            val a = data.optJSONArray(i) ?: continue
            var link = a.optString(2)
            if (link.isBlank()) continue
            if ("audio_api_unavailable" in link) link = runCatching { decode(link, userId) }.getOrNull() ?: continue
            link = M3U8_TO_MP3.replace(link, "$1/$2.mp3")
            if (link.startsWith("http")) out[a.opt(1).toString() + "_" + a.opt(0).toString()] = link
        }
        return out
    }

    // ---------------- Вход: id пользователя ----------------

    fun ensureUserId(): Long {
        if (userId != 0L) return userId
        if (!loggedIn) throw UserError("ВК не подключён: Настройки → «Музыка из ВК»")
        val html = request("https://m.vk.ru/audio", null, xrw = false)
        val patterns = listOf("""/audios(\d+)""", """"owner_id":(\d+)""", """/id(\d+)""")
        for (p in patterns) {
            val m = Regex(p).find(html) ?: continue
            val id = m.groupValues[1].toLongOrNull() ?: continue
            setUserId(id)
            return id
        }
        throw UserError("ВК: не удалось узнать id аккаунта")
    }

    // ---------------- HTTP ----------------

    private fun cookieFor(url: String): String {
        val host = runCatching { URL(url).host }.getOrDefault("")
        val direct = cookie(host)
        if (direct.isNotBlank()) return direct
        return HOSTS.mapNotNull { cookie(it).takeIf { c -> c.isNotBlank() } }.joinToString("; ")
    }

    private fun request(url: String, post: String?, xrw: Boolean): String {
        val c = (URL(url).openConnection() as HttpURLConnection).apply {
            connectTimeout = 15_000; readTimeout = 15_000
            instanceFollowRedirects = false
            setRequestProperty("User-Agent", ua())
            setRequestProperty("Cookie", cookieFor(url))
            if (xrw) setRequestProperty("X-Requested-With", "XMLHttpRequest")
            setRequestProperty("Referer", "https://vk.ru/audio")
            if (post != null) {
                doOutput = true; requestMethod = "POST"
                setRequestProperty("Content-Type", "application/x-www-form-urlencoded")
                outputStream.use { it.write(post.toByteArray(Charsets.UTF_8)) }
            }
        }
        try {
            val code = c.responseCode
            // ВК обновляет куки сессии в ответах — сохраняем, иначе через час-два «сессия истекла».
            c.headerFields["Set-Cookie"]?.takeIf { it.isNotEmpty() }?.let { mergeCookies(URL(url).host, it) }
            if (code == 429) { pausedUntil = System.currentTimeMillis() + 5 * 60_000L; throw UserError("ВК просит подождать пару минут — слишком частые запросы") }
            if (code in 300..399) { pausedUntil = System.currentTimeMillis() + 60_000L; throw UserError("Сессия ВК истекла — войдите заново: Настройки → «Музыка из ВК»") }
            val text = (if (code in 200..299) c.inputStream else c.errorStream)?.bufferedReader(Charsets.UTF_8)?.readText().orEmpty()
            if ("captcha" in text) { pausedUntil = System.currentTimeMillis() + 5 * 60_000L; throw UserError("ВК просит капчу — откройте Настройки → «Музыка из ВК» и пройдите её в браузере") }
            if (code !in 200..299) throw UserError("ВК ответил кодом $code")
            return text
        } finally {
            c.disconnect()
        }
    }

    private fun stripHtml(s: String): String = s.replace(Regex("<[^>]+>"), "")
        .replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
        .replace("&quot;", "\"").replace("&#39;", "'").replace("&nbsp;", " ").trim()

    // ---------------- Расшифровка ссылок «audio_api_unavailable» (как у сайта) ----------------

    private val M3U8_TO_MP3 = Regex("/[0-9a-f]+(/audios)?/([0-9a-f]+)/index\\.m3u8")
    private const val VK_STR = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMN0PQRSTUVWXYZO123456789+/="

    private fun decode(string: String, uid: Long): String {
        val vals = string.split("?extra=", limit = 2)[1].split("#")
        var tstr = vkO(vals[0])
        val ops = vkO(vals[1]).split('\t').reversed()
        for (op in ops) {
            val parts = op.split('\u000B')
            val cmd = parts[0]; val arg = parts.getOrNull(1)
            tstr = when (cmd) {
                "v" -> tstr.reversed()
                "r" -> vkR(tstr, arg!!)
                "x" -> vkXor(tstr, arg!!)
                "s" -> vkS(tstr, arg!!.toInt())
                "i" -> vkS(tstr, arg!!.toInt() xor uid.toInt())
                else -> throw UserError("ВК: неизвестная команда расшифровки «$cmd»")
            }
        }
        return tstr
    }

    private fun vkO(string: String): String {
        val result = StringBuilder()
        var index2 = 0; var i = 0
        for (s in string) {
            val sym = VK_STR.indexOf(s)
            if (sym == -1) continue
            if (index2 % 4 != 0) {
                index2++
                i = (i shl 6) + sym
                result.append((0xFF and (i shr (-2 * index2 and 6))).toChar())
            } else {
                i = sym; index2++
            }
        }
        return result.toString()
    }

    private fun vkR(string: String, i: String): String {
        val vk2 = VK_STR + VK_STR
        return string.map { s ->
            val idx = vk2.indexOf(s)
            if (idx == -1) s else {
                var off = idx - i.toInt()
                if (off < 0) off += vk2.length
                vk2[off]
            }
        }.joinToString("")
    }

    private fun vkXor(string: String, i: String): String {
        val x = i[0].code
        return string.map { (it.code xor x).toChar() }.joinToString("")
    }

    private fun vkSChild(len: Int, e0: Int): IntArray {
        if (len == 0) return IntArray(0)
        val o = IntArray(len); var e = e0
        for (a in len - 1 downTo 0) {
            e = (len * (a + 1) xor (e + a)) % len // как на сайте: «+» до «xor»
            o[len - 1 - a] = e
        }
        return o
    }

    private fun vkS(t: String, e: Int): String {
        val len = t.length
        if (len == 0) return t
        val o = vkSChild(len, e)
        val a = t.toCharArray()
        for (i in 1 until len) {
            val pos = o[len - 1 - i]
            val tmp = a[i]; a[i] = a[pos]; a[pos] = tmp
        }
        return String(a)
    }

    /** Обновить сохранённые куки хоста из заголовков Set-Cookie (ротация remixsid и т.п.). */
    @Synchronized
    private fun mergeCookies(host: String, setCookies: List<String>) {
        val cur = LinkedHashMap<String, String>()
        cookie(host).split("; ").filter { it.isNotBlank() }.forEach {
            val i = it.indexOf('='); if (i > 0) cur[it.substring(0, i)] = it.substring(i + 1)
        }
        var changed = false
        for (sc in setCookies) {
            val pair = sc.substringBefore(';').trim()
            val i = pair.indexOf('='); if (i <= 0) continue
            val name = pair.substring(0, i); val value = pair.substring(i + 1)
            if (value.isEmpty() || value.equals("deleted", true)) { if (cur.remove(name) != null) changed = true }
            else if (cur.put(name, value) != value) changed = true
        }
        if (changed) prefs.edit().putString("cookies_$host", cur.entries.joinToString("; ") { "${it.key}=${it.value}" }).apply()
    }

}
