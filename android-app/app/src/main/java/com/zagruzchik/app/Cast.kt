package com.zagruzchik.app

import android.content.Context
import android.net.ConnectivityManager
import android.net.Uri
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import com.google.android.gms.cast.CastMediaControlIntent
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

    /** Название устройства, на котором сейчас играет: «Гостиная», «Колонка на кухне»… */
    fun deviceName(ctx: Context): String? =
        context(ctx)?.sessionManager?.currentCastSession?.castDevice?.friendlyName

    /**
     * Готовит песню/видео для телевизора: скачанные файлы отдаём через домашний сервер,
     * для потоков указываем тип (без него телевизор не начнёт играть).
     */
    fun castable(ctx: Context, item: MediaItem): MediaItem? {
        val uri = item.localConfiguration?.uri ?: item.requestMetadata.mediaUri ?: Uri.parse(item.mediaId)
        val extras = item.mediaMetadata.extras
        return if (uri.scheme == "content" || uri.scheme == "file") {
            val mime = extras?.getString(Playback.X_LOCAL_MIME) ?: "audio/mpeg"
            val http = LocalServer.urlFor(ctx, uri, mime) ?: return null
            item.buildUpon().setUri(http).setMimeType(mime).build()
        } else {
            item.buildUpon().setUri(uri).setMimeType(guessMime(uri.toString())).build()
        }
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
            else -> MimeTypes.AUDIO_MPEG
        }
    }
}

/**
 * Крошечный HTTP-сервер в домашней сети: телевизор не видит память телефона,
 * поэтому скачанный файл он забирает отсюда. Отдаём только зарегистрированные файлы
 * по случайной ссылке; поддерживается перемотка (Range).
 */
object LocalServer {
    private var server: ServerSocket? = null
    private val files = ConcurrentHashMap<String, Pair<Uri, String>>()
    private val pool = Executors.newCachedThreadPool()
    private lateinit var app: Context

    @Synchronized
    fun urlFor(ctx: Context, uri: Uri, mime: String): String? {
        app = ctx.applicationContext
        val ip = wifiIp(app) ?: return null
        val s = server ?: ServerSocket(0).also { server = it; pool.execute { acceptLoop(it) } }
        val token = files.entries.firstOrNull { it.value.first == uri }?.key ?: UUID.randomUUID().toString().also { files[it] = uri to mime }
        return "http://$ip:${s.localPort}/f/$token"
    }

    private fun wifiIp(ctx: Context): String? {
        val cm = ctx.getSystemService(ConnectivityManager::class.java) ?: return null
        val lp = cm.getLinkProperties(cm.activeNetwork) ?: return null
        return lp.linkAddresses.map { it.address }.firstOrNull { it is Inet4Address && !it.isLoopbackAddress }?.hostAddress
    }

    private fun acceptLoop(s: ServerSocket) {
        while (!s.isClosed) {
            val c = runCatching { s.accept() }.getOrNull() ?: break
            pool.execute { runCatching { handle(c) }; runCatching { c.close() } }
        }
    }

    private fun handle(c: Socket) {
        val input = c.getInputStream().bufferedReader()
        val request = input.readLine() ?: return
        var range: String? = null
        while (true) {
            val h = input.readLine() ?: break
            if (h.isEmpty()) break
            if (h.startsWith("Range:", true)) range = h.substringAfter(':').trim()
        }
        val out = BufferedOutputStream(c.getOutputStream())
        val path = request.split(' ').getOrNull(1).orEmpty()
        val entry = files[path.substringAfter("/f/", "")]
        if (entry == null) {
            out.write("HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n".toByteArray()); out.flush(); return
        }
        val (uri, mime) = entry
        app.contentResolver.openAssetFileDescriptor(uri, "r")!!.use { afd ->
            val total = afd.length
            var start = 0L
            var end = total - 1
            range?.let { r ->
                Regex("""bytes=(\d*)-(\d*)""").find(r)?.let { m ->
                    m.groupValues[1].toLongOrNull()?.let { start = it }
                    m.groupValues[2].toLongOrNull()?.let { end = minOf(it, total - 1) }
                }
            }
            val len = end - start + 1
            val head = buildString {
                append(if (range != null) "HTTP/1.1 206 Partial Content\r\n" else "HTTP/1.1 200 OK\r\n")
                append("Content-Type: $mime\r\nAccept-Ranges: bytes\r\nContent-Length: $len\r\n")
                if (range != null) append("Content-Range: bytes $start-$end/$total\r\n")
                append("Access-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n")
            }
            out.write(head.toByteArray())
            if (request.startsWith("HEAD")) { out.flush(); return }
            afd.createInputStream().use { ins ->
                ins.skip(start)
                val buf = ByteArray(64 * 1024)
                var left = len
                while (left > 0) {
                    val n = ins.read(buf, 0, minOf(buf.size.toLong(), left).toInt())
                    if (n < 0) break
                    out.write(buf, 0, n)
                    left -= n
                }
            }
            out.flush()
        }
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
