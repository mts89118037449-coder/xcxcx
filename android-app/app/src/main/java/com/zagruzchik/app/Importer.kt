package com.zagruzchik.app

import com.yausername.youtubedl_android.YoutubeDLRequest
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicInteger

/**
 * Перенос медиатеки из других сервисов: по ссылке на плейлист/альбом/лайки или из файла/списка.
 * Песни дополняются данными Deezer (обложка, длительность, без цензуры) — так медиатека сразу
 * выглядит как своя, а включаются они как обычно (полная версия ищется при нажатии).
 */
object Importer {
    class Result(val name: String, val source: String, val tracks: List<Track>)

    /** Сервисы на экране переноса: подсказка, где взять ссылку. */
    enum class Source(val title: String, val service: Service?, val hint: String, val byLink: Boolean = true) {
        SPOTIFY("Spotify", Service.SPOTIFY,
            "Плейлист → «⋯» → Поделиться → Скопировать ссылку.\n«Любимые треки» ссылкой не делятся: на компьютере выделите все (Ctrl+A) и перетащите в новый плейлист — его и переносите."),
        YANDEX("Яндекс Музыка", Service.YANDEX,
            "Плейлист → Поделиться → Скопировать ссылку.\n«Мне нравится» — это music.yandex.ru/users/ВАШ_ЛОГИН/playlists/3 (профиль должен быть открыт). Работает без VPN."),
        APPLE("Apple Music", Service.APPLE,
            "Плейлист или альбом → «⋯» → Поделиться → Скопировать ссылку. Чтобы перенести всю медиатеку — сделайте из «Песен» плейлист."),
        YOUTUBE_MUSIC("YouTube Music", Service.YOUTUBE_MUSIC,
            "Плейлист → Поделиться → Скопировать ссылку. Плейлист должен быть открыт по ссылке. «Понравившиеся» — скопируйте в свой плейлист."),
        SOUNDCLOUD("SoundCloud", Service.SOUNDCLOUD,
            "Плейлист → Share → Copy link. Лайки: soundcloud.com/ВАШ_НИК/likes (лайки должны быть открыты)."),
        DEEZER("Deezer", Service.DEEZER, "Плейлист → Поделиться → Скопировать ссылку. «Любимые треки» — тоже плейлист."),
        VK("VK Музыка", Service.VK,
            "ВК не отдаёт музыку без входа. Быстрее всего: в TuneMyMusic или Soundiiz перенесите VK → «Файл» (CSV) и выберите файл здесь. Или вставьте список «Исполнитель — Песня».",
            byLink = false),
        FILE("Файл, список", null,
            "CSV из Exportify, TuneMyMusic, Soundiiz — или любой текст, где каждая строка «Исполнитель — Песня».", byLink = false);

        /** Приложения сервиса на телефоне — из них можно перенести «Любимые» прямо с экрана. */
        val apps: List<String> get() = when (this) {
            SPOTIFY -> listOf("com.spotify.music"); YANDEX -> listOf("ru.yandex.music"); APPLE -> listOf("com.apple.android.music")
            YOUTUBE_MUSIC -> listOf("com.google.android.apps.youtube.music"); SOUNDCLOUD -> listOf("com.soundcloud.android")
            DEEZER -> listOf("deezer.android.app"); VK -> listOf("com.uma.musicvk", "com.vkontakte.android"); FILE -> emptyList()
        }

    }

    // ---------------- По ссылке ----------------

    fun fromLink(url: String): Result {
        val u = url.trim()
        val service = Service.of(u) ?: throw UserError("Это не ссылка на музыкальный сервис")
        return when (service) {
            Service.SOUNDCLOUD -> soundcloud(u)
            Service.YOUTUBE, Service.YOUTUBE_MUSIC ->
                if (u.contains("list=")) youtube(u, service) else single(u, service)
            Service.VK, Service.ZVUK, Service.ZAYCEV ->
                throw UserError("${service.title} не отдаёт плейлисты без входа. Перенесите через файл (TuneMyMusic/Soundiiz → CSV) или вставьте список песен.")
            else -> single(u, service)
        }
    }

