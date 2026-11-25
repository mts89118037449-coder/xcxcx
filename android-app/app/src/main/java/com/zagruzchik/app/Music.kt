package com.zagruzchik.app

import android.net.Uri
import org.json.JSONArray
import org.json.JSONObject

/** Трек в «нейтральном» виде: по нему ищем этот же трек в других сервисах и на YouTube. */
data class Track(
    val title: String,
    val artist: String,
    val durationSec: Int = 0,
    val isrc: String? = null,
    val cover: String? = null,
    /** Страница трека в каталоге (Deezer/Apple) — по ней трек можно скачать. */
    val url: String? = null,
    /** Официальный 30-секундный фрагмент (Deezer/Apple/Spotify) — играет мгновенно, пока ищется полная версия. */
    val preview: String? = null,
    /** Версия без цензуры (по данным каталога). */
    val explicit: Boolean = false,
) {
    val label get() = if (artist.isEmpty()) title else "$artist — $title"
    val query get() = "$artist $title".trim()
}

/** Трек, альбом или плейлист. */
data class MusicItem(val type: String, val name: String, val tracks: List<Track>, val source: Service?)

/** Музыкальные сервисы: откуда можно взять ссылку и куда сделать трансфер. */
enum class Service(val title: String, val packages: List<String>) {
    SPOTIFY("Spotify", listOf("com.spotify.music")),
    YANDEX("Яндекс Музыка", listOf("ru.yandex.music")),
    APPLE("Apple Music", listOf("com.apple.android.music")),
    YOUTUBE_MUSIC("YouTube Music", listOf("com.google.android.apps.youtube.music")),
    YOUTUBE("YouTube", listOf("com.google.android.youtube")),
    VK("VK Музыка", listOf("com.uma.musicvk", "com.vkontakte.android")),
    ZVUK("Звук", listOf("com.zvooq.openplay")),
    DEEZER("Deezer", listOf("deezer.android.app")),
    SOUNDCLOUD("SoundCloud", listOf("com.soundcloud.android")),
    ZAYCEV("Зайцев.нет", emptyList());

    /** Ссылка на поиск внутри сервиса — когда точную ссылку найти не удалось. */
    fun searchUrl(q: String): String {
        val e = Http.enc(q)
        return when (this) {
            SPOTIFY -> "https://open.spotify.com/search/${Uri.encode(q)}"
            YANDEX -> "https://music.yandex.ru/search?text=$e"
            APPLE -> "https://music.apple.com/us/search?term=$e"
            YOUTUBE_MUSIC -> "https://music.youtube.com/search?q=$e"
            YOUTUBE -> "https://www.youtube.com/results?search_query=$e"
            VK -> "https://vk.com/audio?q=$e"
            DEEZER -> "https://www.deezer.com/search/${Uri.encode(q)}"
            SOUNDCLOUD -> "https://soundcloud.com/search/sounds?q=$e"
            ZVUK -> "https://zvuk.com/search?query=$e"
            ZAYCEV -> "https://zaycev.net/search?query_search=$e"
        }
    }

    companion object {
        fun of(url: String): Service? {
            val host = runCatching { Uri.parse(url).host.orEmpty().lowercase().removePrefix("www.").removePrefix("m.") }.getOrDefault("")
            return when {
                host.endsWith("spotify.com") || host == "spotify.link" -> SPOTIFY
                host.startsWith("music.yandex.") -> YANDEX
                host == "music.apple.com" || host == "itunes.apple.com" -> APPLE
                host == "music.youtube.com" -> YOUTUBE_MUSIC
                host == "youtube.com" || host == "youtu.be" -> YOUTUBE
                (host == "vk.com" || host == "vk.ru") && (url.contains("/audio") || url.contains("/music")) -> VK
                host.endsWith("deezer.com") || host == "deezer.page.link" || host == "link.deezer.com" || host == "dzr.page.link" -> DEEZER
                host.endsWith("soundcloud.com") || host == "on.soundcloud.com" -> SOUNDCLOUD
                host == "zvuk.com" || host == "share.zvuk.com" -> ZVUK
                host.endsWith("zaycev.net") -> ZAYCEV
                else -> null
            }
        }
    }
}

