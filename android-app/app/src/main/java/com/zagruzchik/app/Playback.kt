package com.zagruzchik.app

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.core.content.ContextCompat
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import com.google.common.util.concurrent.ListenableFuture

/** Подключение к проигрывателю и запуск треков/видео из списка загрузок. */
object Playback {
    private var future: ListenableFuture<MediaController>? = null

    /** Только для тестов экрана: там нет настоящего сервиса проигрывателя. */
    @androidx.annotation.VisibleForTesting
    internal var enabled = true

    fun controller(ctx: Context, onReady: (MediaController) -> Unit) {
        if (!enabled) return
        val app = ctx.applicationContext
        val f = future ?: MediaController.Builder(app, SessionToken(app, ComponentName(app, PlaybackService::class.java)))
            .buildAsync().also { future = it }
        f.addListener({
            val c = runCatching { f.get() }.getOrNull()
            if (c == null || !c.isConnected) {
                future = null
                return@addListener
            }
            onReady(c)
        }, ContextCompat.getMainExecutor(app))
    }

    /** Элемент очереди из скачанного файла. Название и исполнителя берём из имени «Исполнитель — Название.mp3». */
    fun item(f: SavedFile, album: String? = null): MediaItem {
        val name = f.name.substringBeforeLast('.').replace(Regex("""\s*\[[^\]]+]$"""), "")
        val parts = name.split(" — ", limit = 2)
        val meta = MediaMetadata.Builder()
            .setTitle(if (parts.size == 2) parts[1] else name)
            .setArtist(if (parts.size == 2) parts[0] else null)
            .setAlbumTitle(album)
            .build()
        return MediaItem.Builder().setUri(Uri.parse(f.uri)).setMediaId(f.uri)
            .setRequestMetadata(MediaItem.RequestMetadata.Builder().setMediaUri(Uri.parse(f.uri)).build())
            .setMediaMetadata(meta).build()
    }

    fun isVideo(f: SavedFile) = f.mime.startsWith("video")

    const val EXTRA_AUDIO_URL = "audioUrl"

    /**
     * Слушать/смотреть, пока идёт загрузка: играем прямо из интернета по ссылке, которую дал yt-dlp.
     * Для видео с двумя потоками (картинка + звук) вторую ссылку передаём проигрывателю — он склеит их сам.
     */
    fun playStream(ctx: Context, job: Job) {
        val urls = job.stream
        if (urls.isEmpty()) return
        val video = job.kind == Kind.VIDEO
        val main = urls.first()
        val extras = android.os.Bundle().apply { if (urls.size > 1) putString(EXTRA_AUDIO_URL, urls[1]) }
        val parts = job.title.split(" — ", limit = 2)
        val item = MediaItem.Builder()
            .setUri(main)
            .setMediaId(main)
            .setRequestMetadata(MediaItem.RequestMetadata.Builder().setMediaUri(Uri.parse(main)).setExtras(extras).build())
            .setMediaMetadata(
                MediaMetadata.Builder()
                    .setTitle(if (parts.size == 2) parts[1] else job.title)
                    .setArtist(if (parts.size == 2) parts[0] else job.site)
                    .build()
            )
            .build()
        controller(ctx) { c ->
            c.setMediaItem(item)
            c.prepare()
            c.play()
        }
        if (video) ctx.startActivity(Intent(ctx, PlayerActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    /** Играть очередь: [files] с позиции [start]. Видео сразу открывает экран проигрывателя. */
    fun play(ctx: Context, files: List<Pair<SavedFile, String?>>, start: Int) {
        if (files.isEmpty()) return
        controller(ctx) { c ->
            c.setMediaItems(files.map { (f, album) -> item(f, album) }, start.coerceIn(0, files.lastIndex), 0L)
            c.prepare()
            c.play()
        }
        if (isVideo(files[start.coerceIn(0, files.lastIndex)].first)) {
            ctx.startActivity(Intent(ctx, PlayerActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }
    }
}
