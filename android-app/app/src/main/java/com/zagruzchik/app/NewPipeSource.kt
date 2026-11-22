package com.zagruzchik.app

import org.json.JSONObject
import org.schabi.newpipe.extractor.NewPipe
import org.schabi.newpipe.extractor.ServiceList
import org.schabi.newpipe.extractor.downloader.Downloader
import org.schabi.newpipe.extractor.downloader.Request
import org.schabi.newpipe.extractor.downloader.Response
import org.schabi.newpipe.extractor.localization.ContentCountry
import org.schabi.newpipe.extractor.localization.Localization
import org.schabi.newpipe.extractor.search.SearchInfo
import org.schabi.newpipe.extractor.services.youtube.linkHandler.YoutubeSearchQueryHandlerFactory
import org.schabi.newpipe.extractor.stream.StreamInfo
import org.schabi.newpipe.extractor.stream.StreamInfoItem
import java.net.HttpURLConnection
import java.net.URL

/**
 * Песни YouTube Music с исполнителем и длительностью — так находятся и официальные авто-треки
 * («Исполнитель – Topic»), которых нет в обычном поиске YouTube.
 * Сначала — на самом телефоне (библиотека NewPipeExtractor, без Python); не вышло — через открытые зеркала Piped.
 */
object NewPipeSource {
    class Found(val url: String, val title: String, val artist: String, val durationSec: Int)
    class Audio(val url: String, val kbps: Int, val format: String, val cover: String?)

    private val ready by lazy {
        NewPipe.init(object : Downloader() {
            override fun execute(request: Request): Response {
                val c = Net.open(URL(request.url())) // YouTube — при необходимости мимо VPN
                c.requestMethod = request.httpMethod()
                c.connectTimeout = 4000; c.readTimeout = 6000
                c.instanceFollowRedirects = true
                c.setRequestProperty("User-Agent", Http.DESKTOP_UA)
                request.headers().forEach { (k, vs) -> vs.forEachIndexed { i, v -> if (i == 0) c.setRequestProperty(k, v) else c.addRequestProperty(k, v) } }
                request.dataToSend()?.let { body -> c.doOutput = true; c.outputStream.use { it.write(body) } }
                try {
                    val code = c.responseCode
                    val body = runCatching { (if (code in 200..399) c.inputStream else c.errorStream)?.bufferedReader()?.use { it.readText() } }.getOrNull().orEmpty()
                    return Response(code, c.responseMessage.orEmpty(), c.headerFields.filterKeys { it != null }, body, c.url.toString())
                } finally { c.disconnect() }
            }
        }, Localization("ru", "RU"), ContentCountry("RU"))
        true
    }

    /** Песни по запросу. [via] — чем нашли (для отчёта о поиске). */
    fun searchSongs(query: String, via: (String) -> Unit = {}): List<Found> {
        // Телефон и зеркало — одновременно; берём того, кто первым ответил непустым списком (раньше шли по очереди — до 16 с).
        val local = pool.submit<List<Found>> { onDevice(query) }
        val mirror = pool.submit<List<Found>> { piped(query) }
        val deadline = System.currentTimeMillis() + 6000
        while (System.currentTimeMillis() < deadline) {
            if (local.isDone) runCatching { local.get() }.getOrNull()?.takeIf { it.isNotEmpty() }?.let { via("на телефоне"); return it }
            if (mirror.isDone) runCatching { mirror.get() }.getOrNull()?.takeIf { it.isNotEmpty() }?.let { via("зеркало ${lastMirror.orEmpty()}"); return it }
            if (local.isDone && mirror.isDone) break
            Thread.sleep(30)
        }
        fun err(f: java.util.concurrent.Future<List<Found>>, name: String) = if (!f.isDone) "$name: не ответил за 6 с" else
            runCatching { f.get() }.exceptionOrNull()?.let { e -> (e.cause ?: e).let { "$name: ${it.javaClass.simpleName} ${it.message.orEmpty().take(80)}" } } ?: "$name: пусто"
        via("ошибка — " + err(local, "телефон") + "; " + err(mirror, "зеркало"))
        return emptyList()
    }

    /** Обычный поиск на площадке средствами телефона (без Python): SoundCloud — треки, YouTube — видео. */
    fun search(soundcloud: Boolean, query: String): List<Found> {
        ready
        val service = if (soundcloud) ServiceList.SoundCloud else ServiceList.YouTube
        val filter = if (soundcloud) "tracks" else "videos"
        val handler = service.searchQHFactory.fromQuery(query, listOf(filter), "")
        return SearchInfo.getInfo(service, handler).relatedItems.filterIsInstance<StreamInfoItem>().map {
            Found(it.url, it.name.orEmpty(), it.uploaderName.orEmpty().removeSuffix(" - Topic"), it.duration.toInt().coerceAtLeast(0))
        }
    }

