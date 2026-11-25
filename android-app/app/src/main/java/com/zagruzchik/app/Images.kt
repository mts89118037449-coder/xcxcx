package com.zagruzchik.app

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Handler
import android.os.Looper
import android.util.LruCache
import android.widget.ImageView
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.LinkedBlockingDeque
import java.util.concurrent.ThreadPoolExecutor
import java.util.concurrent.TimeUnit

/**
 * Обложки по ссылке. Для списков картинка уменьшается до размера миниатюры (раньше 1000×1000
 * раскодировались ради значка 52 dp — это и тормозило поиск), кэш в памяти — по объёму,
 * а обложки строк, которых уже нет на экране, не качаются.
 */
object Images {
    private val memory = object : LruCache<String, Bitmap>((Runtime.getRuntime().maxMemory() / 8 / 1024).toInt()) {
        override fun sizeOf(key: String, value: Bitmap) = value.byteCount / 1024
    }
    // Свежие запросы — первыми (при наборе текста старые строки уже не нужны).
    private val pool = ThreadPoolExecutor(4, 4, 30, TimeUnit.SECONDS, object : LinkedBlockingDeque<Runnable>() {
        override fun offer(e: Runnable) = offerFirst(e)
    })
    private val main = Handler(Looper.getMainLooper())

    private fun keyOf(url: String, maxPx: Int) = if (maxPx > 0) "$url@$maxPx" else url

    fun cached(url: String?) = url?.let { memory.get(it) }

    /** Полноразмерная картинка (обложка в плеере, карточка песни). */
    fun load(url: String?, onReady: (Bitmap) -> Unit) = load(url, 0, { true }, onReady)

    private fun load(url: String?, maxPx: Int, wanted: () -> Boolean, onReady: (Bitmap) -> Unit) {
        if (url.isNullOrEmpty()) return
        val key = keyOf(url, maxPx)
        memory.get(key)?.let { onReady(it); return }
        pool.execute {
            if (!wanted()) return@execute // строка уже ушла с экрана — не качаем
            val b = runCatching { decode(url, maxPx) }.getOrNull() ?: return@execute
            memory.put(key, b)
            main.post { onReady(b) }
        }
    }

    // Дисковый кэш картинок: повторный поиск и списки показывают обложки сразу, без сети.
    // Лежит в cacheDir — система сама чистит при нехватке места; сами держим до ~60 МБ.
    private val diskDir by lazy { java.io.File(App.instance.cacheDir, "img").apply { mkdirs() } }

    private val writesSincePrune = java.util.concurrent.atomic.AtomicInteger(0)
    private val pruneLock = Any()

    private fun diskFile(url: String): java.io.File = java.io.File(diskDir, Http.sha1(url))

    private fun pruneDisk() {
        synchronized(pruneLock) {
            val files = diskDir.listFiles() ?: return
            var total = 0L
            val entries = ArrayList<Triple<java.io.File, Long, Long>>(files.size)
            for (f in files) {
                val len = f.length()
                total += len
                entries += Triple(f, f.lastModified(), len)
            }
            if (total < 60L * 1024 * 1024) return
            entries.sortBy { it.second }
            for ((f, _, len) in entries) {
                if (total <= 30L * 1024 * 1024) break
                if (f.delete()) total -= len
            }
        }
    }

    private fun fetch(url: String): ByteArray = (URL(url).openConnection() as HttpURLConnection).run {
        setRequestProperty("User-Agent", Http.MOBILE_UA)
        connectTimeout = 10_000; readTimeout = 15_000
        try {
            if (responseCode !in 200..299) {
                runCatching { errorStream?.close() }
                throw Http.HttpError(responseCode, url)
            }
            inputStream.use { it.readBytes() }
        } finally { disconnect() }
    }

    private fun decodeBytes(bytes: ByteArray, maxPx: Int): Bitmap? {
        if (bytes.isEmpty()) return null
        if (maxPx <= 0) return BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
        var sample = 1
        while (bounds.outWidth / (sample * 2) >= maxPx && bounds.outHeight / (sample * 2) >= maxPx) sample *= 2
        return BitmapFactory.decodeByteArray(bytes, 0, bytes.size, BitmapFactory.Options().apply {
            inSampleSize = sample
            inPreferredConfig = Bitmap.Config.RGB_565 // обложкам прозрачность не нужна — вдвое меньше памяти
        })
    }

    private fun decode(url: String, maxPx: Int): Bitmap? {
        val f = diskFile(url)
        val cachedBytes = if (f.exists()) runCatching { f.readBytes() }.getOrNull() else null
        if (cachedBytes != null) {
            decodeBytes(cachedBytes, maxPx)?.let { return it }
            runCatching { f.delete() } // битый или пустой файл в кэше — удаляем и качаем заново
        }
        val netBytes = fetch(url)
        val bmp = decodeBytes(netBytes, maxPx) ?: return null
        runCatching {
            val tmp = java.io.File(diskDir, "${f.name}.tmp.${Thread.currentThread().id}")
            tmp.writeBytes(netBytes)
            if (tmp.renameTo(f)) {
                f.setLastModified(System.currentTimeMillis())
                if (writesSincePrune.incrementAndGet() >= 25) {
                    writesSincePrune.set(0)
                    pruneDisk()
                }
            } else {
                tmp.delete()
            }
        }
        return bmp
    }

    /** В список: картинка размером с вид; подставляется, только если строку не переиспользовали под другую песню. */
    fun into(view: ImageView, url: String?, placeholder: Int) {
        view.tag = url
        val lp = view.layoutParams
        val maxPx = maxOf(lp?.width ?: 0, lp?.height ?: 0).takeIf { it > 0 } ?: 0
        val key = url?.let { keyOf(it, maxPx) }
        val c = key?.let { memory.get(it) }
        if (c != null) { view.setImageBitmap(c); return }
        view.setImageResource(placeholder)
        if (url.isNullOrEmpty()) return
        // Строку убрали с экрана (новый поиск перерисовал список) — её обложка больше не нужна.
        var gone = false
        view.addOnAttachStateChangeListener(object : android.view.View.OnAttachStateChangeListener {
            override fun onViewAttachedToWindow(v: android.view.View) {}
            override fun onViewDetachedFromWindow(v: android.view.View) { gone = true; v.removeOnAttachStateChangeListener(this) }
        })
        load(url, maxPx, wanted = { view.tag == url && !gone }) { if (view.tag == url) view.setImageBitmap(it) }
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
