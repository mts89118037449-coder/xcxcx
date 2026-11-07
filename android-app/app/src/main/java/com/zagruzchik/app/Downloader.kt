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

    /** Приложения делятся текстом вида «Смотри! https://vm.tiktok.com/…» — достаём только ссылку. */
    fun extract(text: String?): String? =
        text?.let { URL_RE.find(it)?.value?.trimEnd('.', ',', ')', '!', '?') }

    fun defaultFormat(url: String) = if (Music.isMusic(url) || url.contains("bandcamp.com")) Format.MP3 else Format.BEST
}

/** Позволяет остановить загрузку: помечаем отмену и убиваем текущий процесс yt-dlp. */
class CancelToken {
    @Volatile var cancelled = false
        private set
    @Volatile var processId: String? = null

    fun cancel() {
        cancelled = true
        processId?.let { runCatching { YoutubeDL.getInstance().destroyProcessById(it) } }
    }
}

class CancelledError : Exception("Отменено")

/** Что показывать в карточке загрузки. */
interface DownloadListener {
    fun onTitle(title: String)
    fun onProgress(percent: Float, detail: String)
}

object Downloader {

    /** Результат: готовые файлы во временной папке и подпапка в «Загрузках» (для альбомов). */
    class Result(val files: List<File>, val subfolder: String? = null, val failed: Int = 0)

    private val DESTINATION = Regex("""Destination: (.+)$""")
    private val SPEED = Regex("""of\s+~?\s*([\d.]+\w+)\s+at\s+([\d.]+\w+/s)(?:\s+ETA\s+(\S+))?""")

    fun download(
        ctx: Context, url: String, format: Format, jobId: String, token: CancelToken, ui: DownloadListener, hint: String? = null,
    ): Result {
        App.awaitReady()
        if (token.cancelled) throw CancelledError()
        if (Regex("""discord(app)?\.com/channels/""").containsMatchIn(url)) {
            throw UserError("Discord: откройте вложение и скопируйте ссылку на сам файл (cdn.discordapp.com/…), а не на сообщение.")
        }
        val dir = File(ctx.cacheDir, "dl/$jobId").apply { deleteRecursively(); mkdirs() }
        try {
            if (Music.needsSearch(url)) return downloadMusic(Music.resolve(url, hint), dir, jobId, ctx, token, ui)
            if (Service.of(url) == Service.YANDEX) {
                // Сначала пробуем оригинальный звук Яндекса, если не вышло — тот же трек с YouTube.
                try {
                    return downloadDirect(url, Format.MP3, dir, jobId, ctx, token, ui)
                } catch (e: UserError) {
                    if (token.cancelled) throw e
                    dir.listFiles()?.forEach { it.delete() }
                    return downloadMusic(Music.resolve(url, hint), dir, jobId, ctx, token, ui)
                }
            }
            return downloadDirect(url, format, dir, jobId, ctx, token, ui)
        } catch (e: Exception) {
            if (token.cancelled) {
                dir.deleteRecursively()
                throw CancelledError()
            }
            throw e
        }
    }

    private fun downloadDirect(url: String, format: Format, dir: File, jobId: String, ctx: Context, token: CancelToken, ui: DownloadListener): Result {
        val request = baseRequest(url, dir, ctx, format)
        request.addOption("-o", "%(title).80B [%(id)s].%(ext)s")
        var titled = false
        execute(request, jobId, token) { p, line ->
            if (!titled) DESTINATION.find(line)?.let {
                titled = true
                ui.onTitle(File(it.groupValues[1]).nameWithoutExtension.replace(Regex("""\.f\d+$"""), "").replace(Regex("""\s*\[[^\]]+]$"""), "").trim())
            }
            ui.onProgress(p, speed(line))
        }
        return Result(collect(dir))
    }

    /** Ищет видео на YouTube и возвращает его id (для трансфера). */
    fun youtubeId(query: String): String? {
        App.awaitReady()
        val r = YoutubeDLRequest("ytsearch1:$query").apply {
            addOption("--flat-playlist")
            addOption("--print", "id")
            addOption("--no-warnings")
        }
        return runCatching { YoutubeDL.getInstance().execute(r).out.lines().map { it.trim() }.firstOrNull { it.length == 11 } }.getOrNull()
    }

    /** «10.5MiB · 2.3MiB/s · осталось 00:05» из строки прогресса yt-dlp. */
    private fun speed(line: String): String {
        val m = SPEED.find(line) ?: return ""
        val (size, rate, eta) = m.destructured
        return listOfNotNull(size, rate, eta.takeIf { it.isNotEmpty() && it != "Unknown" }?.let { "осталось $it" }).joinToString(" · ")
    }

