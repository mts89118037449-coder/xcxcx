package com.zagruzchik.app

import android.content.ContentValues
import android.content.Context
import android.net.Uri
import android.os.Environment
import android.provider.MediaStore
import android.webkit.MimeTypeMap
import org.json.JSONObject
import com.yausername.youtubedl_android.YoutubeDL
import com.yausername.youtubedl_android.YoutubeDLException
import com.yausername.youtubedl_android.YoutubeDLRequest
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

enum class Format(val label: String) {
    BEST("Видео"),
    P720("Видео 720p"),
    MP3("Только звук MP3"),
}

/** Ошибка, текст которой можно показать пользователю как есть. */
class UserError(message: String) : Exception(message)

object Links {
    private val URL_RE = Regex("""https?://[^\s<>"«»]+""")
    private val MUSIC = listOf("music.youtube.com", "soundcloud.com", "music.yandex", "bandcamp.com", "spotify.com", "spotify.link")

    /** Приложения делятся текстом вида «Смотри! https://vm.tiktok.com/…» — достаём только ссылку. */
    fun extract(text: String?): String? =
        text?.let { URL_RE.find(it)?.value?.trimEnd('.', ',', ')', '!', '?') }

    fun defaultFormat(url: String) = if (MUSIC.any { url.contains(it) }) Format.MP3 else Format.BEST
}

/**
 * Spotify отдаёт музыку только в зашифрованном виде, поэтому берём список треков
 * (название + исполнитель) со страницы Spotify и ищем каждый трек на YouTube.
 * Работает для треков, альбомов и плейлистов.
 */
object Spotify {
    data class Track(val title: String, val artist: String)
    data class Item(val type: String, val name: String, val tracks: List<Track>)

    private const val UA = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36"
    private const val DESKTOP_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36"
    private val ID_RE = Regex("""(track|album|playlist)/([A-Za-z0-9]+)""")

    fun isSpotify(url: String) = url.contains("spotify.com/") || url.contains("spotify.link/")

    private fun get(url: String): String {
        val conn = URL(url).openConnection() as HttpURLConnection
        conn.setRequestProperty("User-Agent", UA)
        conn.connectTimeout = 15_000
        conn.readTimeout = 15_000
        return conn.inputStream.bufferedReader().use { it.readText() }
    }

    /**
     * Короткие ссылки spotify.link для телефона ведут в приложение Spotify (intent://),
     * поэтому притворяемся компьютером и сами смотрим, куда ведёт перенаправление.
     */
    private fun expandShortLink(url: String): String {
        var current = url
        repeat(5) {
            val conn = URL(current).openConnection() as HttpURLConnection
            conn.instanceFollowRedirects = false
            conn.setRequestProperty("User-Agent", DESKTOP_UA)
            conn.connectTimeout = 15_000
            conn.readTimeout = 15_000
            val location = conn.getHeaderField("Location")
            if (location == null) {
                val body = runCatching { conn.inputStream.bufferedReader().use { it.readText() } }.getOrDefault("")
                conn.disconnect()
                return body
            }
            conn.disconnect()
            if (ID_RE.containsMatchIn(location)) return location
            val next = runCatching { URL(URL(current), location).toString() }.getOrNull() ?: return location // intent:// и т.п.
            if (!next.startsWith("http")) return location
            current = next
        }
        return current
    }

    private fun clean(s: String) = s.replace('\u00A0', ' ').replace(Regex("\\s+"), " ").trim()