    private fun single(u: String, service: Service): Result {
        val item = Music.resolve(u, null)
        if (item.tracks.isEmpty()) throw UserError("В плейлисте нет песен")
        return Result(item.name.ifBlank { service.title }, service.title, item.tracks)
    }

    /** Плейлист целиком через yt-dlp (постоянный процесс, иначе обычный запуск). */
    private fun flat(url: String): Pair<String, JSONArray> {
        App.awaitReady()
        try { return YtdlpDaemon.playlist(url) } catch (_: YtdlpDaemon.Unavailable) {}
        val r = YoutubeDLRequest(url).apply { addOption("--flat-playlist"); addOption("-J"); addOption("--no-warnings") }
        val o = JSONObject(Ytdlp.execute(r, timeoutSec = 120).out)
        val arr = JSONArray()
        o.optJSONArray("entries")?.let { e ->
            for (i in 0 until e.length()) e.optJSONObject(i)?.let { x ->
                arr.put(JSONObject().put("url", x.optString("url").ifEmpty { x.optString("webpage_url") }).put("title", x.optString("title"))
                    .put("artist", x.optString("uploader").ifEmpty { x.optString("channel") }).put("duration", x.optDouble("duration", 0.0)))
            }
        }
        return o.optString("title") to arr
    }

    private val NOISE = Regex(
        """\s*[(\[][^)\]]*(official|video|audio|lyric|lyrics|клип|видео|mv|hd|4k|remaster|visualizer|текст)[^)\]]*[)\]]""",
        RegexOption.IGNORE_CASE,
    )

    private fun youtube(u: String, service: Service): Result {
        val (title, arr) = flat(u)
        val tracks = (0 until arr.length()).mapNotNull { i ->
            val e = arr.optJSONObject(i) ?: return@mapNotNull null
            var t = e.optString("title").replace(NOISE, "").trim()
            var a = e.optString("artist").removeSuffix(" - Topic").removeSuffix("VEVO").trim()
            val parts = t.split(Regex("""\s+[—–-]\s+"""), limit = 2)
            if (parts.size == 2) { a = parts[0].trim(); t = parts[1].trim() }
            if (t.isBlank() || t == "null") null else Track(t, a, e.optDouble("duration", 0.0).toInt())
        }
        if (tracks.isEmpty()) throw UserError("Плейлист пустой или закрытый")
        return Result(title.ifBlank { service.title }, service.title, tracks)
    }

    /** SoundCloud отдаёт в плейлисте только ссылки — названия берём из его превью ссылок (oEmbed). */
    private fun soundcloud(u: String): Result {
        if (!u.contains("/sets/") && !u.contains("/likes")) return single(u, Service.SOUNDCLOUD)
        val (title, arr) = flat(u)
        val urls = (0 until arr.length()).mapNotNull { arr.optJSONObject(it)?.optString("url")?.takeIf { s -> s.startsWith("http") } }.take(500)
        val pool = Executors.newFixedThreadPool(8)
        try {
            val tracks = urls.map { url -> pool.submit<Track?> { runCatching { SoundCloudSource.resolve(url).tracks.first() }.getOrNull() } }
                .mapNotNull { runCatching { it.get() }.getOrNull() }
            if (tracks.isEmpty()) throw UserError("SoundCloud не показал песни. Плейлист или лайки открыты?")
            return Result(title.ifBlank { "SoundCloud" }, "SoundCloud", tracks)
        } finally { pool.shutdown() }
    }

    // ---------------- Из файла или текста ----------------

