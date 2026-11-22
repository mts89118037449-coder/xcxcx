package com.zagruzchik.app

import org.json.JSONObject
import java.util.concurrent.Executors
import java.util.concurrent.Future

/**
 * Поиск песни по всему интернету — для удалённых с площадок песен, перезаливов, ремиксов.
 * Все источники опрашиваются одновременно; результаты приходят по мере ответа.
 *
 * [direct] = ссылка сразу на аудиофайл (Internet Archive, Audius) — играет мгновенно, без yt-dlp.
 */
data class WebResult(
    val url: String,
    val title: String,
    val artist: String,
    val duration: Int,
    val source: String,
    val cover: String? = null,
    val direct: Boolean = false,
    /** Прослушивания/просмотры — официальная загрузка обычно популярнее перезаливов. */
    val views: Long = 0,
) {
    fun track() = Track(title, artist, duration, cover = cover)
}

object WebSearch {
    private val pool = Executors.newFixedThreadPool(6)
    private const val APP = "SoundAura"

    /** Источник: название и функция поиска. */
    private class Source(val name: String, val search: (String) -> List<WebResult>)

    // Запуски yt-dlp текущего поиска: при новом запросе старые останавливаем, а не копим.
    private val running = java.util.Collections.synchronizedSet(mutableSetOf<String>())
    private val gen = java.util.concurrent.atomic.AtomicInteger()
    private val processIds = ThreadLocal<String?>()

    private val SOURCES = listOf(
        // Главные площадки — средствами телефона, без Python: ответ за секунду и не стоит в очереди за фоновой подготовкой.
        // Не получилось — прежний путь через yt-dlp.
        Source("SoundCloud") { q -> fast("SoundCloud") { NewPipeSource.search(true, q) } ?: ytdlp("scsearch8:$q", "SoundCloud") },
        Source("YouTube Music") { q -> fast("YouTube Music") { NewPipeSource.searchSongs(q) } ?: emptyList() },
        Source("YouTube") { q -> fast("YouTube") { NewPipeSource.search(false, q) } ?: ytdlp("ytsearch8:$q", "YouTube") },
        Source("Яндекс Музыка", ::yandex),
        Source("Rutube", ::rutube),
        Source("Internet Archive", ::archive),
        Source("Dailymotion", ::dailymotion),
        Source("Audius", ::audius),
        Source("Mixcloud", ::mixcloud),
    )

    /** Все источники разом. [onResults] вызывается из фоновых потоков по мере ответа каждого источника. */
    fun searchAll(q: String, onResults: (source: String, results: List<WebResult>, error: String?) -> Unit, onDone: () -> Unit): List<Future<*>> {
        val my = gen.incrementAndGet()
        synchronized(running) { running.toList().forEach { Ytdlp.cancel(it) }; running.clear() }
        val left = java.util.concurrent.atomic.AtomicInteger(SOURCES.size)
        return SOURCES.map { s ->
            pool.submit {
                if (gen.get() != my) return@submit
                val id = "ws-$my-${s.name}"
                running += id
                processIds.set(id)
                // «Везде в интернете» — фоном: песня, которую включили, важнее.
                val r = runCatching { Ytdlp.inBackground { s.search(q) } }
                processIds.set(null)
                running -= id
                if (gen.get() != my) return@submit
                onResults(s.name, r.getOrDefault(emptyList()), r.exceptionOrNull()?.let { (it as? UserError)?.message ?: it.javaClass.simpleName })
                if (left.decrementAndGet() == 0) onDone()
            }
        }
    }

    /**
     * Дополнительные источники для «Слушать»/«Скачать» песни из каталога, если её нет на
     * SoundCloud/YouTube: Яндекс, Rutube, Internet Archive, Dailymotion, Audius.
     */
    fun extraCandidates(t: Track): List<WebResult> {
        val q = t.query
        val jobs = listOf(::yandex, ::archive, ::rutube, ::dailymotion, ::audius).map { f -> pool.submit<List<WebResult>> { runCatching { f(q) }.getOrDefault(emptyList()) } }
        // Ждём все площадки не дольше 6 с суммарно: медленная не задерживает остальных.
        val deadline = System.currentTimeMillis() + 6000
        val all = jobs.flatMap { j ->
            runCatching { j.get(maxOf(1, deadline - System.currentTimeMillis()), java.util.concurrent.TimeUnit.MILLISECONDS) }.getOrDefault(emptyList())
        }
        return Match.ranked(t, all) { Triple(it.title, it.artist + " | " + it.title.substringBefore(" - ", ""), it.duration) }
    }