/** Сравнение треков из разных сервисов: тот же ли это трек, а не ремикс или кавер. */
object Match {
    internal val VERSION_WORDS = listOf(
        "remix", "live", "cover", "karaoke", "instrumental", "acoustic", "sped up", "slowed", "nightcore", "8d",
        "mix", "edit", "version", "remaster", "reverb", "bass boosted", "ремикс", "кавер", "минус", "караоке",
        // Версии с цензурой: берём оригинал, если исходный трек не «clean».
        "clean", "radio edit", "censored", "цензур", "preview", "snippet", "teaser", "tiktok",
        // Другие исполнения и переделки.
        "piano", "пианино", "фортепиано", "hardstyle", "phonk", "фонк", "speed up", "speedup", "ускорен", "замедлен",
        "lofi", "lo fi", "rmx", "flip", "mashup", "мэшап", "violin", "guitar", "orchestra", "bootleg", "cover version",
    )

    /** Пометки «без цензуры» — это плюс, а не «версия с цензурой» (в них есть «censored»/«цензур»). */
    private val UNCENSORED = listOf("без цензур", "uncensored", "explicit", "нецензур", "18+", "dirty")

    fun isUncensored(title: String) = java.text.Normalizer.normalize(title, java.text.Normalizer.Form.NFKC).lowercase().let { t -> UNCENSORED.any { t.contains(it) } }

    /** Слова «другой версии» в названии, которых нет в исходном названии/запросе. */
    fun versionPenaltyWords(title: String, source: String): List<String> {
        val t = norm(title); val src = norm(source)
        val unc = isUncensored(title)
        return VERSION_WORDS.filter { w ->
            t.contains(w) && !src.contains(w) && !(unc && (w == "censored" || w == "цензур"))
        }
    }

    fun norm(s: String) = java.text.Normalizer.normalize(s, java.text.Normalizer.Form.NFKC).lowercase()
        .replace('ё', 'е')
        .replace(Regex("""[^\p{L}\p{N}]+"""), " ")
        .trim()

    /** Название без скобок, «feat.» и приписок через дефис. */
    fun base(title: String) = norm(
        title.replace(Regex("""\s*[(\[].*?[)\]]"""), "")
            .replace(Regex("""\s+(feat|ft)\.?\s.*$""", RegexOption.IGNORE_CASE), "")
            .substringBefore(" - ")
            .substringBefore(" — ")
    )

    // Приписки, которые не делают запись другой версией: «official audio», «лирик видео», «премьера трека»…
    private val PLAIN_TAGS = listOf("official", "audio", "lyric", "лирик", "текст", "премьера", "visualizer", "визуал", "клип", "video", "видео", "hd", "hq", "4k")

    private fun artists(a: String) = norm(a.replace(Regex("""\b(feat|ft)\b""", RegexOption.IGNORE_CASE), ","))
        .split(Regex("""\s*(,|&|\band\b|\bи\b|\bx\b)\s*""")).map { it.trim() }.filter { it.isNotEmpty() }

    // Кириллица и латиница, которые выглядят одинаково (МАЯК Х и МАЯК X): для сравнения — одно и то же.
    private val LOOKALIKE = mapOf('а' to 'a', 'в' to 'b', 'е' to 'e', 'ё' to 'e', 'к' to 'k', 'м' to 'm', 'н' to 'h', 'о' to 'o',
        'р' to 'p', 'с' to 'c', 'т' to 't', 'у' to 'y', 'х' to 'x', 'і' to 'i')

    fun fold(s: String) = String(CharArray(s.length) { i -> LOOKALIKE[s[i]] ?: s[i] })

    // Одно имя, записанное кириллицей и латиницей (Скриптонит и Skriptonit, Оксимирон и Oxxxymiron): сводим к звучанию.
    private val TRANSLIT = mapOf('а' to "a", 'б' to "b", 'в' to "v", 'г' to "g", 'д' to "d", 'е' to "e", 'ё' to "e", 'ж' to "zh", 'з' to "z",
        'и' to "i", 'й' to "i", 'к' to "k", 'л' to "l", 'м' to "m", 'н' to "n", 'о' to "o", 'п' to "p", 'р' to "r", 'с' to "s", 'т' to "t",
        'у' to "u", 'ф' to "f", 'х' to "h", 'ц' to "c", 'ч' to "ch", 'ш' to "sh", 'щ' to "sh", 'ъ' to "", 'ы' to "i", 'ь' to "", 'э' to "e",
        'ю' to "yu", 'я' to "ya", 'і' to "i")
    fun sound(s: String): String {
        val b = StringBuilder(s.length + 4)
        for (ch in s) b.append(TRANSLIT[ch] ?: ch.toString())
        return b.toString().replace(Regex("(.)\\1+"), "$1").replace("ph", "f").replace("x", "ks")
            .replace('c', 'k').replace('q', 'k').replace('w', 'v').replace('y', 'i').replace('j', 'i').replace('z', 's')
            .replace(Regex("(.)\\1+"), "$1")
    }

