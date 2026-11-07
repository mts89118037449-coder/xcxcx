package com.zagruzchik.app

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Handler
import android.os.Looper
import android.util.LruCache
import android.widget.ImageView
import java.net.URL
import java.util.concurrent.Executors

/** Загрузка картинок по ссылке (обложки в поиске и плеере) с кэшем в памяти. */
object Images {
    private val memory = LruCache<String, Bitmap>(60)
    private val pool = Executors.newFixedThreadPool(3)
    private val main = Handler(Looper.getMainLooper())

    fun cached(url: String?) = url?.let { memory.get(it) }

    fun load(url: String?, onReady: (Bitmap) -> Unit) {
        if (url.isNullOrEmpty()) return
        memory.get(url)?.let { onReady(it); return }
        pool.execute {
            val b = runCatching { URL(url).openStream().use { BitmapFactory.decodeStream(it) } }.getOrNull() ?: return@execute
            memory.put(url, b)
            main.post { onReady(b) }
        }
    }

    /** В список: картинка подставляется, только если строку не успели переиспользовать под другую песню. */
    fun into(view: ImageView, url: String?, placeholder: Int) {
        view.tag = url
        val c = cached(url)
        if (c != null) { view.setImageBitmap(c); return }
        view.setImageResource(placeholder)
        load(url) { if (view.tag == url) view.setImageBitmap(it) }
    }

    /** Основной цвет картинки — для фона плеера. */
    fun dominant(b: Bitmap): Int = Bitmap.createScaledBitmap(b, 1, 1, true).getPixel(0, 0)
}
