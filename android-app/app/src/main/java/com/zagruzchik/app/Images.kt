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

    private fun decode(url: String, maxPx: Int): Bitmap? {
        val bytes = (URL(url).openConnection() as HttpURLConnection).run {
            connectTimeout = 10_000; readTimeout = 15_000
            try { inputStream.use { it.readBytes() } } finally { disconnect() }
        }
        if (maxPx <= 0) return BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
        var sample = 1
        while (bounds.outWidth / (sample * 2) >= maxPx && bounds.outHeight / (sample * 2) >= maxPx) sample *= 2
        return BitmapFactory.decodeByteArray(bytes, 0, bytes.size, BitmapFactory.Options().apply {
            inSampleSize = sample
            inPreferredConfig = Bitmap.Config.RGB_565 // обложкам прозрачность не нужна — вдвое меньше памяти
        })
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
        // Строку убрали с экрана (новый поиск перерисовал список) — её обложка больше не нужна.
        var gone = false
        view.addOnAttachStateChangeListener(object : android.view.View.OnAttachStateChangeListener {
            override fun onViewAttachedToWindow(v: android.view.View) {}
            override fun onViewDetachedFromWindow(v: android.view.View) { gone = true; v.removeOnAttachStateChangeListener(this) }
        })
        load(url, maxPx, wanted = { view.tag == url && !gone }) { if (view.tag == url) view.setImageBitmap(it) }
    }

    /** Основной цвет картинки — для фона плеера. */
    fun dominant(b: Bitmap): Int = Bitmap.createScaledBitmap(b, 1, 1, true).getPixel(0, 0)
}