    /** Название то же, но записано другим алфавитом («Метеоритный дождь» и «Meteoritnyj dozhd»). */
    private fun sameSound(srcTitle: String, title: String): Boolean {
        val ss = sound(base(srcTitle)); val cs = sound(base(title))
        return ss.length >= 3 && (ss == cs || sound(norm(title)).contains(ss))
    }

    /** Исполнитель совпал: по написанию (с учётом похожих букв) или по звучанию (кириллица ↔ латиница). */
    private fun artistHit(src: Track, artist: String, title: String): Boolean {
        val a = fold(norm(artist)); val nt = fold(norm(title))
        val sa = sound(norm(artist)); val st = sound(norm(title))
        return artists(src.artist).any { raw ->
            val it = fold(raw); val sn = sound(raw)
            it.isNotEmpty() && (a.contains(it) || it.contains(a) && a.isNotEmpty() || nt.contains(it)) ||
                sn.length >= 3 && (sa.contains(sn) || sn.contains(sa) && sa.length >= 3 || st.contains(sn))
        }
    }

    /** Оценка похожести кандидата на исходный трек; null — точно не он. */
    fun score(src: Track, title: String, artist: String, durationSec: Int = 0): Int? {
        if (durationSec in 1..59 && (src.durationSec == 0 || src.durationSec >= 75)) return null // 30-секундные превью
        val sb = fold(base(src.title))
        val cb = fold(base(title))
        val nt = fold(norm(title))
        if (sb.isEmpty() || cb.isEmpty()) return null
        if (sb != cb && !nt.contains(sb) && !sb.contains(cb) && !sameSound(src.title, title)) return null
        var s = if (nt == fold(norm(src.title))) 3 else if (sb == cb || sound(base(src.title)) == sound(base(title))) 2 else 0

        if (src.artist.isNotBlank()) {
            // Перезаливы часто пишут исполнителя только в названии: «Не вспоминать МАЯК Х».
            if (!artistHit(src, artist, title)) return null
            s += 2
        }
        val srcLow = norm(src.title)
        s -= 3 * versionPenaltyWords(title, src.title).size
        if (isUncensored(title) && !isUncensored(src.title)) s += 2 // без цензуры — лучше
        // Лишняя приписка в скобках, которой нет у исходного трека («Pianoforte», «Sped Up»…) — скорее всего, другая версия.
        val extra = Regex("""[(\[]([^)\]]+)[)\]]""").findAll(title).filter { !isUncensored(it.value) }.map { norm(it.groupValues[1]) }
            .filter { it.isNotEmpty() && !srcLow.contains(it) && !it.startsWith("feat") && !it.startsWith("ft ") && !PLAIN_TAGS.any { tag -> it.contains(tag) } }
        if (extra.any()) s -= 3
        if (src.durationSec > 0 && durationSec > 0) {
            val d = kotlin.math.abs(src.durationSec - durationSec)
            // Сильно другая длительность — это другая версия, превью или клип с длинным вступлением.
            // Но если название и исполнитель совпали точно — не отбрасываем (длительность в медиатеке бывает неверной), а ставим ниже.
            if (d > 45) { return if (sb == cb && src.artist.isNotBlank()) s - 4 else null }
            s += when {
                d <= 3 -> 2
                d <= 10 -> 1
                d > 25 -> -3
                else -> 0
            }
        }
        return s
    }

    /** Почему кандидат не подошёл — коротко, для отчёта о поиске. null — подошёл. */
    fun reason(src: Track, title: String, artist: String, durationSec: Int = 0): String? {
        val sc = score(src, title, artist, durationSec)
        if (sc != null && sc >= 0) return null
        val sb = fold(base(src.title)); val cb = fold(base(title)); val nt = fold(norm(title))
        if (durationSec in 1..59 && (src.durationSec == 0 || src.durationSec >= 75)) return "короче минуты"
        if (sb.isEmpty() || cb.isEmpty() || (sb != cb && !nt.contains(sb) && !sb.contains(cb) && !sameSound(src.title, title))) return "другое название"
        if (src.artist.isNotBlank()) {
            if (!artistHit(src, artist, title)) return "другой исполнитель"
        }
        if (src.durationSec > 0 && durationSec > 0 && kotlin.math.abs(src.durationSec - durationSec) > 45) return "длительность $durationSec с вместо ${src.durationSec} с"
        return "другая версия (ремикс, live, кавер…)"
    }