    fun fromText(text: String, name: String = "Перенос"): Result {
        val lines = text.lines().map { it.trim() }.filter { it.isNotEmpty() }
        if (lines.isEmpty()) throw UserError("Пусто — вставьте список или выберите файл")
        val tracks = (json(text) ?: csv(lines) ?: lines.mapNotNull(::line)).filter { !isId(it.artist) && !isId(it.title) }
        if (tracks.isEmpty()) throw UserError("Не понял формат. Нужны строки вида «Исполнитель — Песня» или CSV-файл с колонками названия и исполнителя.")
        return Result(name, "Файл", tracks.distinctBy { Library.key(it) })
    }

    /** Ссылка/идентификатор вместо имени (spotify:artist:…, https://…). */
    fun isId(s: String) = s.startsWith("spotify:") || s.startsWith("http://") || s.startsWith("https://")

    /**
     * JSON-выгрузка Spotify («Конфиденциальность → Скачать данные»): YourLibrary.json (tracks: artist/track),
     * StreamingHistory*.json (artistName/trackName) и расширенная история (master_metadata_*).
     */
    private fun json(text: String): List<Track>? {
        val t = text.trimStart()
        if (!t.startsWith("{") && !t.startsWith("[")) return null
        val arr = runCatching {
            if (t.startsWith("[")) org.json.JSONArray(t) else org.json.JSONObject(t).let { o ->
                o.optJSONArray("tracks") ?: o.optJSONArray("items") ?: o.keys().asSequence().mapNotNull { o.optJSONArray(it) }.firstOrNull()
            }
        }.getOrNull() ?: return null
        val out = mutableListOf<Track>()
        for (i in 0 until arr.length()) {
            val o = arr.optJSONObject(i) ?: continue
            val track = o.optJSONObject("track")
            val title = listOf("track", "trackName", "master_metadata_track_name", "title", "name", "song")
                .firstNotNullOfOrNull { k -> o.optString(k).takeIf { it.isNotBlank() && it != "null" && o.opt(k) is String } }
                ?: track?.optString("name")?.takeIf { it.isNotBlank() } ?: continue
            val artist = listOf("artist", "artistName", "master_metadata_album_artist_name", "artists")
                .firstNotNullOfOrNull { k -> o.optString(k).takeIf { it.isNotBlank() && it != "null" && o.opt(k) is String } }
                ?: track?.optJSONArray("artists")?.let { a -> (0 until a.length()).mapNotNull { a.optJSONObject(it)?.optString("name") }.joinToString(", ") }
                ?: ""
            out += Track(title.trim(), artist.trim())
        }
        return out.takeIf { it.isNotEmpty() }
    }

    /** CSV с заголовком: ищем колонки названия и исполнителя (Exportify, TuneMyMusic, Soundiiz и др.). */
    private fun csv(lines: List<String>): List<Track>? {
        val head = lines.first()
        val sep = listOf(',', ';', '\t').maxByOrNull { c -> head.count { it == c } } ?: return null
        if (head.count { it == sep } < 1) return null
        val cols = split(head, sep).map { it.lowercase().trim() }
        val ti = cols.indexOfFirst { it in setOf("track name", "track", "title", "name", "song", "song name", "название", "трек", "песня") }
            .takeIf { it >= 0 } ?: cols.indexOfFirst { it.contains("track") && it.contains("name") || it.contains("title") }
        // Колонки с идентификаторами (Exportify: «Artist URI(s)», «Artist IDs») — не имена, их пропускаем.
        fun idCol(c: String) = listOf("uri", " id", "ids", "url", "link", "ссылк").any { c.contains(it) }
        val artistCols = cols.indices.filter { (cols[it].startsWith("artist") || cols[it].contains("исполнител")) && !idCol(cols[it]) }
        val ai = artistCols.firstOrNull { cols[it].contains("name") || cols[it].contains("имя") } ?: artistCols.firstOrNull() ?: -1
        if (ti < 0 || ai < 0) return null
        if (idCol(cols[ti])) return null
        val di = cols.indexOfFirst { it.contains("duration") || it.contains("длительн") }
        return lines.drop(1).mapNotNull { l ->
            val f = split(l, sep)
            val t = f.getOrNull(ti)?.trim().orEmpty()
            val a = f.getOrNull(ai)?.trim().orEmpty().replace(Regex("""\s*[,;]\s*"""), ", ")
            if (t.isEmpty()) null
            else Track(t, a, f.getOrNull(di)?.trim()?.toLongOrNull()?.let { if (it > 10_000) (it / 1000).toInt() else it.toInt() } ?: 0)
        }
    }