    private fun downloadMusic(item: MusicItem, dir: File, jobId: String, ctx: Context, token: CancelToken, ui: DownloadListener): Result {
        val n = item.tracks.size
        ui.onTitle(if (n > 1) "${item.name} ($n)" else item.tracks.first().label)
        var failed = 0
        var lastError: UserError? = null
        item.tracks.forEachIndexed { i, t ->
            if (token.cancelled) throw CancelledError()
            val prefix = if (n > 1) "${i + 1}/$n: ${t.label}" else ""
            ui.onProgress(i * 100f / n, listOf(prefix, "ищу лучший вариант…").filter { it.isNotEmpty() }.joinToString(" · "))
            try {
                downloadTrack(t, item, dir, ctx, "$jobId-$i", token) { source, p, line ->
                    val detail = listOf(prefix, source, speed(line)).filter { it.isNotEmpty() }.joinToString(" · ")
                    ui.onProgress((i + p.coerceIn(0f, 100f) / 100f) * 100f / n, detail)
                }
            } catch (e: UserError) {
                if (token.cancelled) throw CancelledError()
                if (n == 1) throw e
                failed++
                lastError = e
            }
        }
        val files = audios(dir)
        if (files.isEmpty()) throw lastError ?: UserError("Не удалось скачать ни одного трека.")
        return Result(files, subfolder = if (n > 1) safeName(item.name) else null, failed = failed)
    }

    private val AUDIO_EXT = setOf("mp3", "m4a", "opus", "ogg", "webm", "aac", "flac")
    private fun audios(dir: File) = dir.listFiles().orEmpty().filter { it.isFile && it.extension.lowercase() in AUDIO_EXT }

    /** Кандидат из поиска: ссылка, название, автор, длительность и откуда он. */
    internal class Candidate(val url: String, val title: String, val author: String, val duration: Int, val source: String)

    /**
     * Ищет трек в нескольких источниках и выбирает лучший вариант сам:
     * тот же исполнитель и название, длительность ±несколько секунд, без «clean»/ремиксов/каверов/превью.
     */
    /**
     * Скачивает трек, перебирая варианты: до 3 лучших из каждого источника по очереди.
     * Если вариант не скачивается (DRM у платных треков SoundCloud, недоступен в регионе,
     * YouTube просит вход) — берём следующий, а не сдаёмся.
     */
    private fun downloadTrack(
        t: Track, item: MusicItem, dir: File, ctx: Context, id: String, token: CancelToken,
        progress: (source: String, percent: Float, line: String) -> Unit,
    ) {
        val ytm = "https://music.youtube.com/search?q=" + Http.enc(t.query) + "#songs"
        val searches = listOf(
            "YouTube Music" to ytm,
            "SoundCloud" to "scsearch8:${t.query}",
            "YouTube" to "ytsearch6:${t.query}",
        ).let { if (Settings.sourceOrder(ctx) == Settings.SourceOrder.SOUNDCLOUD) listOf(it[1], it[0], it[2]) else it }

        val problems = mutableListOf<String>()
        var attempt = 0
        for ((name, query) in searches) {
            if (token.cancelled) throw CancelledError()
            progress(name, 0f, "")
            val candidates = Match.ranked(t, search(query, name)) { Triple(it.title, it.author, it.duration) }.take(3)
            for (c in candidates) {
                if (token.cancelled) throw CancelledError()
                val before = dir.listFiles().orEmpty().toSet()
                try {
                    execute(trackRequest(c.url, t, item, dir, ctx), "$id-${attempt++}", token) { p, line -> progress(c.source, p, line) }
                    if (audios(dir).any { it !in before }) return
                    problems += "$name: файл не появился"
                } catch (e: UserError) {
                    if (token.cancelled) throw CancelledError()
                    problems += "$name: ${e.message}"
                    // Убираем недокачанное, чтобы не перепутать с готовым файлом.
                    dir.listFiles().orEmpty().filter { it !in before }.forEach { it.delete() }
                }
            }
        }
        throw UserError(
            if (problems.isEmpty()) "Не нашёл «${t.label}» ни в YouTube Music, ни в SoundCloud, ни в YouTube."
            else "Не получилось скачать «${t.label}». ${problems.distinct().take(2).joinToString("; ")}"
        )
    }