    /** Все подходящие кандидаты, от лучшего к худшему (оценка ≥ 0). */
    fun <T> ranked(src: Track, items: List<T>, info: (T) -> Triple<String, String, Int>): List<T> =
        items.mapNotNull { item -> val (t, a, d) = info(item); score(src, t, a, d)?.let { item to it } }
            .filter { it.second >= 0 }
            .sortedByDescending { it.second }
            .map { it.first }

    fun <T> best(src: Track, items: List<T>, info: (T) -> Triple<String, String, Int>): T? =
        items.mapNotNull { item -> val (t, a, d) = info(item); score(src, t, a, d)?.let { item to it } }
            .filter { it.second >= 0 }
            .maxByOrNull { it.second }?.first
}

/**
 * Достаёт треки по ссылке из музыкального сервиса.
 * [hint] — текст, которым поделились вместе со ссылкой (часто там «Исполнитель — Название»);
 * используется, если сервис не отдаёт данные (VK Музыка, Яндекс через зарубежный VPN и т.п.).
 */
object Music {

    /** Сервисы, где сам звук закрыт: качаем этот же трек с YouTube. */
    fun needsSearch(url: String) = Service.of(url) in setOf(Service.SPOTIFY, Service.APPLE, Service.DEEZER, Service.VK, Service.ZVUK, Service.ZAYCEV)

    fun isMusic(url: String) = Service.of(url)?.let { it != Service.YOUTUBE } ?: false

    fun resolve(url: String, hint: String? = null): MusicItem {
        val service = Service.of(url) ?: throw UserError("Это не ссылка на музыкальный сервис")
        val item = try {
            when (service) {
                Service.SPOTIFY -> SpotifySource.resolve(url)
                Service.APPLE -> AppleSource.resolve(url)
                Service.DEEZER -> DeezerSource.resolve(url)
                Service.YANDEX -> YandexSource.resolve(url)
                Service.YOUTUBE_MUSIC, Service.YOUTUBE -> YouTubeSource.resolve(url, service)
                Service.SOUNDCLOUD -> SoundCloudSource.resolve(url)
                Service.VK, Service.ZVUK, Service.ZAYCEV -> null // данные только из текста, которым поделились
            }
        } catch (e: Exception) {
            null // недоступно в стране, закрыто, сбой — ниже есть запасные пути
        }
        if (item != null) return item
        // Запасной путь: описание страницы для превью ссылок (его отдают почти все сервисы).
        PageMeta.track(url)?.let { return MusicItem("track", it.label, listOf(it), service) }
        val t = hintTrack(hint) ?: throw UserError(
            if (service == Service.VK || service == Service.ZVUK || service == Service.ZAYCEV)
                "${service.title} не показывает треки без входа. Поделитесь треком прямо из приложения — название придёт вместе со ссылкой."
            else "${service.title} не отдал данные о песне — возможно, он недоступен в вашей стране. Поделитесь песней прямо из приложения сервиса (название придёт вместе со ссылкой) или найдите её по названию на вкладке «Скачать»."
        )
        return MusicItem("track", t.label, listOf(t), service)
    }

    /** «Rick Astley — Never Gonna Give You Up https://…» → трек. Убирает ссылки и рекламные фразы сервисов. */
    fun hintTrack(hint: String?): Track? {
        if (hint.isNullOrBlank()) return null
        var t = hint.replace(Regex("""https?://\S+"""), " ")
        listOf(
            "Слушайте", "Слушаю", "Послушай", "Послушайте", "на Яндекс Музыке", "в Яндекс Музыке", "Яндекс Музыка", "Яндекс Музыке",
            "в VK Музыке", "VK Музыка", "ВКонтакте", "on Spotify", "в Spotify", "Spotify", "on Apple Music", "Apple Music",
            "on Deezer", "Deezer", "в Звуке", "Звук", "Зайцев.нет", "Listen to", "Check out", "Трек", "трек",
        ).forEach { phrase ->
            // Только целые слова: «трек» не должен вырезаться из «Электрек».
            t = t.replace(Regex("""(?<!\p{L})""" + Regex.escape(phrase) + """(?!\p{L})""", RegexOption.IGNORE_CASE), " ")
        }
        t = t.replace(Regex("""[«»"“”]"""), " ").replace(Regex("""\s+"""), " ").trim(' ', '.', ',', ':', '-', '—', '|', '!')
        if (t.length < 2) return null
        val parts = t.split(Regex("""\s+[—–-]\s+"""), limit = 2)
        return if (parts.size == 2) Track(parts[1].trim(), parts[0].trim()) else Track(t, "")
    }
}

