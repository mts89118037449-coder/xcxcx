package com.zagruzchik.app

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import androidx.annotation.OptIn
import androidx.media3.cast.DefaultMediaItemConverter
import androidx.media3.cast.MediaItemConverter
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DataSourceInputStream
import androidx.media3.datasource.DataSpec
import com.google.android.gms.cast.CastMediaControlIntent
import com.google.android.gms.cast.MediaQueueItem
import com.google.android.gms.cast.framework.CastContext
import com.google.android.gms.cast.framework.CastOptions
import com.google.android.gms.cast.framework.OptionsProvider
import com.google.android.gms.cast.framework.SessionProvider
import java.io.BufferedOutputStream
import java.net.Inet4Address
import java.net.ServerSocket
import java.net.Socket
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors

/** Настройки Chromecast: стандартный приёмник Google — работает на любом ТВ/приставке/колонке с Chromecast. */
class CastOptionsProvider : OptionsProvider {
    override fun getCastOptions(context: Context): CastOptions =
        CastOptions.Builder().setReceiverApplicationId(CastMediaControlIntent.DEFAULT_MEDIA_RECEIVER_APPLICATION_ID).build()

    override fun getAdditionalSessionProviders(context: Context): List<SessionProvider>? = null
}

object Cast {
    /** Chromecast есть только с сервисами Google Play; без них кнопку трансляции просто не показываем. */
    fun context(ctx: Context): CastContext? = runCatching { CastContext.getSharedInstance(ctx.applicationContext) }.getOrNull()

    internal var isPlayingRemotely = false

    /** Название устройства, на котором сейчас играет: «Гостиная», «Колонка на кухне»… */
    fun deviceName(ctx: Context): String? =
        if (isPlayingRemotely) context(ctx)?.sessionManager?.currentCastSession?.castDevice?.friendlyName else null

    /**
     * Готовит песню/видео для телевизора: скачанные файлы отдаём через домашний сервер,
     * для потоков указываем тип (без него телевизор не начнёт играть).
     */
    fun castable(ctx: Context, item: MediaItem): MediaItem? {
        val uri = item.requestMetadata.mediaUri ?: item.localConfiguration?.uri ?: Uri.parse(item.mediaId)
        val extras = item.mediaMetadata.extras
        val reportedMime = item.localConfiguration?.mimeType ?: extras?.getString(Playback.X_LOCAL_MIME)
        val mime = when (reportedMime) {
            "audio/mp3" -> MimeTypes.AUDIO_MPEG
            "audio/m4a", "audio/x-m4a" -> MimeTypes.AUDIO_MP4
            "audio/opus" -> "audio/ogg"
            null, "application/octet-stream" -> guessMime(uri.toString())
            else -> reportedMime
        }
        val castUri = when (uri.scheme) {
            "content", "file", "aura" -> LocalServer.urlFor(ctx, uri, mime) ?: return null
            "http", "https" -> uri.toString()
            else -> return null
        }
        return item.buildUpon()
            .setUri(castUri)
            .setMimeType(mime)
            .setRequestMetadata(item.requestMetadata.buildUpon().setMediaUri(uri).build())
            .build()
    }

    private fun guessMime(u: String): String {
        val d = Uri.decode(u).lowercase()
        return when {
            ".m3u8" in d -> MimeTypes.APPLICATION_M3U8
            "mime=audio/webm" in d -> "audio/webm"
            "mime=audio/mp4" in d -> MimeTypes.AUDIO_MP4
            "mime=video/mp4" in d -> MimeTypes.VIDEO_MP4
            "mime=video/webm" in d -> "video/webm"
            d.substringBefore('?').endsWith(".mp4") -> MimeTypes.VIDEO_MP4
            d.substringBefore('?').endsWith(".m4a") -> MimeTypes.AUDIO_MP4
            d.substringBefore('?').endsWith(".aac") -> "audio/aac"
            d.substringBefore('?').endsWith(".flac") -> "audio/flac"
            d.substringBefore('?').endsWith(".ogg") || d.substringBefore('?').endsWith(".opus") -> "audio/ogg"
            d.substringBefore('?').endsWith(".webm") -> "audio/webm"
            else -> MimeTypes.AUDIO_MPEG
        }
    }
}