    private fun search(query: String, source: String): List<Candidate> {
        val r = YoutubeDLRequest(query).apply {
            addOption("--flat-playlist")
            addOption("--playlist-end", "8")
            addOption("--no-warnings")
            addOption("--print", "%(url)s\t%(title)s\t%(artist,artists,creator,uploader,channel)s\t%(duration)s")
        }
        val out = runCatching { YoutubeDL.getInstance().execute(r).out }.getOrNull() ?: return emptyList()
        return parseSearch(out, source)
    }

    /** Разбирает вывод поиска yt-dlp: «ссылка⇥название⇥автор⇥длительность» по строке на результат. */
    internal fun parseSearch(out: String, source: String): List<Candidate> {
        return out.lines().mapNotNull { line ->
            val f = line.split('\t')
            if (f.size < 4 || !f[0].startsWith("http")) return@mapNotNull null
            val author = f[2].takeIf { it != "NA" }.orEmpty().removeSuffix(" - Topic")
            val duration = f[3].toDoubleOrNull()?.toInt() ?: 0
            // У SoundCloud и YouTube исполнитель часто только в названии: «Кино - Группа крови».
            val artistField = listOf(author, f[1].substringBefore(" - ", "")).filter { it.isNotBlank() }.joinToString(" | ")
            Candidate(f[0], f[1], artistField, duration, source)
        }
    }

    private fun trackRequest(url: String, t: Track, item: MusicItem, dir: File, ctx: Context): YoutubeDLRequest {
        val original = Settings.quality(ctx) == Settings.Quality.ORIGINAL
        return baseRequest(url, dir, ctx, if (original) Format.BEST else Format.MP3).apply {
            if (original) {
                // Звук без перекодирования: M4A, а если его нет — Opus.
                addOption("-f", "bestaudio[ext=m4a]/bestaudio")
                addOption("-x")
            }
            addOption("-o", "${safeName(t.label)}.%(ext)s")
            // Теги — как в музыкальном сервисе, а не как в названии ролика.
            tag(this, "title", t.title)
            tag(this, "track", t.title)
            if (t.artist.isNotEmpty()) tag(this, "artist", t.artist)
            if (item.type == "album") tag(this, "album", item.name)
            // Обложку надёжно встраивает только ffmpeg в MP3 (для Opus нужен модуль, которого может не быть).
            if (!original) addOption("--embed-thumbnail")
        }
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

    private fun execute(request: YoutubeDLRequest, id: String, token: CancelToken, cb: (Float, String) -> Unit) {
        token.processId = id
        if (token.cancelled) throw CancelledError()
        try {
            YoutubeDL.getInstance().execute(request, processId = id, redirectErrorStream = false) { p, _, line -> cb(p, line) }
        } catch (e: YoutubeDL.CanceledException) {
            throw CancelledError()
        } catch (e: YoutubeDLException) {
            if (token.cancelled) throw CancelledError()
            throw UserError(explain(e.message.orEmpty()))
        } finally {
            token.processId = null
        }
    }

    private fun collect(dir: File): List<File> {
        val files = dir.listFiles().orEmpty()
            .filter { it.isFile && !it.name.endsWith(".part") && !it.name.endsWith(".ytdl") && !it.name.endsWith(".temp") }
        if (files.isEmpty()) throw UserError("Файл не найден после загрузки. Попробуйте другой формат.")
        return files
    }

    private fun explain(err: String): String {
        val e = err.lowercase()
        return when {
            "drm" in e -> "Трек защищён от скачивания (платный, DRM)."
            "not available in your country" in e || "geo" in e && "restrict" in e || "not available from your location" in e ->
                "Недоступно в вашей стране. Попробуйте с VPN или без него."
            "video unavailable" in e || "track is not available" in e || "this video is not available" in e ->
                "Недоступно: удалено или скрыто автором."
            "age" in e && ("confirm" in e || "restricted" in e) || "inappropriate" in e ->
                "Есть возрастное ограничение. Войдите в аккаунт: Настройки → Аккаунты."
            "sign in" in e || "login" in e || "log in" in e || "cookies" in e || "not a bot" in e ->
                "Сайт требует вход. Войдите в аккаунт: Настройки → Аккаунты — и повторите."
            "private" in e -> "Это приватная публикация. Нужен вход в аккаунт, у которого есть к ней доступ."
            "unsupported url" in e -> "Этот сайт не поддерживается."
            "no video" in e -> "В публикации нет видео."
            "http error 403" in e || "forbidden" in e -> "Сайт не отдал файл (403). Попробуйте позже или с другим VPN."
            "http error 429" in e || "too many requests" in e -> "Сайт временно ограничил скачивание. Подождите немного."
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