    fun resolve(url: String): Item {
        val m = ID_RE.find(url) ?: ID_RE.find(expandShortLink(url))
            ?: throw UserError("Не понял ссылку Spotify. Нужна ссылка на трек, альбом или плейлист.")
        val (type, id) = m.destructured

        val page = get("https://open.spotify.com/embed/$type/$id")
        val json = Regex("""<script id="__NEXT_DATA__" type="application/json">(.*?)</script>""", RegexOption.DOT_MATCHES_ALL)
            .find(page)?.groupValues?.get(1) ?: throw UserError("Spotify не отдал данные. Попробуйте позже.")
        val e = JSONObject(json).getJSONObject("props").getJSONObject("pageProps")
            .getJSONObject("state").getJSONObject("data").getJSONObject("entity")
        val name = clean(e.optString("name", e.optString("title")))

        if (type == "track") {
            val artists = e.optJSONArray("artists")
            val artist = (0 until (artists?.length() ?: 0)).joinToString(", ") { artists!!.getJSONObject(it).optString("name") }
            return Item(type, name, listOf(Track(name, clean(artist))))
        }
        val list = e.optJSONArray("trackList") ?: throw UserError("В этом $type нет треков")
        val tracks = (0 until list.length()).map {
            val t = list.getJSONObject(it)
            Track(clean(t.optString("title")), clean(t.optString("subtitle")))
        }.filter { it.title.isNotEmpty() }
        if (tracks.isEmpty()) throw UserError("Spotify не показал треки. Возможно, плейлист закрытый.")
        return Item(type, name, tracks)
    }
}

object Downloader {

    /** Результат: готовые файлы во временной папке и подпапка в «Загрузках» (для альбомов). */
    class Result(val files: List<File>, val subfolder: String? = null, val failed: Int = 0)

    /** Скачивает ссылку. onProgress получает общий процент (0–100) и короткий текст. */
    fun download(ctx: Context, url: String, format: Format, jobId: String, onProgress: (Float, String) -> Unit): Result {
        App.awaitReady()
        val dir = File(ctx.cacheDir, "dl/$jobId").apply { deleteRecursively(); mkdirs() }
        if (Spotify.isSpotify(url)) return downloadSpotify(url, dir, jobId, ctx, onProgress)

        val request = baseRequest(url, dir, ctx, format)
        request.addOption("-o", "%(title).80B [%(id)s].%(ext)s")
        execute(request, jobId) { p, line -> onProgress(p, line) }
        return Result(collect(dir))
    }

    private fun downloadSpotify(url: String, dir: File, jobId: String, ctx: Context, onProgress: (Float, String) -> Unit): Result {
        onProgress(0f, "Читаю Spotify…")
        val item = Spotify.resolve(url)
        val n = item.tracks.size
        var failed = 0
        var lastError: UserError? = null
        item.tracks.forEachIndexed { i, t ->
            val label = if (t.artist.isEmpty()) t.title else "${t.artist} — ${t.title}"
            onProgress(i * 100f / n, if (n > 1) "Трек ${i + 1}/$n: $label" else label)
            val request = baseRequest("ytsearch1:${t.artist} - ${t.title} audio", dir, ctx, Format.MP3).apply {
                addOption("-o", "${safeName(label)}.%(ext)s")
                // Теги MP3 — как в Spotify, а не как в названии ролика на YouTube.
                tag(this, "title", t.title)
                tag(this, "track", t.title)
                if (t.artist.isNotEmpty()) tag(this, "artist", t.artist)
                if (item.type == "album") tag(this, "album", item.name)
            }
            try {
                execute(request, "$jobId-$i") { p, _ ->
                    onProgress((i + p.coerceIn(0f, 100f) / 100f) * 100f / n, if (n > 1) "Трек ${i + 1}/$n: $label" else label)
                }
            } catch (e: UserError) {
                if (n == 1) throw e
                failed++
                lastError = e
            }
        }
        val files = dir.listFiles().orEmpty().filter { it.isFile && it.extension == "mp3" }
        if (files.isEmpty()) throw lastError ?: UserError("Не удалось скачать ни одного трека.")
        return Result(files, subfolder = if (n > 1) safeName(item.name) else null, failed = failed)
    }