// ---------------- Источники ----------------

object SpotifySource {
    private val ID = Regex("""(track|album|playlist)/([A-Za-z0-9]+)""")

    fun resolve(url: String): MusicItem {
        val m = ID.find(url) ?: ID.find(Http.expand(url) { ID.containsMatchIn(it) })
            ?: throw UserError("Не понял ссылку Spotify. Нужна ссылка на трек, альбом или плейлист.")
        val (type, id) = m.destructured
        val page = Http.get("https://open.spotify.com/embed/$type/$id")
        val json = Regex("""<script id="__NEXT_DATA__" type="application/json">(.*?)</script>""", RegexOption.DOT_MATCHES_ALL)
            .find(page)?.groupValues?.get(1) ?: throw UserError("Spotify не отдал данные. Попробуйте позже.")
        val e = JSONObject(json).getJSONObject("props").getJSONObject("pageProps")
            .getJSONObject("state").getJSONObject("data").getJSONObject("entity")
        val name = clean(e.optString("name", e.optString("title")))
        if (type == "track") {
            val artists = e.optJSONArray("artists") ?: JSONArray()
            val artist = (0 until artists.length()).joinToString(", ") { artists.getJSONObject(it).optString("name") }
            val pv = e.optJSONObject("audioPreview")?.optString("url")?.takeIf { it.isNotEmpty() }
            return MusicItem(type, name, listOf(Track(name, clean(artist), e.optInt("duration") / 1000, preview = pv)), Service.SPOTIFY)
        }
        val list = e.optJSONArray("trackList") ?: throw UserError("Spotify не показал треки")
        val tracks = (0 until list.length()).map {
            val t = list.getJSONObject(it)
            Track(clean(t.optString("title")), clean(t.optString("subtitle")), t.optInt("duration") / 1000,
                preview = t.optJSONObject("audioPreview")?.optString("url")?.takeIf { it.isNotEmpty() })
        }.filter { it.title.isNotEmpty() }
        if (tracks.isEmpty()) throw UserError("Spotify не показал треки. Возможно, плейлист закрытый.")
        return MusicItem(type, name, tracks, Service.SPOTIFY)
    }

    private fun clean(s: String) = s.replace(' ', ' ').replace(Regex("\\s+"), " ").trim()
}

object AppleSource {
    private val SONG = Regex("""/song/[^/]+/(\d+)""")
    private val ALBUM = Regex("""/album/(?:[^/]+/)?(\d+)""")
    private val TRACK_PARAM = Regex("""[?&]i=(\d+)""")

    /** Ищем в магазине страны из ссылки, потом в американском (российский часто отвечает 403). */
    private fun lookup(id: String, country: String, entity: String? = null): JSONArray {
        val tail = entity?.let { "&entity=$it&limit=200" } ?: ""
        for (c in listOf(country, "us").distinct()) {
            val r = runCatching { Http.json("https://itunes.apple.com/lookup?id=$id&country=$c$tail").getJSONArray("results") }.getOrNull()
            if (r != null && r.length() > 0) return r
        }
        return JSONArray()
    }

    fun track(o: JSONObject) = Track(
        o.optString("trackName"), o.optString("artistName"), o.optInt("trackTimeMillis") / 1000,
        cover = o.optString("artworkUrl100").takeIf { it.isNotEmpty() }?.replace("100x100", "600x600"),
        url = o.optString("trackViewUrl").takeIf { it.isNotEmpty() }?.substringBefore("&uo="),
        preview = o.optString("previewUrl").takeIf { it.isNotEmpty() },
        explicit = o.optString("trackExplicitness") == "explicit",
    )

