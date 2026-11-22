package com.zagruzchik.app

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.util.LruCache
import android.util.Size
import java.io.File
import java.net.URL
import java.util.concurrent.Executors

/**
 * Обложки для карточек загрузок.
 * Готовый файл: обложка из самого файла (у MP3 она вшита) или кадр из видео — это делает Android.
 * Пока качается: превью из источника (YouTube, SoundCloud…).
 * Хранятся в памяти и на диске, чтобы список листался без задержек.
 */
object Covers {
    private const val SIZE = 256
    private val memory = LruCache<String, Bitmap>(80)
    private val loading = mutableSetOf<String>()
    private val failed = mutableSetOf<String>()
    private val pool = Executors.newFixedThreadPool(2)
    private val main = Handler(Looper.getMainLooper())

    private fun dir(ctx: Context) = File(ctx.filesDir, "covers").apply { mkdirs() }
    private fun file(ctx: Context, id: String) = File(dir(ctx), "$id.jpg")

    /** Ключ меняется, когда появляются файлы — тогда превью заменяется настоящей обложкой. */
    private fun key(job: Job) = "${job.id}:${job.files.size}"

    /** Обложка, если уже есть; иначе null и фоновая загрузка, после которой вызовется [onReady]. */
    fun get(ctx: Context, job: Job, onReady: () -> Unit): Bitmap? {
        val k = key(job)
        memory.get(k)?.let { return it }
        if (k in loading || k in failed) return memory.get(job.id) // старое превью, пока грузится новое
        if (job.files.isEmpty() && job.coverUrl == null && !file(ctx, job.id).exists()) return null
        loading += k
        val app = ctx.applicationContext
        val files = job.files
        val url = job.coverUrl
        val id = job.id
        pool.execute {
            val bmp = runCatching { load(app, id, files, url) }.getOrNull()
            main.post {
                loading -= k
                if (bmp == null) {
                    failed += k
                } else {
                    memory.put(k, bmp)
                    memory.put(id, bmp)
                    onReady()
                }
            }
        }
        return memory.get(id)
    }

    private fun load(ctx: Context, id: String, files: List<SavedFile>, url: String?): Bitmap? {
        val disk = file(ctx, id)
        // 1) Из готового файла (обложка MP3 или кадр видео).
        for (f in files.take(3)) {
            val b = runCatching { ctx.contentResolver.loadThumbnail(Uri.parse(f.uri), Size(SIZE, SIZE), null) }.getOrNull()
            if (b != null) return b.also { save(it, disk) }
        }
        // 2) Уже сохранённая.
        if (disk.exists()) BitmapFactory.decodeFile(disk.path)?.let { return it }
        // 3) Превью из источника.
        if (url != null) {
            val bytes = URL(url).openStream().use { it.readBytes() }
            val opts = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            BitmapFactory.decodeByteArray(bytes, 0, bytes.size, opts)
            var sample = 1
            while (opts.outWidth / (sample * 2) >= SIZE && opts.outHeight / (sample * 2) >= SIZE) sample *= 2
            val b = BitmapFactory.decodeByteArray(bytes, 0, bytes.size, BitmapFactory.Options().apply { inSampleSize = sample })
            return b?.also { save(it, disk) }
        }
        return null
    }

    private fun save(b: Bitmap, f: File) {
        runCatching { f.outputStream().use { b.compress(Bitmap.CompressFormat.JPEG, 85, it) } }
    }

    fun forget(id: String) {
        memory.remove(id)
        loading.removeAll { it.startsWith("$id:") }
        failed.removeAll { it.startsWith("$id:") }
        runCatching { File(File(App.instance.filesDir, "covers"), "$id.jpg").delete() }
    }
}
