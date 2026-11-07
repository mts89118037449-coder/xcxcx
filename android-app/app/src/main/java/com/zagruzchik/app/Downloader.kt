package com.zagruzchik.app

import android.content.ContentValues
import android.content.Context
import android.net.Uri
import android.os.Environment
import android.provider.MediaStore
import android.text.Html
import android.webkit.MimeTypeMap
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
 * Spotify отдаёт музыку только в зашифрованном виде, поэтому берём название и исполнителя
 * со страницы трека и ищем этот же трек на YouTube.
 */
object Spotify {
    fun isSpotify(url: String) = url.contains("spotify.com/") || url.contains("spotify.link/")
    fun isTrack(url: String) = url.contains("/track/") || url.contains("spotify.link/")

    fun searchQuery(url: String): String {
        val conn = URL(url).openConnection() as HttpURLConnection
        conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36")
        conn.connectTimeout = 15_000
        conn.readTimeout = 15_000
        val page = conn.inputStream.bufferedReader().use { it.readText() }
        fun meta(name: String) = Regex("""og:$name" content="([^"]*)"""").find(page)?.groupValues?.get(1)
            ?.let { Html.fromHtml(it, Html.FROM_HTML_MODE_LEGACY).toString() }
        val title = meta("title") ?: throw UserError("Не удалось прочитать трек Spotify")
        val artist = meta("description")?.substringBefore(" · ").orEmpty()
        return "$artist - $title".trim(' ', '-')
    }
}

object Downloader {

    /** Скачивает ссылку и возвращает готовые файлы (во временной папке приложения). */
    fun download(ctx: Context, url: String, requested: Format, jobId: String, onProgress: (Float, String) -> Unit): List<File> {
        App.awaitReady()

        var source = url
        var format = requested
        if (Spotify.isSpotify(url)) {
            if (!Spotify.isTrack(url)) throw UserError("Spotify: поддерживаются только ссылки на отдельные треки")
            val query = Spotify.searchQuery(url)
            onProgress(0f, "Spotify: $query")
            source = "ytsearch1:$query audio"
            format = Format.MP3
        }

        val dir = File(ctx.cacheDir, "dl/$jobId").apply { deleteRecursively(); mkdirs() }
        val request = YoutubeDLRequest(source).apply {
            addOption("--no-playlist")
            addOption("--no-mtime")
            addOption("--embed-metadata")
            addOption("-P", dir.absolutePath)
            addOption("-o", "%(title).80B [%(id)s].%(ext)s")
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

        try {
            YoutubeDL.getInstance().execute(request, processId = jobId, redirectErrorStream = false) { progress, _, line ->
                onProgress(progress, line)
            }
        } catch (e: YoutubeDLException) {
            throw UserError(explain(e.message.orEmpty()))
        }

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

    fun publish(ctx: Context, file: File): Pair<Uri, String> {
        val mime = MimeTypeMap.getSingleton().getMimeTypeFromExtension(file.extension.lowercase()) ?: "application/octet-stream"
        val resolver = ctx.contentResolver
        val values = ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, file.name)
            put(MediaStore.MediaColumns.MIME_TYPE, mime)
            put(MediaStore.MediaColumns.RELATIVE_PATH, "${Environment.DIRECTORY_DOWNLOADS}/$FOLDER")
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
