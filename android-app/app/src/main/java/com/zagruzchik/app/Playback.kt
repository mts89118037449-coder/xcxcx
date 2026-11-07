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
            .setExtras(android.os.Bundle().apply {
                putString(X_LOCAL_URI, f.uri); putString(X_LOCAL_MIME, f.mime); putString(X_LOCAL_NAME, f.name)
                putString(X_SOURCE, "Скачано")
            })
            .build()
        return MediaItem.Builder().setUri(Uri.parse(f.uri)).setMediaId(f.uri)
            .setRequestMetadata(MediaItem.RequestMetadata.Builder().setMediaUri(Uri.parse(f.uri)).build())
            .setMediaMetadata(meta).build()
    }

    fun isVideo(f: SavedFile) = f.mime.startsWith("video")

    const val EXTRA_AUDIO_URL = "audioUrl"

    // Что известно о текущей песне (в MediaMetadata.extras): откуда играет и что с ней можно сделать.
    const val X_SOURCE = "source"          // «SoundCloud», «Скачано»…
    const val X_SOURCE_URL = "sourceUrl"   // исходная ссылка сервиса (Spotify, Яндекс…)
    const val X_PAGE_URL = "pageUrl"       // страница потока — по ней «Скачать» качает именно то, что звучит
    const val X_LOCAL_URI = "localUri"     // скачанный файл — для «Отправить файл»
    const val X_LOCAL_MIME = "localMime"
    const val X_LOCAL_NAME = "localName"

    /** Состояние «готовлю поток» для экрана плеера: песня уже показана, звук ещё ищется. */
    object Pending {
        var track: Track? = null; private set
        var error: String? = null; private set
        var loading = false; private set
        private val listeners = mutableListOf<() -> Unit>()
        fun listen(l: () -> Unit) { listeners += l }
        fun unlisten(l: () -> Unit) { listeners -= l }
        internal fun set(t: Track?, loading: Boolean, error: String?) {
            this.track = t; this.loading = loading; this.error = error
            listeners.toList().forEach { it() }
        }
    }

    private val worker = java.util.concurrent.Executors.newSingleThreadExecutor()
    private val prefetcher = java.util.concurrent.Executors.newFixedThreadPool(2)
    /** Ссылка → какая это песня (чтобы не узнавать дважды). */
    private val linkTracks = java.util.concurrent.ConcurrentHashMap<String, java.util.concurrent.Future<Track>>()

    private fun trackOf(url: String, hint: String?): java.util.concurrent.Future<Track> =
        linkTracks.getOrPut(url) { prefetcher.submit<Track> { Music.resolve(url, hint).tracks.first() } }

    /**
     * Начать готовить песню по ссылке заранее — пока человек смотрит на панель «Поделиться».
     * К нажатию «Слушать» поток часто уже готов.
     */
    fun prefetchLink(url: String, hint: String?) {
        prefetcher.execute {
            val t = runCatching { trackOf(url, hint).get() }.getOrNull() ?: return@execute
            Streams.prefetch(t)
            LinkCache.prefetch(t, url)
        }
    }

    /** «Слушать» по ссылке на песню (Spotify, Яндекс, Apple…). У альбома — первый трек. */
    fun playLink(ctx: Context, url: String, hint: String?) {
        val guess = Music.hintTrack(hint) ?: Track("Узнаю песню…", Describe.of(url))
        Pending.set(guess, loading = true, error = null)
        ctx.startActivity(Intent(ctx, NowPlayingActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP))
        val app = ctx.applicationContext
        prefetcher.execute {
            try {
                val t = trackOf(url, hint).get()
                main.post { playTrack(app, t, url, openScreen = false) }
            } catch (e: Exception) {
                linkTracks.remove(url)
                val cause = (e as? java.util.concurrent.ExecutionException)?.cause ?: e
                main.post { Pending.set(guess, loading = false, error = (cause as? UserError)?.message ?: "Не удалось узнать песню") }
            }
        }
    }
    private val main = android.os.Handler(android.os.Looper.getMainLooper())

    /**
     * «Слушать» песню без скачивания: экран плеера открывается сразу (обложка, название),
     * поток ищется в фоне (SoundCloud → YouTube Music → YouTube), ссылки для «Поделиться» — параллельно.
     */
    fun playTrack(ctx: Context, t: Track, sourceUrl: String? = null, openScreen: Boolean = true) {
        val app = ctx.applicationContext
        Pending.set(t, loading = true, error = null)
        LinkCache.prefetch(t, sourceUrl)
        if (openScreen) ctx.startActivity(Intent(ctx, NowPlayingActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP))
        worker.execute {
            try {
                val s = Streams.resolve(t)
                val cover = t.cover ?: LinkCache.get(t)?.track?.cover ?: s.cover
                val item = MediaItem.Builder()
                    .setUri(s.url)
                    .setMediaId(s.url)
                    .setRequestMetadata(MediaItem.RequestMetadata.Builder().setMediaUri(Uri.parse(s.url)).build())
                    .setMediaMetadata(
                        MediaMetadata.Builder()
                            .setTitle(t.title)
                            .setArtist(t.artist.ifEmpty { null })
                            .setArtworkUri(cover?.let(Uri::parse))
                            .setExtras(android.os.Bundle().apply {
                                putString(X_SOURCE, s.source)
                                putString(X_SOURCE_URL, sourceUrl ?: t.url)
                                putString(X_PAGE_URL, s.pageUrl)
                            })
                            .build()
                    )
                    .build()
                main.post {
                    controller(app) { c ->
                        c.setMediaItem(item)
                        c.prepare()
                        c.play()
                        Pending.set(t, loading = false, error = null)
                    }
                }
            } catch (e: Exception) {
                val msg = (e as? UserError)?.message ?: "Не получилось включить: ${e.message}"
                main.post { Pending.set(t, loading = false, error = msg) }
            }
        }
    }

    /**
     * Слушать/смотреть, пока идёт загрузка: играем прямо из интернета по ссылке, которую дал yt-dlp.
     * Для видео с двумя потоками (картинка + звук) вторую ссылку передаём проигрывателю — он склеит их сам.
     */
    fun playStream(ctx: Context, job: Job) {
        val urls = job.stream
        if (urls.isEmpty()) return
        Pending.set(null, loading = false, error = null)
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
        Pending.set(null, loading = false, error = null)
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