    /** Разбор строки CSV с кавычками. */
    private fun split(line: String, sep: Char): List<String> {
        val out = mutableListOf<String>(); val cur = StringBuilder(); var q = false; var i = 0
        while (i < line.length) {
            val c = line[i]
            when {
                c == '"' && q && i + 1 < line.length && line[i + 1] == '"' -> { cur.append('"'); i++ }
                c == '"' -> q = !q
                c == sep && !q -> { out += cur.toString(); cur.clear() }
                else -> cur.append(c)
            }
            i++
        }
        out += cur.toString()
        return out
    }

    /** «Исполнитель — Песня», «1. Исполнитель - Песня», «Песня by Исполнитель», «Исполнитель⇥Песня». */
    private fun line(raw: String): Track? {
        val l = raw.replace(Regex("""^\s*\d+[.)]\s*"""), "").trim()
        if (l.length < 2) return null
        l.split('\t').takeIf { it.size >= 2 }?.let { return Track(it[1].trim(), it[0].trim()) }
        Regex("""^(.+?)\s+[—–-]\s+(.+)$""").find(l)?.let { return Track(it.groupValues[2].trim(), it.groupValues[1].trim()) }
        Regex("""^(.+?)\s+by\s+(.+)$""", RegexOption.IGNORE_CASE).find(l)?.let { return Track(it.groupValues[1].trim(), it.groupValues[2].trim()) }
        return Track(l, "")
    }

    // ---------------- Обложки и данные ----------------

    /**
     * Дополняем песни из Deezer (обложка, длительность, ISRC, «без цензуры»), не меняя названий.
     * [progress] — сколько уже обработано.
     */
    // Deezer пускает ~50 запросов за 5 секунд: шагаем чуть реже, чтобы большие медиатеки не получали отказов.
    private val nextSlot = java.util.concurrent.atomic.AtomicLong(0)
    private fun pace() {
        val now = System.currentTimeMillis()
        val slot = nextSlot.getAndUpdate { maxOf(it, now) + 110 }.coerceAtLeast(now)
        if (slot > now) Thread.sleep(slot - now)
    }

    fun enrich(tracks: List<Track>, progress: (Int) -> Unit): List<Track> {
        val done = AtomicInteger()
        val pool = Executors.newFixedThreadPool(8)
        try {
            return tracks.map { t ->
                pool.submit<Track> {
                    val r = if (t.cover != null && t.durationSec > 0) t else runCatching {
                        pace()
                        val data = Http.cachedJson("https://api.deezer.com/search?limit=5&q=" + Http.enc("${t.artist} ${t.title}".trim()), 8000).optJSONArray("data")
                        val found = data?.let { d -> (0 until d.length()).map { DeezerSource.track(d.getJSONObject(it)) } }.orEmpty()
                        val best = if (t.artist.isBlank()) found.firstOrNull()
                        else Match.ranked(t, found) { Triple(it.title, it.artist, it.durationSec) }.let { ok -> ok.firstOrNull { it.explicit } ?: ok.firstOrNull() }
                        if (best == null) t else t.copy(
                            artist = t.artist.ifBlank { best.artist }, cover = t.cover ?: best.cover,
                            durationSec = if (t.durationSec > 0) t.durationSec else best.durationSec,
                            isrc = t.isrc ?: best.isrc, explicit = t.explicit || best.explicit, url = t.url ?: best.url,
                        )
                    }.getOrDefault(t)
                    progress(done.incrementAndGet())
                    r
                }
            }.map { it.get() }
        } finally { pool.shutdown() }
    }
}