    /** Насколько результат похож на запрос: доля слов запроса, которые есть в названии/исполнителе. */
    fun relevance(q: String, r: WebResult): Double {
        val qw = Match.norm(q).split(' ').filter { it.length > 1 }.toSet()
        if (qw.isEmpty()) return 0.0
        val hay = Match.norm(r.title + " " + r.artist)
        val hit = qw.count { hay.contains(it) }
        var s = hit.toDouble() / qw.size
        val title = Match.norm(r.title)
        val qn = Match.norm(q)
        if (title.startsWith(qn) || qn.endsWith(title) && title.length > 3) s += 0.1
        // Все слова запроса в «Исполнитель — Название» — самое похожее на оригинал.
        if (Match.norm(r.artist + " " + r.title).let { hay2 -> qw.all { hay2.contains(it) } } && r.artist.isNotBlank()) s += 0.1
        // Ремиксы, миксы, каверы, концерты — ниже оригинала (если их не искали специально).
        if (Match.versionPenaltyWords(r.title, q).isNotEmpty()) s -= 0.35
        if (Match.isUncensored(r.title) && !Match.isUncensored(q)) s += 0.15 // без цензуры — выше
        if (r.views > 0) s += minOf(0.7, kotlin.math.log10(r.views.toDouble() + 1) / 10) // популярное (обычно оригинал) — выше
        if (r.duration in 1..59) s -= 0.3 // превью/отрывки
        if (r.duration > 600) s -= 0.25 // часовые сборники и миксы — ниже
        if (r.duration > 1200) s -= 0.2
        return s
    }

    // ---------------- Источники ----------------

    private fun fast(source: String, find: () -> List<NewPipeSource.Found>): List<WebResult>? =
        runCatching { find() }.getOrNull()?.takeIf { it.isNotEmpty() }?.take(10)?.map { WebResult(it.url, it.title, it.artist, it.durationSec, source) }

    private fun ytdlp(query: String, source: String): List<WebResult> {
        App.awaitReadyOrNull() ?: return emptyList()
        return Downloader.searchOrThrow(query, source, processIds.get()).map {
            WebResult(it.url, it.title, it.author.substringBefore(" | "), it.duration, source, views = it.views)
        }
    }

    private fun yandex(q: String): List<WebResult> {
        val r = Http.json("https://api.music.yandex.net/search?type=track&page=0&text=" + Http.enc(q))
            .optJSONObject("result")?.optJSONObject("tracks")?.optJSONArray("results") ?: return emptyList()
        return (0 until minOf(r.length(), 8)).mapNotNull { i ->
            val o = r.getJSONObject(i)
            val t = YandexSource.track(o)
            val link = YandexSource.link(o) ?: return@mapNotNull null
            WebResult(link, t.title, t.artist, t.durationSec, "Яндекс Музыка", t.cover)
        }
    }

    private fun rutube(q: String): List<WebResult> {
        val r = Http.json("https://rutube.ru/api/search/video/?query=" + Http.enc(q)).optJSONArray("results") ?: return emptyList()
        return (0 until minOf(r.length(), 8)).mapNotNull { i ->
            val o = r.getJSONObject(i)
            val url = o.optString("video_url").takeIf { it.startsWith("http") } ?: return@mapNotNull null
            WebResult(url, o.optString("title"), o.optJSONObject("author")?.optString("name").orEmpty(),
                o.optInt("duration"), "Rutube", o.optString("thumbnail_url").ifEmpty { null })
        }
    }

