package com.zagruzchik.app

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Handler
import android.os.Looper
import android.util.LruCache
import android.widget.ImageView
import java.util.concurrent.LinkedBlockingDeque
import java.util.concurrent.ThreadPoolExecutor
import java.util.concurrent.TimeUnit

/**
 * Обложки по ссылке. Для списков картинка уменьшается до размера миниатюры (раньше 1000×1000
 * раскодировались ради значка 52 dp), кэш в памяти — по объёму.
 * Все размеры одной обложки используют один запрос и одну копию на диске.
 */
object Images {
    private val memory = object : LruCache<String, Bitmap>((Runtime.getRuntime().maxMemory() / 8 / 1024).toInt()) {
        override fun sizeOf(key: String, value: Bitmap) = (value.byteCount / 1024).coerceAtLeast(1)
    }
    // Свежие запросы — первыми (при наборе текста старые строки уже не нужны).
    private val pool = ThreadPoolExecutor(4, 4, 30, TimeUnit.SECONDS, object : LinkedBlockingDeque<Runnable>() {
        override fun offer(e: Runnable) = offerFirst(e)
    })
    private val main = Handler(Looper.getMainLooper())

    private fun keyOf(url: String, maxPx: Int) = "$maxPx:$url"
    private val requests = mutableMapOf<String, MutableList<Request>>()
    private val recentFailures = android.util.LruCache<String, Long>(128)
    private data class Request(val maxPx: Int, val wanted: () -> Boolean, val onReady: (Bitmap) -> Unit)

    private fun targetSize(px: Int) = when {
        px <= 128 && px > 0 -> 128
        px <= 256 && px > 0 -> 256
        px <= 512 && px > 0 -> 512
        else -> 1024
    }

    fun cached(url: String?): Bitmap? {
        if (url.isNullOrBlank()) return null
        return listOf(1024, 512, 256, 128).firstNotNullOfOrNull { memory.get(keyOf(url, it)) }
    }

    /** Полноразмерная картинка (обложка в плеере, карточка песни). */
    fun load(url: String?, onReady: (Bitmap) -> Unit) = load(url, 0, { true }, onReady)

    private fun load(url: String?, maxPx: Int, wanted: () -> Boolean, onReady: (Bitmap) -> Unit) {
        if (url.isNullOrBlank()) return
        val size = targetSize(maxPx)
        val key = keyOf(url, size)
        memory.get(key)?.let { if (wanted()) onReady(it); return }
        val lastFailure = recentFailures.get(url)
        if (lastFailure != null && android.os.SystemClock.elapsedRealtime() - lastFailure < 15_000L) return
        synchronized(requests) {
            requests[url]?.let { it += Request(size, wanted, onReady); return }
            requests[url] = mutableListOf(Request(size, wanted, onReady))
        }
        pool.execute {
            val bytes = runCatching { imageBytes(url) }.getOrNull()
            val pending = synchronized(requests) { requests.getValue(url).toList().also { requests.getValue(url).clear() } }
            val variants = mutableMapOf<Int, Bitmap?>()
            fun deliver(batch: List<Request>) = batch.forEach { request ->
                val variantKey = keyOf(url, request.maxPx)
                val b = memory.get(variantKey) ?: variants.getOrPut(request.maxPx) {
                    bytes?.let { runCatching { decodeBytes(it, request.maxPx) }.getOrNull() }
                        ?.also { memory.put(variantKey, it) }
                }
                if (b != null) main.post { if (request.wanted()) request.onReady(b) }
            }
            deliver(pending)
            if (bytes == null || (variants.isNotEmpty() && variants.values.all { it == null })) {
                recentFailures.put(url, android.os.SystemClock.elapsedRealtime())
                if (bytes != null) diskFile(url).delete()
            }
            while (true) {
                val more = synchronized(requests) {
                    val queued = requests.getValue(url)
                    if (queued.isEmpty()) { requests.remove(url); null }
                    else queued.toList().also { queued.clear() }
                } ?: break
                deliver(more)
            }
        }
    }

    private val diskDir by lazy { java.io.File(App.instance.cacheDir, "img").apply { mkdirs() } }
    private val writesSincePrune = java.util.concurrent.atomic.AtomicInteger()
    private val pruneLock = Any()
    private const val DISK_LIMIT = 128L * 1024 * 1024
    private const val MAX_IMAGE_BYTES = 12L * 1024 * 1024

    private fun diskFile(url: String): java.io.File = java.io.File(diskDir, Http.sha1(url))

    private fun pruneDisk() {
        synchronized(pruneLock) {
            val files = diskDir.listFiles()?.filter { it.name.length == 40 } ?: return
            var total = files.sumOf { it.length() }
            if (total <= DISK_LIMIT) return
            for (file in files.sortedBy { it.lastModified() }) {
                if (total <= DISK_LIMIT) break
                val size = file.length()
                if (file.delete()) total -= size
            }
        }
    }