    internal fun onDevice(query: String): List<Found> {
        ready
        val yt = ServiceList.YouTube
        val handler = yt.searchQHFactory.fromQuery(query, listOf(YoutubeSearchQueryHandlerFactory.MUSIC_SONGS), "")
        return SearchInfo.getInfo(yt, handler).relatedItems.filterIsInstance<StreamInfoItem>().map {
            Found(it.url, it.name.orEmpty(), it.uploaderName.orEmpty().removeSuffix(" - Topic"), it.duration.toInt().coerceAtLeast(0))
        }
    }

    // ---- Открытые зеркала Piped: тот же поиск песен, если с телефона не получилось ----
    private val MIRRORS = listOf(
        "pipedapi.ducks.party", "pipedapi.kavin.rocks", "pipedapi.adminforge.de", "api.piped.private.coffee",
        "pipedapi.leptons.xyz", "pipedapi.reallyaweso.me", "pipedapi.nosebs.ru", "piped-api.privacy.com.de",
    )
    @Volatile private var lastMirror: String? = null
    private val pool = java.util.concurrent.Executors.newCachedThreadPool()

    private fun piped(query: String): List<Found> {
        // Последнее ответившее зеркало — первым; остальные по очереди, каждому не больше 4 с.
        val order = listOfNotNull(lastMirror) + MIRRORS.filter { it != lastMirror }
        var last: Exception? = null
        for (host in order.take(2)) {
            try {
                val items = JSONObject(Http.get("https://$host/search?q=${Http.enc(query)}&filter=music_songs", Http.DESKTOP_UA, 2500)).optJSONArray("items") ?: continue
                val found = (0 until items.length()).mapNotNull { i ->
                    val o = items.optJSONObject(i) ?: return@mapNotNull null
                    val id = o.optString("url").substringAfter("v=", "").takeIf { it.isNotBlank() } ?: return@mapNotNull null
                    Found("https://music.youtube.com/watch?v=$id", o.optString("title"), o.optString("uploaderName").removeSuffix(" - Topic"), o.optInt("duration").coerceAtLeast(0))
                }
                if (found.isNotEmpty()) { lastMirror = host; return found }
            } catch (e: Exception) { last = e; if (lastMirror == host) lastMirror = null }
        }
        throw last ?: UserError("зеркала не ответили")
    }

    /**
     * Лучший звук для страницы YouTube средствами телефона — около секунды, без Python.
     * Ссылку сразу проверяем (YouTube иногда отдаёт нерабочую): null — не отдаётся, тогда берём обычным путём.
     */
    fun audio(pageUrl: String, wantTotal: Long? = null): Audio? {
        ready
        val info = StreamInfo.getInfo(ServiceList.YouTube, pageUrl)
        val streams = info.audioStreams.filter { it.isUrl && !it.content.isNullOrBlank() }.sortedByDescending { it.averageBitrate }
        // [wantTotal] — нужна именно та запись, начало которой уже лежит на телефоне (тот же размер файла).
        val best = streams.firstOrNull { s -> size(s.content).let { if (wantTotal != null) it == wantTotal else it > 0 } } ?: return null
        return Audio(best.content, best.averageBitrate, best.format?.name ?: "", info.thumbnails.maxByOrNull { it.height }?.url)
    }

    /**
     * Звук SoundCloud средствами телефона — без Python (yt-dlp под нагрузкой не отвечал, журнал 17.11). Проверено с сервера
     * на треках владельца: поток AAC 160 кбит/с (HLS) за 1,3–5 с; платные (DRM) отказывают сразу. null — звука нет.
     */
    fun soundcloudAudio(pageUrl: String): Audio? {
        ready
        val info = StreamInfo.getInfo(ServiceList.SoundCloud, pageUrl)
        val best = info.audioStreams.filter { it.isUrl && !it.content.isNullOrBlank() }
            .sortedWith(compareByDescending<org.schabi.newpipe.extractor.stream.AudioStream> {
                it.deliveryMethod == org.schabi.newpipe.extractor.stream.DeliveryMethod.PROGRESSIVE_HTTP }.thenByDescending { it.averageBitrate })
            .firstOrNull() ?: return null
        return Audio(best.content, best.averageBitrate, best.format?.name ?: "", info.thumbnails.maxByOrNull { it.height }?.url)
    }

    /** Размер файла по ссылке (заодно проверка, что она играет). -1 — не отдаётся. */
    private fun size(url: String): Long = runCatching {
        val c = Net.open(URL(url))
        c.connectTimeout = 4000; c.readTimeout = 4000
        c.setRequestProperty("Range", "bytes=0-1")
        try {
            if (c.responseCode !in 200..299) -1L
            else c.getHeaderField("Content-Range")?.substringAfter('/')?.toLongOrNull() ?: c.contentLengthLong.coerceAtLeast(1)
        } finally { c.disconnect() }
    }.getOrDefault(-1L)
}