    fun resolve(url: String): MusicItem {
        val country = Regex("""music\.apple\.com/([a-z]{2})/""").find(url)?.groupValues?.get(1) ?: "us"
        val trackId = TRACK_PARAM.find(url)?.groupValues?.get(1) ?: SONG.find(url)?.groupValues?.get(1)
        if (trackId != null) {
            val r = lookup(trackId, country)
            if (r.length() == 0) throw UserError("Apple Music: трек не найден")
            val t = track(r.getJSONObject(0))
            return MusicItem("track", t.label, listOf(t), Service.APPLE)
        }
        if (url.contains("/playlist/")) return playlist(url)
        val albumId = ALBUM.find(url)?.groupValues?.get(1)
            ?: throw UserError("Apple Music: поддерживаются ссылки на треки, альбомы и плейлисты")
        val r = lookup(albumId, country, "song")
        if (r.length() == 0) throw UserError("Apple Music: альбом не найден")
        val name = r.getJSONObject(0).optString("collectionName")
        val tracks = (1 until r.length()).map { r.getJSONObject(it) }.filter { it.optString("wrapperType") == "track" }.map(::track)
        return MusicItem("album", name, tracks, Service.APPLE)
    }

    /** Плейлист: список песен есть в данных самой страницы (до 100 за раз — сколько показывает Apple). */
    private fun playlist(url: String): MusicItem {
        val page = Http.get(url, Http.DESKTOP_UA)
        val json = Regex("""<script type="application/json" id="serialized-server-data">(.*?)</script>""", RegexOption.DOT_MATCHES_ALL)
            .find(page)?.groupValues?.get(1) ?: throw UserError("Apple Music не показал плейлист. Он открыт для всех?")
        val tracks = mutableListOf<Track>()
        fun walk(o: Any?) {
            when (o) {
                is JSONObject -> {
                    if (o.optString("id").startsWith("track-lockup") && o.has("title")) {
                        val art = o.optJSONObject("artwork")?.optJSONObject("dictionary")?.optString("url")
                            ?.replace("{w}", "600")?.replace("{h}", "600")?.replace("{f}", "jpg")
                        tracks += Track(o.optString("title"), o.optString("artistName"), o.optInt("duration") / 1000,
                            cover = art?.takeIf { it.startsWith("http") }, explicit = o.optBoolean("showExplicitBadge"))
                    }
                    o.keys().forEach { walk(o.opt(it)) }
                }
                is JSONArray -> for (i in 0 until o.length()) walk(o.opt(i))
            }
        }
        walk(org.json.JSONTokener(json).nextValue())
        if (tracks.isEmpty()) throw UserError("Apple Music не показал песни плейлиста. Он открыт для всех?")
        val name = Regex("""<meta property="og:title" content="([^"]*)"""").find(page)?.groupValues?.get(1)
            ?.removeSuffix(" on Apple Music")?.replace("&amp;", "&") ?: "Apple Music"
        return MusicItem("playlist", name, tracks.distinctBy { it.title + "|" + it.artist }, Service.APPLE)
    }
}

object DeezerSource {
    private val ID = Regex("""(track|album|playlist)/(\d+)""")

    fun track(o: JSONObject) = Track(
        o.optString("title"), o.optJSONObject("artist")?.optString("name").orEmpty(), o.optInt("duration"),
        isrc = o.optString("isrc").takeIf { it.isNotEmpty() },
        cover = o.optJSONObject("album")?.optString("cover_big")?.takeIf { it.isNotEmpty() },
        url = o.optString("link").takeIf { it.isNotEmpty() },
        preview = o.optString("preview").takeIf { it.isNotEmpty() },
        explicit = o.optBoolean("explicit_lyrics"),
    )

    fun resolve(url: String): MusicItem {
        val m = ID.find(url) ?: ID.find(Http.expand(url) { ID.containsMatchIn(it) })
            ?: throw UserError("Не понял ссылку Deezer")
        val (type, id) = m.destructured
        val o = Http.json("https://api.deezer.com/$type/$id")
        o.optJSONObject("error")?.let { throw UserError("Deezer: ${it.optString("message")}") }
        if (type == "track") {
            val t = track(o)
            return MusicItem(type, t.label, listOf(t), Service.DEEZER)
        }
        val data = o.optJSONObject("tracks")?.optJSONArray("data") ?: JSONArray()
        val cover = o.optString("cover_big").takeIf { it.isNotEmpty() }
        val tracks = (0 until data.length()).map { track(data.getJSONObject(it)).let { t -> if (t.cover == null) t.copy(cover = cover) else t } }
        return MusicItem(type, o.optString("title"), tracks, Service.DEEZER)
    }
}

object YandexSource {
    private const val API = "https://api.music.yandex.net"
    private val TRACK = Regex("""/track/(\d+)""")
    private val ALBUM = Regex("""/album/(\d+)""")
    private val PLAYLIST = Regex("""/users/([^/]+)/playlists/(\d+)""")