    private fun imageBytes(url: String): ByteArray? {
        val file = diskFile(url)
        if (file.length() in 1..MAX_IMAGE_BYTES) {
            val bytes = runCatching { file.readBytes() }.getOrNull()
            if (bytes != null && bytes.isNotEmpty()) {
                val now = System.currentTimeMillis()
                if (now - file.lastModified() > 60_000L) file.setLastModified(now)
                return bytes
            }
        }
        val bytes = Http.bytes(url, timeoutMs = 8000, maxBytes = MAX_IMAGE_BYTES)
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
        runCatching {
            val tmp = java.io.File(diskDir, "${file.name}.tmp.${Thread.currentThread().id}")
            try {
                tmp.writeBytes(bytes)
                if (tmp.renameTo(file) && writesSincePrune.incrementAndGet() % 4 == 1) pruneDisk()
            } finally {
                tmp.delete()
            }
        }
        return bytes
    }

    fun loadArtwork(bytes: ByteArray, maxPx: Int, onReady: (Bitmap?) -> Unit) {
        val size = targetSize(maxPx)
        val key = "art:$size:${bytes.size}:${bytes.contentHashCode()}"
        memory.get(key)?.let { onReady(it); return }
        pool.execute {
            val bitmap = memory.get(key) ?: runCatching { decodeBytes(bytes, size) }.getOrNull()
                ?.also { memory.put(key, it) }
            main.post { onReady(bitmap) }
        }
    }

    private fun decodeBytes(bytes: ByteArray, maxPx: Int): Bitmap? {
        if (bytes.isEmpty()) return null
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
        var sample = 1
        while (maxOf(bounds.outWidth, bounds.outHeight) / sample > maxPx * 2) sample *= 2
        return BitmapFactory.decodeByteArray(bytes, 0, bytes.size, BitmapFactory.Options().apply {
            inSampleSize = sample
            if (maxPx <= 256) inPreferredConfig = Bitmap.Config.RGB_565
        })
    }

    /** В список: картинка размером с вид; подставляется, только если строку не переиспользовали под другую песню. */
    fun into(view: ImageView, url: String?, placeholder: Int, onReady: (Bitmap) -> Unit = {}) {
        view.animate().cancel()
        view.alpha = 1f
        view.tag = url
        val lp = view.layoutParams
        val maxPx = maxOf(lp?.width ?: 0, lp?.height ?: 0).takeIf { it > 0 } ?: 0
        val key = url?.let { keyOf(it, targetSize(maxPx)) }
        val c = key?.let { memory.get(it) }
        if (c != null) { view.setImageBitmap(c); onReady(c); return }
        view.setImageResource(placeholder)
        if (url.isNullOrEmpty()) return
        // Строку убрали с экрана (новый поиск перерисовал список) — её обложка больше не нужна.
        var gone = false
        view.addOnAttachStateChangeListener(object : android.view.View.OnAttachStateChangeListener {
            override fun onViewAttachedToWindow(v: android.view.View) {}
            override fun onViewDetachedFromWindow(v: android.view.View) {
                gone = true
                v.animate().cancel()
                v.removeOnAttachStateChangeListener(this)
            }
        })
        load(url, maxPx, wanted = { view.tag == url && !gone }) {
            if (view.tag == url && !gone) {
                view.alpha = 0.4f
                view.setImageBitmap(it)
                onReady(it)
                view.animate().alpha(1f).setDuration(160).start()
            }
        }
    }

    /** Основной цвет картинки — для фона плеера. */
    fun dominant(b: Bitmap): Int {
        val s = Bitmap.createScaledBitmap(b, 1, 1, true)
        return s.getPixel(0, 0).also { if (s !== b) s.recycle() }
    }

    /**
     * Основной акцент обложки: самый «весомый» оттенок среди по-настоящему цветных точек (серые и тёмные не считаются),
     * достаточно светлый, чтобы быть видным на тёмном фоне. У серой/чёрно-белой обложки — светло-серый.
     */
    fun accent(b: Bitmap): Int {
        val n = 24
        val small = runCatching { Bitmap.createScaledBitmap(b, n, n, true) }.getOrNull() ?: return 0xFFD8D8DE.toInt()
        val px = IntArray(n * n)
        try { small.getPixels(px, 0, n, 0, 0, n, n) } finally { if (small !== b) small.recycle() }
        val w = FloatArray(12); val r = FloatArray(12); val g = FloatArray(12); val bl = FloatArray(12)
        val hsv = FloatArray(3)
        for (p in px) {
            val cr = android.graphics.Color.red(p); val cg = android.graphics.Color.green(p); val cb = android.graphics.Color.blue(p)
            val chroma = maxOf(cr, cg, cb) - minOf(cr, cg, cb)
            if (chroma < 34) continue
            android.graphics.Color.colorToHSV(p, hsv)
            val i = (hsv[0] / 30f).toInt().coerceIn(0, 11)
            val k = (chroma * chroma).toFloat()
            w[i] += k; r[i] += cr * k; g[i] += cg * k; bl[i] += cb * k
        }
        val i = w.indices.maxByOrNull { w[it] } ?: 0
        if (w[i] <= 0f) return 0xFFD8D8DE.toInt()
        android.graphics.Color.colorToHSV(android.graphics.Color.rgb((r[i] / w[i]).toInt(), (g[i] / w[i]).toInt(), (bl[i] / w[i]).toInt()), hsv)
        hsv[2] = hsv[2].coerceIn(0.78f, 1f)
        return android.graphics.Color.HSVToColor(hsv)
    }
}