    private fun dailymotion(q: String): List<WebResult> {
        val o = Http.json("https://api.dailymotion.com/videos?limit=8&fields=title,duration,url,owner.screenname,thumbnail_240_url&search=" + Http.enc(q))
        val list = o.optJSONArray("list") ?: return emptyList()
        return (0 until list.length()).map { i ->
            val v = list.getJSONObject(i)
            WebResult(v.optString("url"), v.optString("title"), v.optString("owner.screenname"),
                v.optInt("duration"), "Dailymotion", v.optString("thumbnail_240_url").ifEmpty { null })
        }.filter { it.url.startsWith("http") }
    }

    /** Internet Archive: ищем записи, берём аудиофайлы, чьё название похоже на запрос. Ссылки — прямые на MP3. */
    private fun archive(q: String): List<WebResult> {
        val docs = Http.json(
            "https://archive.org/advancedsearch.php?rows=6&output=json&fl%5B%5D=identifier&fl%5B%5D=title&fl%5B%5D=creator&q=" +
                Http.enc("($q) AND mediatype:audio")
        ).optJSONObject("response")?.optJSONArray("docs") ?: return emptyList()
        val ids = (0 until docs.length()).map { docs.getJSONObject(it).optString("identifier") }.filter { it.isNotEmpty() }
        val items = ids.map { id -> pool.submit<List<WebResult>> { runCatching { archiveItem(id, q) }.getOrDefault(emptyList()) } }
        return items.flatMap { runCatching { it.get() }.getOrDefault(emptyList()) }
    }

    private fun archiveItem(id: String, q: String): List<WebResult> {
        val m = Http.json("https://archive.org/metadata/$id")
        val meta = m.optJSONObject("metadata") ?: JSONObject()
        val creator = meta.optString("creator")
        val files = m.optJSONArray("files") ?: return emptyList()
        val audio = (0 until files.length()).map { files.getJSONObject(it) }
            .filter { it.optString("format") in setOf("VBR MP3", "MP3", "128Kbps MP3", "64Kbps MP3") }
        val cover = "https://archive.org/services/img/$id"
        val results = audio.map { f ->
            val name = f.optString("name")
            val title = f.optString("title").ifEmpty { name.substringAfterLast('/').substringBeforeLast('.') }
            WebResult(
                "https://archive.org/download/$id/" + name.split('/').joinToString("/") { android.net.Uri.encode(it) },
                title, f.optString("creator").ifEmpty { f.optString("artist").ifEmpty { creator } },
                f.optString("length").toDoubleOrNull()?.toInt() ?: 0, "Internet Archive", cover, direct = true,
            )
        }
        // В записи-сборнике десятки песен — оставляем похожие на запрос.
        return results.sortedByDescending { relevance(q, it) }.take(3).filter { relevance(q, it) > 0.3 }
    }

    private fun audius(q: String): List<WebResult> {
        val d = Http.json("https://api.audius.co/v1/tracks/search?app_name=$APP&query=" + Http.enc(q)).optJSONArray("data") ?: return emptyList()
        return (0 until minOf(d.length(), 8)).map { i ->
            val t = d.getJSONObject(i)
            WebResult(
                "https://api.audius.co/v1/tracks/${t.optString("id")}/stream?app_name=$APP",
                t.optString("title"), t.optJSONObject("user")?.optString("name").orEmpty(), t.optInt("duration"),
                "Audius", t.optJSONObject("artwork")?.optString("480x480")?.ifEmpty { null }, direct = true,
            )
        }
    }

    private fun mixcloud(q: String): List<WebResult> {
        val d = Http.json("https://api.mixcloud.com/search/?type=cloudcast&q=" + Http.enc(q)).optJSONArray("data") ?: return emptyList()
        return (0 until minOf(d.length(), 5)).map { i ->
            val c = d.getJSONObject(i)
            WebResult(c.optString("url"), c.optString("name"), c.optJSONObject("user")?.optString("name").orEmpty(),
                c.optInt("audio_length"), "Mixcloud", c.optJSONObject("pictures")?.optString("medium"))
        }.filter { it.url.startsWith("http") }
    }
}