    fun track(o: JSONObject): Track {
        val artists = o.optJSONArray("artists") ?: JSONArray()
        val version = o.optString("version").takeIf { it.isNotEmpty() }?.let { " ($it)" }.orEmpty()
        return Track(
            o.optString("title") + version,
            (0 until artists.length()).joinToString(", ") { artists.getJSONObject(it).optString("name") },
            o.optInt("durationMs") / 1000,
            url = link(o),
            cover = o.optString("coverUri").takeIf { it.isNotEmpty() }?.let { "https://" + it.replace("%%", "400x400") },
        )
    }

    fun link(o: JSONObject): String? {
        val id = o.optString("id").takeIf { it.isNotEmpty() } ?: return null
        val album = o.optJSONArray("albums")?.optJSONObject(0)?.optString("id")
        return if (album.isNullOrEmpty()) "https://music.yandex.ru/track/$id" else "https://music.yandex.ru/album/$album/track/$id"
    }

    private fun api(path: String): JSONObject = try {
        Http.json("$API$path")
    } catch (e: Http.HttpError) {
        if (e.code == 451) throw UserError("Яндекс Музыка недоступна из-за границы. Отключите VPN и попробуйте снова.")
        throw e
    }

    fun resolve(url: String): MusicItem {
        TRACK.find(url)?.let {
            val r = api("/tracks/${it.groupValues[1]}").getJSONArray("result")
            if (r.length() == 0) throw UserError("Яндекс Музыка: трек не найден")
            val t = track(r.getJSONObject(0))
            return MusicItem("track", t.label, listOf(t), Service.YANDEX)
        }
        ALBUM.find(url)?.let {
            val r = api("/albums/${it.groupValues[1]}/with-tracks").getJSONObject("result")
            val volumes = r.optJSONArray("volumes") ?: JSONArray()
            val tracks = (0 until volumes.length()).flatMap { v ->
                val vol = volumes.getJSONArray(v)
                (0 until vol.length()).map { i -> track(vol.getJSONObject(i)) }
            }
            return MusicItem("album", r.optString("title"), tracks, Service.YANDEX)
        }
        PLAYLIST.find(url)?.let {
            val (owner, kind) = it.destructured
            val r = api("/users/$owner/playlists/$kind").getJSONObject("result")
            val list = r.optJSONArray("tracks") ?: JSONArray()
            val tracks = (0 until list.length()).mapNotNull { i -> list.getJSONObject(i).optJSONObject("track")?.let(::track) }
            if (tracks.isEmpty()) throw UserError("Яндекс Музыка не показала треки плейлиста")
            return MusicItem("playlist", r.optString("title"), tracks, Service.YANDEX)
        }
        throw UserError("Яндекс Музыка: нужна ссылка на трек, альбом или плейлист")
    }
}

object YouTubeSource {
    private val NOISE = Regex(
        """\s*[(\[][^)\]]*(official|video|audio|lyric|lyrics|клип|видео|mv|hd|4k|remaster|visualizer|текст)[^)\]]*[)\]]""",
        RegexOption.IGNORE_CASE,
    )

