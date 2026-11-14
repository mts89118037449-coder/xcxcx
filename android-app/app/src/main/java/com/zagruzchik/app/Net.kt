package com.zagruzchik.app

import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.Uri
import androidx.media3.common.C
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DataSource
import androidx.media3.datasource.DataSpec
import androidx.media3.datasource.TransferListener
import java.io.IOException
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL

/**
 * Сеть в обход VPN — только для YouTube. Адресам VPN YouTube часто не отдаёт звук («подтвердите, что вы не робот»),
 * а обычному адресу телефона (Wi‑Fi / мобильная сеть) отдаёт. Когда такое случается, запросы к YouTube идут
 * напрямую через обычную сеть; всё остальное по-прежнему через VPN.
 */
object Net {
    /** YouTube сейчас берём напрямую, мимо VPN. */
    @Volatile var youtubeDirect = false

    private val cm get() = App.instance.getSystemService(ConnectivityManager::class.java)

    fun vpnActive(): Boolean = runCatching {
        cm.getNetworkCapabilities(cm.activeNetwork)?.hasTransport(NetworkCapabilities.TRANSPORT_VPN) == true
    }.getOrDefault(false)

    /** Обычная сеть телефона (не VPN): Wi‑Fi, иначе мобильная. null — такой нет или VPN не даёт её использовать. */
    @Suppress("DEPRECATION")
    fun physical(): Network? = runCatching {
        cm.allNetworks.mapNotNull { n -> cm.getNetworkCapabilities(n)?.let { n to it } }
            .filter { (_, c) -> c.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) && !c.hasTransport(NetworkCapabilities.TRANSPORT_VPN) }
            .sortedByDescending { (_, c) -> c.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) }
            .firstOrNull()?.first
    }.getOrNull()

    fun isYoutube(host: String?): Boolean = host != null && (host.endsWith("youtube.com") || host.endsWith("googlevideo.com") ||
        host.endsWith("youtubei.googleapis.com") || host.endsWith("ytimg.com") || host.endsWith("youtu.be"))

    /** Соединение: для YouTube в режиме «напрямую» — через обычную сеть, иначе как обычно. */
    fun open(url: URL): HttpURLConnection {
        if (youtubeDirect && isYoutube(url.host)) physical()?.let { return it.openConnection(url) as HttpURLConnection }
        return url.openConnection() as HttpURLConnection
    }
}

/** Простое чтение по HTTP через [Net.open] — чтобы и проигрыватель брал звук YouTube той же сетью, что и ссылку. */
@UnstableApi
class NetDataSource : DataSource {
    private var conn: HttpURLConnection? = null
    private var input: InputStream? = null
    private var uri: Uri? = null
    private var left = C.LENGTH_UNSET.toLong()
    private var headers: Map<String, List<String>> = emptyMap()

    override fun addTransferListener(transferListener: TransferListener) {}

    override fun open(dataSpec: DataSpec): Long {
        uri = dataSpec.uri
        val c = Net.open(URL(dataSpec.uri.toString()))
        c.connectTimeout = 8000; c.readTimeout = 12000
        c.setRequestProperty("User-Agent", Http.DESKTOP_UA)
        val end = if (dataSpec.length != C.LENGTH_UNSET.toLong()) (dataSpec.position + dataSpec.length - 1).toString() else ""
        if (dataSpec.position != 0L || end.isNotEmpty()) c.setRequestProperty("Range", "bytes=${dataSpec.position}-$end")
        val code = c.responseCode
        if (code !in 200..299) { c.disconnect(); throw IOException("HTTP $code") }
        conn = c
        headers = c.headerFields.filterKeys { it != null }
        input = c.inputStream
        left = if (dataSpec.length != C.LENGTH_UNSET.toLong()) dataSpec.length else c.contentLengthLong.takeIf { it >= 0 } ?: C.LENGTH_UNSET.toLong()
        return left
    }

    override fun read(buffer: ByteArray, offset: Int, length: Int): Int {
        if (length == 0) return 0
        if (left == 0L) return C.RESULT_END_OF_INPUT
        val want = if (left > 0) minOf(length.toLong(), left).toInt() else length
        val n = input?.read(buffer, offset, want) ?: -1
        if (n < 0) return C.RESULT_END_OF_INPUT
        if (left > 0) left -= n
        return n
    }

    override fun getUri(): Uri? = uri
    override fun getResponseHeaders(): Map<String, List<String>> = headers
    override fun close() { runCatching { input?.close() }; input = null; runCatching { conn?.disconnect() }; conn = null }
}
