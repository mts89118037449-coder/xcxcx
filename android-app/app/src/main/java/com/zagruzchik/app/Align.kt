package com.zagruzchik.app

import android.content.Context
import java.io.File
import java.util.concurrent.TimeUnit
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.ln
import kotlin.math.max
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * Где во всей песне находится 30-секундный фрагмент — чтобы полная версия продолжила
 * ровно с того места, где закончился фрагмент, а не с начала.
 *
 * Как: оба звука переводим в «рисунок» — как меняется громкость в 12 полосах частот
 * (так не мешают разная громкость, эквалайзер и кодек), и ищем, где рисунок фрагмента
 * совпадает с рисунком песни. Фрагмент проверяем тремя частями по 10 секунд: у настоящего
 * места все части лягут подряд, а у повтора припева — нет. Ответ — только если части согласны.
 */
object Align {
    private const val SR = 8000
    private const val N = 512
    private const val HOP = 256
    private const val BANDS = 12
    private const val PARTS = 3
    private const val FPS = SR.toDouble() / HOP

    /** Где во всей песне (мс) окажется момент [previewMs] фрагмента. */
    class Result(private val partStartsSec: List<Double>, private val partLenSec: Double) {
        fun shifted(by: Double) = Result(partStartsSec.map { it + by }, partLenSec)

        fun fullPositionMs(previewMs: Long): Long {
            val p = previewMs / 1000.0
            val k = (p / partLenSec).toInt().coerceIn(0, partStartsSec.lastIndex)
            return ((partStartsSec[k] + p) * 1000).toLong()
        }
    }

    // ---------------- Звук → числа (ffmpeg, который уже есть в приложении) ----------------

    /**
     * Где фрагмент в полной версии — проверяем окнами, начиная с начала песни:
     * фрагменты почти всегда из первых двух минут, поэтому обычно хватает первого окна,
     * и не нужно скачивать всю песню. Окна перекрываются, чтобы фрагмент не разрезало.
     */
    fun findInStream(ctx: Context, preview: ShortArray, url: String, durationSec: Int): Result? {
        val end = if (durationSec in 40..900) durationSec else 400
        var start = 0
        while (start < end) {
            val len = minOf(110, end - start)
            val chunk = pcm(ctx, url, len, start) ?: return null
            find(preview, chunk)?.let { return it.shifted(start.toDouble()) }
            if (start + len >= end) break
            start += len - 35 // перекрытие больше длины фрагмента
        }
        return null
    }

    /** Звук по ссылке → моно 8 кГц, не дольше [maxSec] секунд, начиная с [fromSec]. */
    fun pcm(ctx: Context, url: String, maxSec: Int, fromSec: Int = 0): ShortArray? {
        App.awaitReadyOrNull() ?: return null
        val bin = File(ctx.applicationInfo.nativeLibraryDir, "libffmpeg.so")
        val pkgs = File(ctx.noBackupFilesDir, "youtubedl-android/packages")
        val p = ProcessBuilder(
            bin.absolutePath, "-nostdin", "-loglevel", "error", "-ss", fromSec.toString(), "-t", maxSec.toString(), "-i", url,
            "-ac", "1", "-ar", SR.toString(), "-f", "s16le", "pipe:1",
        ).apply {
            environment()["LD_LIBRARY_PATH"] = "${pkgs}/ffmpeg/usr/lib:${pkgs}/python/usr/lib"
            environment()["SSL_CERT_FILE"] = "${pkgs}/python/usr/etc/tls/cert.pem"
            redirectError(File("/dev/null"))
        }.start()
        val bytes = try {
            p.inputStream.use { it.readBytes() }
        } finally {
            if (!p.waitFor(2, TimeUnit.SECONDS)) p.destroy()
        }
        if (bytes.size < SR * 2 * 5) return null // меньше 5 секунд — не годится
        return ShortArray(bytes.size / 2) { i -> ((bytes[2 * i].toInt() and 0xFF) or (bytes[2 * i + 1].toInt() shl 8)).toShort() }
    }

    // ---------------- Поиск места ----------------