    fun resolve(url: String, service: Service): MusicItem {
        val id = Regex("""(?:v=|youtu\.be/|shorts/)([\w-]{11})""").find(url)?.groupValues?.get(1)
            ?: throw UserError("Нужна ссылка на видео или трек YouTube")
        val o = Http.json("https://www.youtube.com/oembed?format=json&url=" + Http.enc("https://www.youtube.com/watch?v=$id"))
        var title = o.optString("title").replace(NOISE, "").trim()
        var artist = o.optString("author_name").removeSuffix(" - Topic").removeSuffix("VEVO").trim()
        val parts = title.split(Regex("""\s+[—–-]\s+"""), limit = 2)
        if (parts.size == 2) {
            artist = parts[0].trim()
            title = parts[1].trim()
        }
        val t = Track(title, artist)
        return MusicItem("track", t.label, listOf(t), service)
    }
}

object SoundCloudSource {
    fun resolve(url: String): MusicItem {
        val o = Http.json("https://soundcloud.com/oembed?format=json&url=" + Http.enc(url))
        val full = o.optString("title")
        val title = full.substringBeforeLast(" by ").trim()
        val artist = if (full.contains(" by ")) full.substringAfterLast(" by ").trim() else o.optString("author_name")
        val t = Track(title, artist, cover = o.optString("thumbnail_url").takeIf { it.isNotEmpty() })
        return MusicItem("track", t.label, listOf(t), Service.SOUNDCLOUD)
    }
}

/**
 * Название песни из описания страницы (Open Graph — то, что показывают мессенджеры в превью ссылки).
 * Запасной путь, когда API сервиса недоступно в стране или закрыто.
 */
object PageMeta {
    private val TAIL = Regex(
        """\s*([|·-]\s*)?(Spotify|Apple Music|Deezer|Яндекс Музыка|Yandex Music|SoundCloud|YouTube Music|VK Музыка|Звук)\b.*$|\.\s*Слушать онлайн.*$|\s+on (Spotify|Apple Music|Deezer|SoundCloud)$""",
        RegexOption.IGNORE_CASE,
    )

    fun track(url: String): Track? {
        for (ua in listOf(Http.DESKTOP_UA, Http.MOBILE_UA)) {
            val page = runCatching { Http.get(url, ua) }.getOrNull() ?: continue
            parse(page)?.let { return it }
        }
        return null
    }

    /** Заглушки вместо названия песни (страница-приложение, главная сервиса). */
    private val GENERIC = listOf("яндекс музыка", "yandex music", "spotify", "apple music", "deezer", "soundcloud",
        "web player", "веб-плеер", "собираем музыку", "youtube music", "vk музыка", "звук")

    internal fun parse(page: String): Track? {
        fun meta(name: String) = Regex("""<meta[^>]+(?:property|name)="$name"[^>]+content="([^"]*)"""").find(page)?.groupValues?.get(1)
            ?.let { android.text.Html.fromHtml(it, android.text.Html.FROM_HTML_MODE_LEGACY).toString().trim() }
        fun clean(x: String) = x.replace('\u200E', ' ').replace('\u00A0', ' ').replace(Regex("""\s+"""), " ")
            .replace(Regex("""\s+(on|в|на)\s+(Spotify|Apple Music|Deezer|SoundCloud|Яндекс Музыке)$""", RegexOption.IGNORE_CASE), "")
            .replace(TAIL, "").trim().trim('«', '»', '"')
        val og = meta("og:title") ?: Regex("""<title>([^<]*)</title>""").find(page)?.groupValues?.get(1)?.trim() ?: return null
        val raw = og.replace('\u200E', ' ').replace('\u00A0', ' ')
        var title: String
        var artist = meta("music:musician_description").orEmpty()
        val desc = meta("og:description").orEmpty()
        val ruApple = Regex("""«(.+?)»\s*\((.+?)\)""").find(raw) // «Песня «X» (Исполнитель) в Apple Music»
        when {
            ruApple != null -> { title = ruApple.groupValues[1]; artist = ruApple.groupValues[2] }
            raw.contains(" - Song by ", true) || raw.contains(" by ") -> {
                val by = if (raw.contains(" - Song by ", true)) " - Song by " else " by "
                title = raw.substringBefore(by); artist = raw.substringAfter(by)
            }
            else -> {
                title = clean(raw)
                if (artist.isEmpty() && desc.contains(" · ")) artist = desc.substringBefore(" · ") // Spotify
                else if (artist.isEmpty()) {
                    val parts = title.split(Regex("""\s+[—–-]\s+"""), limit = 2) // «Название — Исполнитель»
                    if (parts.size == 2) { title = parts[0]; artist = parts[1] }
                }
            }
        }
        title = clean(title)
        artist = clean(artist)
        if (title.isEmpty() || title.length > 200) return null
        // Вместо песни — заглушка сервиса: лучше честно сказать, чем включить не то.
        val low = (title + " " + artist).lowercase()
        if (GENERIC.any { low.startsWith(it) || title.lowercase() == it }) return null
        return Track(title, artist)
    }
}