    private fun baseRequest(source: String, dir: File, ctx: Context, format: Format) = YoutubeDLRequest(source).apply {
        addOption("--no-playlist")
        addOption("--no-mtime")
        addOption("--embed-metadata")
        addOption("-P", dir.absolutePath)
        Cookies.file(ctx).takeIf { it.exists() }?.let { addOption("--cookies", it.absolutePath) }
        when (format) {
            Format.BEST -> {
                addOption("-f", "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/bv*+ba/b")
                addOption("--merge-output-format", "mp4")
            }
            Format.P720 -> {
                addOption("-f", "bv*[height<=720][ext=mp4]+ba[ext=m4a]/b[height<=720][ext=mp4]/bv*[height<=720]+ba/b[height<=720]/b")
                addOption("--merge-output-format", "mp4")
            }
            Format.MP3 -> {
                addOption("-x")
                addOption("--audio-format", "mp3")
                addOption("--audio-quality", "0")
            }
        }
    }

    /** Записывает в тег готовое значение (двоеточия и % экранируются по правилам yt-dlp). */
    private fun tag(r: YoutubeDLRequest, field: String, value: String) {
        val literal = value.replace("%", "%%").replace(":", "\\:")
        r.addOption("--parse-metadata", "pre_process:$literal:(?P<$field>.+)")
    }

    private fun safeName(s: String) = s.replace(Regex("""[\\/:*?"<>|\u0000-\u001F]"""), "_").trim().take(120).ifEmpty { "Без названия" }

    private fun execute(request: YoutubeDLRequest, id: String, cb: (Float, String) -> Unit) {
        try {
            YoutubeDL.getInstance().execute(request, processId = id, redirectErrorStream = false) { p, _, line -> cb(p, line) }
        } catch (e: YoutubeDLException) {
            throw UserError(explain(e.message.orEmpty()))
        }
    }

    private fun collect(dir: File): List<File> {
        val files = dir.listFiles().orEmpty()
            .filter { it.isFile && !it.name.endsWith(".part") && !it.name.endsWith(".ytdl") && !it.name.endsWith(".temp") }
        if (files.isEmpty()) throw UserError("Файл не найден после загрузки. Попробуйте другой формат.")
        return files
    }

    fun cancel(jobId: String) = YoutubeDL.getInstance().destroyProcessById(jobId)

    private fun explain(err: String): String {
        val e = err.lowercase()
        return when {
            "sign in" in e || "login" in e || "log in" in e || "cookies" in e || "not a bot" in e ->
                "Сайт требует вход. Откройте Загрузчик → «Войти в аккаунт» и повторите."
            "private" in e -> "Это приватная публикация. Нужен вход в аккаунт, у которого есть к ней доступ."
            "unsupported url" in e -> "Этот сайт не поддерживается."
            "no video" in e -> "В публикации нет видео."
            "unable to download" in e || "timed out" in e || "connection" in e -> "Проблема с интернетом. Попробуйте ещё раз."
            else -> err.lineSequence().lastOrNull { it.contains("ERROR") }?.substringAfter("ERROR: ")?.take(300)
                ?: "Не получилось скачать."
        }
    }
}

/** Кладёт файл в общую папку «Загрузки/Загрузчик», чтобы его видели галерея, плеер и файловый менеджер. */
object Storage {
    const val FOLDER = "Загрузчик"

    fun publish(ctx: Context, file: File, subfolder: String? = null): Pair<Uri, String> {
        val mime = MimeTypeMap.getSingleton().getMimeTypeFromExtension(file.extension.lowercase()) ?: "application/octet-stream"
        val resolver = ctx.contentResolver
        val values = ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, file.name)
            put(MediaStore.MediaColumns.MIME_TYPE, mime)
            put(MediaStore.MediaColumns.RELATIVE_PATH, "${Environment.DIRECTORY_DOWNLOADS}/$FOLDER" + (subfolder?.let { "/$it" } ?: ""))
            put(MediaStore.MediaColumns.IS_PENDING, 1)
        }
        val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
            ?: throw UserError("Не удалось сохранить файл в «Загрузки»")
        try {
            resolver.openOutputStream(uri)!!.use { out -> file.inputStream().use { it.copyTo(out) } }
            values.clear()
            values.put(MediaStore.MediaColumns.IS_PENDING, 0)
            resolver.update(uri, values, null, null)
        } catch (e: Exception) {
            resolver.delete(uri, null, null)
            throw e
        } finally {
            file.delete()
        }
        return uri to mime
    }
}