    /** null — уверенного ответа нет (тогда лучше начать с начала, чем прыгнуть не туда). */
    fun find(preview: ShortArray, full: ShortArray): Result? {
        val a = features(preview)
        val b = features(full)
        if (a.size < PARTS * 20 || b.size <= a.size) return null
        val partLen = a.size / PARTS
        val starts = (0 until PARTS).map { i ->
            val seg = a.copyOfRange(i * partLen, (i + 1) * partLen)
            val (lag, score) = bestLag(seg, b)
            Triple(lag / FPS - i * partLen / FPS, score, i) // начало фрагмента по этой части
        }
        // Части должны указывать на одно и то же место (±0.4 с) — иначе это повтор/другая версия.
        val agreeing = starts.filter { s -> starts.count { kotlin.math.abs(it.first - s.first) < 0.4 } >= 2 }
        if (agreeing.size < 2 || agreeing.any { it.second < 0.35 }) return null
        val consensus = agreeing.map { it.first }.average()
        val perPart = starts.map { if (kotlin.math.abs(it.first - consensus) < 0.4) it.first else consensus }
        return Result(perPart, partLen / FPS)
    }

    private fun bestLag(seg: Array<FloatArray>, b: Array<FloatArray>): Pair<Int, Double> {
        var best = 0
        var bestScore = Double.NEGATIVE_INFINITY
        val norm = (seg.size * BANDS).toDouble()
        for (l in 0..b.size - seg.size) {
            var s = 0.0
            for (t in seg.indices) {
                val x = seg[t]; val y = b[l + t]
                for (k in 0 until BANDS) s += x[k] * y[k]
            }
            if (s > bestScore) { bestScore = s; best = l }
        }
        return best to bestScore / norm
    }

    /** «Рисунок» звука: нарастания громкости в 12 полосах частот, нормированные по каждой полосе. */
    internal fun features(x: ShortArray): Array<FloatArray> {
        val frames = (x.size - N) / HOP
        if (frames < 2) return emptyArray()
        val win = FloatArray(N) { (0.5 - 0.5 * cos(2 * PI * it / (N - 1))).toFloat() }
        val edges = IntArray(BANDS + 1) { (4 * exp(ln(256.0 / 4) * it / BANDS)).toInt() } // ~60 Гц … 4 кГц
        val re = DoubleArray(N); val im = DoubleArray(N)
        var prev = FloatArray(BANDS)
        val out = Array(frames - 1) { FloatArray(BANDS) }
        for (f in 0 until frames) {
            for (i in 0 until N) { re[i] = x[f * HOP + i] / 32768.0 * win[i]; im[i] = 0.0 }
            fft(re, im)
            val e = FloatArray(BANDS) { k ->
                var s = 0.0
                for (j in edges[k] until edges[k + 1]) s += re[j] * re[j] + im[j] * im[j]
                ln(s + 1e-6).toFloat()
            }
            if (f > 0) for (k in 0 until BANDS) out[f - 1][k] = max(0f, e[k] - prev[k])
            prev = e
        }
        for (k in 0 until BANDS) {
            var mean = 0.0; for (r in out) mean += r[k]; mean /= out.size
            var v = 0.0; for (r in out) v += (r[k] - mean) * (r[k] - mean)
            val sd = sqrt(v / out.size) + 1e-6
            for (r in out) r[k] = ((r[k] - mean) / sd).toFloat()
        }
        return out
    }

    private fun fft(re: DoubleArray, im: DoubleArray) {
        val n = re.size
        var j = 0
        for (i in 1 until n) {
            var bit = n shr 1
            while (j and bit != 0) { j = j xor bit; bit = bit shr 1 }
            j = j or bit
            if (i < j) { var t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t }
        }
        var len = 2
        while (len <= n) {
            val ang = -2 * PI / len
            val wr = cos(ang); val wi = sin(ang)
            var i = 0
            while (i < n) {
                var cr = 1.0; var ci = 0.0
                for (k in 0 until len / 2) {
                    val ur = re[i + k]; val ui = im[i + k]
                    val vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci
                    val vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr
                    re[i + k] = ur + vr; im[i + k] = ui + vi
                    re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi
                    val ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr
                }
                i += len
            }
            len = len shl 1
        }
    }
}