/** Media3's default Cast converter does not round-trip app metadata or the original URI. */
@OptIn(UnstableApi::class)
class SoundAuraCastConverter : MediaItemConverter {
    private val delegate = DefaultMediaItemConverter()
    private val items = android.util.LruCache<Pair<String, Uri>, MediaItem>(256)

    override fun toMediaQueueItem(mediaItem: MediaItem): MediaQueueItem {
        mediaItem.localConfiguration?.uri?.let { items.put(mediaItem.mediaId to it, mediaItem) }
        return delegate.toMediaQueueItem(mediaItem)
    }

    override fun toMediaItem(mediaQueueItem: MediaQueueItem): MediaItem {
        val item = delegate.toMediaItem(mediaQueueItem)
        return item.localConfiguration?.uri?.let { items.get(item.mediaId to it) } ?: item
    }
}

/**
 * Крошечный HTTP-сервер в домашней сети: телевизор не видит память телефона,
 * поэтому скачанный файл он забирает отсюда. Отдаём только зарегистрированные файлы
 * по случайной ссылке; поддерживается перемотка (Range).
 */
@OptIn(UnstableApi::class)
object LocalServer {
    private var server: ServerSocket? = null
    private val files = ConcurrentHashMap<String, Pair<Uri, String>>()
    private val pool = Executors.newCachedThreadPool()
    private lateinit var app: Context

    @Synchronized
    fun urlFor(ctx: Context, uri: Uri, mime: String): String? {
        app = ctx.applicationContext
        val ip = wifiIp(app) ?: return null
        val s = server ?: runCatching { ServerSocket(0) }.getOrNull()
            ?.also { server = it; pool.execute { acceptLoop(it) } } ?: return null
        val entry = uri to mime
        val token = files.entries.firstOrNull { it.value == entry }?.key
            ?: UUID.randomUUID().toString().also { files[it] = entry }
        return "http://$ip:${s.localPort}/f/$token"
    }

