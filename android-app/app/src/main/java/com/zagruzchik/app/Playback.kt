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

    // Своя нить на каждое «Слушать»: новая песня не ждёт, пока доищется предыдущая.
    private val worker = java.util.concurrent.Executors.newCachedThreadPool()
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

    const val X_PREVIEW = "preview"

    /** Песня в очереди: из интернета или уже скачанная (тогда играет мгновенно и без сети). */
    class QItem(
        val track: Track, val local: SavedFile? = null, val sourceUrl: String? = null, val pageUrl: String? = null,
        /** Прямая ссылка на аудиофайл (Internet Archive, Audius) — играет сразу. */
        val directUrl: String? = null, val directSource: String? = null,
    )

    /** Поток для песни: с конкретной страницы (результат SoundCloud/YouTube) или поиском по названию. */
    private fun resolve(q: QItem): StreamInfo = q.directUrl?.let { StreamInfo(it, it, q.directSource ?: "интернета", q.track.cover, q.track.title) } ?: q.pageUrl?.let { page ->
        Downloader.streamOf(page, Describe.site(page), q.track.title) ?: throw UserError("Этот трек не играет: платный, удалён или недоступен в стране.")
    } ?: Streams.resolve(q.track)

    private val queueWorker = java.util.concurrent.Executors.newSingleThreadExecutor()
    private var queue: List<QItem> = emptyList()
    private var queueGen = 0
    private var nextToAdd = 0
    private var filling = false
    private var hooked: MediaController? = null

    /** «Слушать» одну песню. */
    fun playTrack(ctx: Context, t: Track, sourceUrl: String? = null, openScreen: Boolean = true) =
        playQueue(ctx, listOf(QItem(t, Library.localFor(t), sourceUrl)), 0, openScreen)

    /**
     * Играть очередь песен (библиотека, альбом). Первая включается сразу:
     * скачанная — с телефона; из интернета — официальный 30-секундный фрагмент мгновенно,
     * а через пару секунд его сменяет полная версия (SoundCloud → YouTube Music → YouTube).
     * Следующие песни готовятся заранее, пока играет текущая, — переход без пауз.
     */
    fun playQueue(ctx: Context, items: List<QItem>, start: Int, openScreen: Boolean = true) {
        if (items.isEmpty()) return
        val app = ctx.applicationContext
        val gen = ++queueGen
        queue = items
        nextToAdd = start + 1
        filling = false
        val first = items[start.coerceIn(0, items.lastIndex)]
        LinkCache.prefetch(first.track, first.sourceUrl)
        if (openScreen) ctx.startActivity(Intent(ctx, NowPlayingActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP))

        first.local?.let { f ->
            Pending.set(null, loading = false, error = null)
            start(app, gen, item(f).withTrack(first.track))
            return
        }
        val ready = when {
            first.directUrl != null -> resolve(first)
            first.pageUrl == null -> Streams.cachedFor(first.track)
            else -> null
        }
        if (ready != null) {
            Pending.set(null, loading = false, error = null)
            start(app, gen, streamItem(first, ready))
            return
        }
        // Мгновенно — официальный фрагмент, пока ищется полная версия.
        val preview = first.track.preview
        if (preview != null) {
            Pending.set(null, loading = false, error = null)
            waitingFull = first.track
            start(app, gen, previewItem(first, preview), fill = false)
        } else {
            Pending.set(first.track, loading = true, error = null)
        }
        // Пока играет фрагмент — разбираем его звук, чтобы потом найти это место в полной версии.
        val previewPcm = preview?.let { url -> alignPool.submit<ShortArray?> { runCatching { Align.pcm(app, url, 31) }.getOrNull() } }
        worker.execute {
            try {
                val stream = resolve(first)
                val full = streamItem(first, stream)
                val align = previewPcm?.let { f ->
                    runCatching {
                        val pv = f.get() ?: return@runCatching null
                        val d = first.track.durationSec
                        Align.findInStream(app, pv, stream.url, d)
                    }.getOrNull()
                }
                main.post {
                    if (gen != queueGen) return@post
                    waitingFull = null
                    Pending.set(null, loading = false, error = null)
                    if (preview != null) continueFromPreview(app, gen, full, preview, align) else start(app, gen, full)
                }
            } catch (e: Exception) {
                val msg = (e as? UserError)?.message ?: "Не получилось включить: ${e.message}"
                main.post {
                    if (gen != queueGen) return@post
                    waitingFull = null
                    if (preview != null) {
                        // Фрагмент уже играет — не прерываем, просто сообщаем; дальше по очереди.
                        Pending.set(null, loading = false, error = null)
                        fill(app, gen)
                    } else {
                        Pending.set(first.track, loading = false, error = msg)
                    }
                }
            }
        }
    }

    private val alignPool = java.util.concurrent.Executors.newSingleThreadExecutor()

    /**
     * Фрагмент → полная версия без «с начала»: включаем полную с того места песни,
     * где сейчас фрагмент (или где он закончился). Если место не удалось уверенно найти — с начала.
     */
    private fun continueFromPreview(app: Context, gen: Int, full: MediaItem, previewUrl: String, align: Align.Result?) {
        controller(app) { c ->
            if (gen != queueGen) return@controller
            val onPreview = c.currentMediaItem?.mediaId == previewUrl
            val previewPos = when {
                !onPreview -> 0L
                c.playbackState == androidx.media3.common.Player.STATE_ENDED -> c.duration.coerceAtLeast(0)
                else -> c.currentPosition
            }
            val target = if (onPreview && align != null) align.fullPositionMs(previewPos) else 0L
            c.setMediaItem(full, target)
            c.prepare()
            c.play()
            hook(app, c)
            fill(app, gen)
        }
    }

    private fun start(app: Context, gen: Int, item: MediaItem, fill: Boolean = true) {
        controller(app) { c ->
            if (gen != queueGen) return@controller
            c.setMediaItem(item)
            c.prepare()
            c.play()
            hook(app, c)
            if (fill) fill(app, gen)
        }
    }

    /** Следим за переходами: как только до конца очереди в проигрывателе меньше двух песен — готовим следующую. */
    private fun hook(app: Context, c: MediaController) {
        if (hooked === c) return
        hooked = c
        c.addListener(object : androidx.media3.common.Player.Listener {
            override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) = fill(app, queueGen)
            // Фрагмент закончился, а полная версия ещё не готова — не тишина, а «подхватываю».
            override fun onPlaybackStateChanged(state: Int) {
                if (state == androidx.media3.common.Player.STATE_ENDED &&
                    c.currentMediaItem?.mediaMetadata?.extras?.getBoolean(X_PREVIEW) == true && waitingFull != null
                ) Pending.set(waitingFull, loading = true, error = null)
            }
        })
    }

    /** Песня, для которой играет фрагмент и ещё ищется полная версия. */
    @Volatile private var waitingFull: Track? = null

    private fun fill(app: Context, gen: Int) {
        if (filling || gen != queueGen || nextToAdd >= queue.size) return
        val c = hooked ?: return
        if (c.mediaItemCount - 1 - c.currentMediaItemIndex >= 2) return
        val q = queue[nextToAdd]
        filling = true
        queueWorker.execute {
            val item = q.local?.let { item(it).withTrack(q.track) }
                ?: runCatching { streamItem(q, resolve(q)) }.getOrNull() // не нашлась — пропускаем
            main.post {
                if (gen != queueGen) return@post
                filling = false
                nextToAdd++
                if (item != null) c.addMediaItem(item)
                fill(app, gen)
            }
        }
    }

    private fun MediaItem.withTrack(t: Track): MediaItem = buildUpon().setMediaMetadata(
        mediaMetadata.buildUpon().setTitle(t.title).setArtist(t.artist.ifEmpty { null }).build()
    ).build()

    private fun meta(q: QItem, source: String, extra: android.os.Bundle.() -> Unit = {}): MediaMetadata {
        val cover = q.track.cover ?: LinkCache.get(q.track)?.track?.cover
        return MediaMetadata.Builder()
            .setTitle(q.track.title)
            .setArtist(q.track.artist.ifEmpty { null })
            .setArtworkUri(cover?.let(Uri::parse))
            .setExtras(android.os.Bundle().apply {
                putString(X_SOURCE, source)
                putString(X_SOURCE_URL, q.sourceUrl ?: q.track.url)
                extra()
            })
            .build()
    }

    private fun streamItem(q: QItem, s: StreamInfo): MediaItem = MediaItem.Builder()
        .setUri(s.url).setMediaId(s.url)
        .setRequestMetadata(MediaItem.RequestMetadata.Builder().setMediaUri(Uri.parse(s.url)).build())
        .setMediaMetadata(meta(q, s.source) { putString(X_PAGE_URL, s.pageUrl) })
        .build()

    private fun previewItem(q: QItem, url: String): MediaItem = MediaItem.Builder()
        .setUri(url).setMediaId(url)
        .setRequestMetadata(MediaItem.RequestMetadata.Builder().setMediaUri(Uri.parse(url)).build())
        .setMediaMetadata(meta(q, "фрагмента") { putBoolean(X_PREVIEW, true) })
        .build()

    /**
     * Слушать/смотреть, пока идёт загрузка: играем прямо из интернета по ссылке, которую дал yt-dlp.
     * Для видео с двумя потоками (картинка + звук) вторую ссылку передаём проигрывателю — он склеит их сам.
     */
    fun playStream(ctx: Context, job: Job) {
        val urls = job.stream
        if (urls.isEmpty()) return
        queueGen++
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
        queueGen++
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