    private fun wifiIp(ctx: Context): String? {
        val cm = ctx.getSystemService(ConnectivityManager::class.java) ?: return null
        val networks = listOfNotNull(cm.activeNetwork) + cm.allNetworks
        return networks.asSequence().distinct().filter { network ->
            val caps = cm.getNetworkCapabilities(network)
            caps?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true ||
                caps?.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) == true
        }.mapNotNull(cm::getLinkProperties)
            .flatMap { it.linkAddresses.asSequence() }
            .map { it.address }
            .firstOrNull { it is Inet4Address && !it.isLoopbackAddress }
            ?.hostAddress
    }

    private fun acceptLoop(s: ServerSocket) {
        while (!s.isClosed) {
            val c = runCatching { s.accept() }.getOrNull() ?: break
            pool.execute { runCatching { handle(c) }; runCatching { c.close() } }
        }
    }

    private fun handle(c: Socket) {
        c.soTimeout = 15_000
        val input = c.getInputStream().bufferedReader()
        val request = input.readLine() ?: return
        var range: String? = null
        while (true) {
            val h = input.readLine() ?: break
            if (h.isEmpty()) break
            if (h.startsWith("Range:", true)) range = h.substringAfter(':').trim()
        }
        val out = BufferedOutputStream(c.getOutputStream())
        val parts = request.split(' ', limit = 3)
        val method = parts.first()
        val path = parts.getOrNull(1).orEmpty()
        fun respond(status: String, headers: String = "") {
            out.write(("HTTP/1.1 $status\r\nContent-Length: 0\r\n$headers" +
                "Access-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n").toByteArray())
            out.flush()
        }
        val (uri, mime) = files[path.substringAfter("/f/", "")] ?: return respond("404 Not Found")
        if (method == "OPTIONS") return respond("204 No Content",
            "Access-Control-Allow-Methods: GET, HEAD, OPTIONS\r\nAccess-Control-Allow-Headers: Range\r\n")
        if (method != "GET" && method != "HEAD") return respond("405 Method Not Allowed")

        val head = if (uri.scheme == "aura") {
            HeadCache.byId(uri.lastPathSegment) ?: return respond("404 Not Found")
        } else null
        val afd = if (head == null) {
            runCatching { app.contentResolver.openAssetFileDescriptor(uri, "r") }.getOrNull()
                ?: return respond("404 Not Found")
        } else null
        try {
            val total = head?.total ?: afd?.length ?: -1L
            if (total <= 0) return respond("404 Not Found")
            val bytes = range?.let { parseRange(it, total) }
            if (range != null && bytes == null) return respond("416 Range Not Satisfiable", "Content-Range: bytes */$total\r\n")
            val start = bytes?.first ?: 0L
            val end = bytes?.last ?: (total - 1L)
            val len = end - start + 1
            val headers = buildString {
                append(if (bytes != null) "HTTP/1.1 206 Partial Content\r\n" else "HTTP/1.1 200 OK\r\n")
                append("Content-Type: $mime\r\nAccept-Ranges: bytes\r\nContent-Length: $len\r\n")
                if (bytes != null) append("Content-Range: bytes $start-$end/$total\r\n")
                append("Access-Control-Allow-Origin: *\r\n")
                append("Access-Control-Expose-Headers: Accept-Ranges, Content-Range\r\nConnection: close\r\n\r\n")
            }
            if (method == "HEAD") {
                out.write(headers.toByteArray())
                out.flush()
                return
            }
            val stream = if (head != null) {
                val spec = DataSpec.Builder().setUri(uri).setPosition(start).setLength(len).build()
                DataSourceInputStream(AuraDataSourceFactory(app).createDataSource(), spec)
            } else afd!!.createInputStream()
            stream.use {
                if (head == null) {
                    var skipped = 0L
                    while (skipped < start) {
                        val n = it.skip(start - skipped)
                        if (n <= 0L) return respond("500 Internal Server Error")
                        skipped += n
                    }
                }
                out.write(headers.toByteArray())
                val buffer = ByteArray(64 * 1024)
                var left = len
                while (left > 0) {
                    val n = it.read(buffer, 0, minOf(buffer.size.toLong(), left).toInt())
                    if (n < 0) break
                    out.write(buffer, 0, n)
                    left -= n
                }
                out.flush()
            }
        } finally {
            afd?.close()
        }
    }

    private val byteRange = Regex("""bytes=(\d*)-(\d*)""")

    private fun parseRange(value: String, total: Long): LongRange? {
        val (first, last) = byteRange.matchEntire(value)?.destructured ?: return null
        if (first.isEmpty()) {
            val suffix = last.toLongOrNull()?.takeIf { it > 0 } ?: return null
            return (total - minOf(suffix, total)) until total
        }
        val start = first.toLongOrNull()?.takeIf { it < total } ?: return null
        val end = if (last.isEmpty()) total - 1 else minOf(last.toLongOrNull() ?: return null, total - 1)
        return (start..end).takeUnless { it.isEmpty() }
    }
}

/** Кнопка трансляции: показываем, только если на телефоне есть Chromecast (сервисы Google Play). */
fun android.app.Activity.setupCastButton(button: androidx.mediarouter.app.MediaRouteButton) {
    if (Cast.context(this) == null) return
    runCatching {
        com.google.android.gms.cast.framework.CastButtonFactory.setUpMediaRouteButton(applicationContext, button)
        button.visibility = android.view.View.VISIBLE
    }
}
