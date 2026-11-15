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
            hook(app, c)
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
    const val X_HEAD = "head"              // играет с сохранённого начала (мгновенный старт)

    /** Песня в очереди: из интернета или уже скачанная (тогда играет мгновенно и без сети). */
    class QItem(
        val track: Track, val local: SavedFile? = null, val sourceUrl: String? = null, val pageUrl: String? = null,
        /** Прямая ссылка на аудиофайл (Internet Archive, Audius) — играет сразу. */
        val directUrl: String? = null, val directSource: String? = null,
    )

    /** Поток для песни: с конкретной страницы (результат SoundCloud/YouTube) или поиском по названию. */
    private fun resolve(q: QItem): StreamInfo = q.directUrl?.let { StreamInfo(it, it, q.directSource ?: "интернета", q.track.cover, q.track.title) } ?: q.pageUrl?.let { page ->
        Streams.page(page, Describe.site(page), q.track.title) ?: throw UserError("Этот трек не играет: платный, удалён или недоступен в стране.")
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
    fun playQueue(ctx: Context, items: List<QItem>, start: Int, openScreen: Boolean = true) = playQueue(ctx, items, start, openScreen, auto = false)

    private var startIndex = 0
    private var skips = 0 // сколько песен подряд пропустили сами (не нашлись) — чтобы не листать очередь бесконечно

    /** «Ещё раз»: искать ту же песню заново, не теряя очередь. */
    fun retry(ctx: Context) {
        val q = queue.getOrNull(startIndex) ?: return
        Streams.forgetFailure(q.track)
        playQueue(ctx, queue, startIndex, openScreen = false)
    }

    private fun playQueue(ctx: Context, items: List<QItem>, start: Int, openScreen: Boolean, auto: Boolean) {
        if (items.isEmpty()) return
        val app = ctx.applicationContext
        val gen = ++queueGen
        if (!auto) skips = 0
        tapAt = System.currentTimeMillis(); startInfo = null
        AppLog.add("НАЖАТИЕ «${items.getOrNull(start)?.track?.label}» (очередь ${items.size})")
        queue = items
        startIndex = start.coerceIn(0, items.lastIndex)
        nextToAdd = start + 1
        filling = false
        val first = items[start.coerceIn(0, items.lastIndex)]
        LinkCache.prefetch(first.track, first.sourceUrl)
        prefetchAhead(nextToAdd)
        if (openScreen) ctx.startActivity(Intent(ctx, NowPlayingActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP))

        first.local?.let { f ->
            Pending.set(null, loading = false, error = null)
            startPath = "файл на телефоне"; start(app, gen, item(f).withTrack(first.track))
            return
        }
        // Уже звучала — играем из памяти: мгновенно и без интернета.
        MediaCache.fileFor(first.track)?.let { f ->
            Pending.set(null, loading = false, error = null)
            startPath = "из памяти"; start(app, gen, cachedItem(first, f))
            return
        }
        // Начало полной версии уже на телефоне — играем сразу, остальное подтянется из сети.
        if (first.pageUrl == null && first.directUrl == null) HeadCache.entry(first.track)?.let { e ->
            Pending.set(null, loading = false, error = null)
            startPath = "начало на телефоне"; start(app, gen, headItem(first, e))
            return
        }
        val ready = when {
            first.directUrl != null -> resolve(first)
            first.pageUrl == null -> Streams.cachedFor(first.track)
            else -> Streams.pageIfReady(first.pageUrl)
        }
        if (ready != null) {
            Pending.set(null, loading = false, error = null)
            startPath = if (tapAt > 0 && System.currentTimeMillis() - tapAt < 150) "ссылка была готова" else "нашёл по нажатию"; start(app, gen, streamItem(first, ready))
            return
        }
        // Без пауз: полная версия готова (выше) — играет с начала; нет — сразу фрагмент, а полная
        // бесшовно подхватывает его с того же места. Ждать полную в тишине больше не будем.
        val fullSoon = worker.submit<StreamInfo> { resolve(first) }
        val preview = first.track.preview
        // Конкретная страница/файл (результат «Везде в интернете») — фрагмента у неё нет, просто ждём.
        val canPreview = first.pageUrl == null && first.directUrl == null
        // «Сразу полная»: источник известен или найдётся за пару секунд — ждём её и начинаем с начала, без фрагмента.
        // Фрагмент — только если поиск затянулся.
        if (canPreview && Settings.startMode(app) == Settings.StartMode.FULL) {
            Pending.set(first.track, loading = true, error = null)
            worker.execute {
                // Фрагмент не включаем вообще: ждём полную, пока идёт поиск.
                val s = runCatching { fullSoon.get() }.getOrNull()
                main.post {
                    if (gen != queueGen) return@post
                    if (s != null) {
                        Pending.set(null, loading = false, error = null)
                        startPath = "нашёл по нажатию"; start(app, gen, streamItem(first, s))
                        worker.execute { MediaCache.store(app, first.track, s.pageUrl) }
                    } else {
                        // Не нашлась нигде — сообщение и переход к следующей (без фрагмента).
                        val q = QItem(first.track.copy(preview = null), first.local, first.sourceUrl, first.pageUrl, first.directUrl, first.directSource)
                        previewThenFull(app, gen, q, fullSoon)
                    }
                }
            }
            return
        }
        viaPreview(app, gen, first, fullSoon)
    }

    /** Полной версии под рукой нет: фрагмент сразу, полная подхватывает. */
    private fun viaPreview(app: Context, gen: Int, first: QItem, fullSoon: java.util.concurrent.Future<StreamInfo>) {
        val preview = first.track.preview
        val canPreview = first.pageUrl == null && first.directUrl == null
        if (!canPreview || (preview != null && Previews.fresh(preview))) return previewThenFull(app, gen, first, fullSoon)
        // Фрагмента нет или ссылка устарела (Deezer даёт её на ~15 минут) — берём свежую, это доли секунды.
        Pending.set(first.track, loading = true, error = null)
        worker.execute {
            val fresh = runCatching { Previews.refresh(first.track) }.getOrNull()
            val ready = if (fullSoon.isDone) runCatching { fullSoon.get() }.getOrNull() else null
            main.post {
                if (gen != queueGen) return@post
                if (ready != null) {
                    Pending.set(null, loading = false, error = null)
                    startPath = if (tapAt > 0 && System.currentTimeMillis() - tapAt < 150) "ссылка была готова" else "нашёл по нажатию"; start(app, gen, streamItem(first, ready))
                    worker.execute { MediaCache.store(app, first.track, ready.pageUrl) }
                } else {
                    val q = QItem(first.track.copy(preview = fresh), first.local, first.sourceUrl, first.pageUrl, first.directUrl, first.directSource)
                    previewThenFull(app, gen, q, fullSoon)
                }
            }
        }
    }

    /** Полная версия ещё ищется: играем официальный фрагмент, потом подхватываем полную с того же места. */
    private fun previewThenFull(app: Context, gen: Int, first: QItem, fullSoon: java.util.concurrent.Future<StreamInfo>) {
        // Мгновенно — официальный фрагмент, пока ищется полная версия.
        val preview = first.track.preview
        if (preview != null) {
            Pending.set(null, loading = false, error = null)
            waitingFull = first.track
            startPath = "фрагмент"; start(app, gen, previewItem(first, preview), fill = false)
        } else {
            Pending.set(first.track, loading = true, error = null)
        }
        // Место стыка нужно найти, пока фрагмент ещё играет (с запасом на подгрузку полной).
        // Не успели — полная встанет сразу за фрагментом с начала песни: без паузы, а не через минуты.
        val alignDeadline = System.currentTimeMillis() + PREVIEW_END_MS - 2500
        // Пока играет фрагмент — разбираем его звук, чтобы потом найти это место в полной версии.
        val previewPcm = preview?.let { url -> alignPool.submit<ShortArray?> { runCatching { Align.pcm(app, url, 31) }.getOrNull() } }
        worker.execute {
            try {
                val stream = try { fullSoon.get() } catch (e: java.util.concurrent.ExecutionException) { throw e.cause ?: e }
                val full = streamItem(first, stream)
                val align = previewPcm?.let { f ->
                    runCatching {
                        val pv = f.get(maxOf(1, alignDeadline - System.currentTimeMillis()), java.util.concurrent.TimeUnit.MILLISECONDS) ?: return@runCatching null
                        val d = first.track.durationSec
                        Align.findInStream(app, pv, stream.url, d, joinSec = PREVIEW_END_MS / 1000.0, deadline = alignDeadline)
                    }.getOrNull()
                }
                main.post {
                    if (gen != queueGen) return@post
                    waitingFull = null
                    Pending.set(null, loading = false, error = null)
                    if (preview != null) continueFromPreview(app, gen, full, preview, align) else start(app, gen, full)
                }
                // В память — уже после стыка, чтобы скачивание не мешало искать место.
                MediaCache.store(app, first.track, stream.pageUrl) // в следующий раз — мгновенно
            } catch (e: Exception) {
                val msg = (e as? UserError)?.message ?: "Не получилось включить: ${e.message}"
                main.post {
                    if (gen != queueGen) return@post
                    waitingFull = null
                    if (preview != null) {
                        // Фрагмент уже играет — не прерываем, но честно говорим, что полной версии не будет.
                        Pending.set(first.track, loading = false, error = "Бесплатной полной версии нет — только фрагмент, дальше включу следующую.\n$msg")
                        fill(app, gen)
                    } else if (nextToAdd < queue.size && skips < 5) {
                        // Ничего не играет и не заиграет — не стоим на месте, включаем следующую из очереди.
                        AppLog.add("НЕ НАШЛАСЬ «${first.track.label}» — включаю следующую из очереди: «${queue.getOrNull(nextToAdd)?.track?.label}»")
                        Pending.set(first.track, loading = false, error = "Включаю следующую — эту бесплатно не нашёл.\n$msg")
                        main.postDelayed({
                            if (gen != queueGen) return@postDelayed
                            skips++
                            playQueue(app, queue, nextToAdd, openScreen = false, auto = true)
                        }, 2500)
                    } else {
                        Pending.set(first.track, loading = false, error = msg)
                    }
                }
            }
        }
    }

    /**
     * Полная версия уже стоит в очереди сразу за фрагментом: через сколько секунд начнётся (для подписи
     * «найдена · продолжит через N с»). null — ещё ищется.
     */
    fun joinIn(c: MediaController): Int? {
        val i = c.currentMediaItemIndex
        if (i + 1 >= c.mediaItemCount) return null
        if (c.getMediaItemAt(i + 1).mediaMetadata.extras?.containsKey(X_PREVIEW) == true) return null
        if (c.currentMediaItem?.mediaMetadata?.extras?.getBoolean(X_PREVIEW) != true) return null
        return ((PREVIEW_END_MS - c.currentPosition) / 1000).toInt().coerceAtLeast(0)
    }

    /** Где обрываем фрагмент и где к нему бесшовно пристыковывается полная версия. */
    private const val PREVIEW_END_MS = 28_500L

    /** Полная версия, начатая не с начала (после фрагмента): на сколько мс она сдвинута. */
    const val X_OFFSET = "offset"

    fun offset(c: MediaController): Long = c.currentMediaItem?.mediaMetadata?.extras?.getLong(X_OFFSET) ?: 0L

    /** Позиция и длительность с учётом сдвига — для полосы перемотки и текста песни. */
    fun position(c: MediaController) = c.currentPosition + offset(c)
    fun duration(c: MediaController) = c.duration.takeIf { it > 0 }?.plus(offset(c)) ?: c.duration

    /**
     * Перемотка в песне. Назад, раньше места стыковки с фрагментом, — та же песня целиком
     * (без обрезки), с нужного места.
     */
    fun seek(c: MediaController, ms: Long) {
        val off = offset(c)
        if (ms >= off) return c.seekTo(ms - off)
        val i = c.currentMediaItemIndex
        val item = c.currentMediaItem ?: return
        val extras = android.os.Bundle(item.mediaMetadata.extras ?: android.os.Bundle()).apply { remove(X_OFFSET) }
        c.replaceMediaItem(i, item.buildUpon()
            .setClippingConfiguration(MediaItem.ClippingConfiguration.UNSET)
            .setMediaMetadata(item.mediaMetadata.buildUpon().setExtras(extras).build())
            .build())
        c.seekTo(i, ms)
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
            // Бесшовно: полная версия встаёт в очередь сразу за фрагментом, обрезанная так, что начинается
            // ровно с того места песни, где фрагмент закончится. Проигрыватель заранее её подгружает и
            // переходит без паузы, перемотки и затухания — на слух звук просто становится полным.
            // Место не нашлось — полная идёт с начала, но тоже без паузы: сразу после фрагмента, подгруженная заранее.
            val previewAlive = onPreview && c.playerError == null &&
                c.playbackState != androidx.media3.common.Player.STATE_ENDED && c.playbackState != androidx.media3.common.Player.STATE_IDLE
            // Настройка «Сразу»: не ждём конца фрагмента — переключаемся на полную с того же места.
            if (previewAlive && align != null && Settings.joinMode(app) == Settings.JoinMode.IMMEDIATE) {
                c.setMediaItem(full, align.fullPositionMs(c.currentPosition + 300))
                c.prepare(); c.play()
                hook(app, c); fill(app, gen)
                return@controller
            }
            if (previewAlive) {
                val start = align?.fullPositionMs(PREVIEW_END_MS) ?: 0L
                val extras = android.os.Bundle(full.mediaMetadata.extras ?: android.os.Bundle()).apply { if (start > 0) putLong(X_OFFSET, start) }
                val joined = full.buildUpon()
                    .apply { if (start > 0) setClippingConfiguration(MediaItem.ClippingConfiguration.Builder().setStartPositionMs(start).build()) }
                    .setMediaMetadata(full.mediaMetadata.buildUpon().setExtras(extras).build())
                    .build()
                c.addMediaItem(c.currentMediaItemIndex + 1, joined)
                hook(app, c)
                fill(app, gen)
                return@controller
            }
            val previewPos = when {
                !onPreview -> 0L
                c.playbackState == androidx.media3.common.Player.STATE_ENDED -> c.duration.coerceAtLeast(0)
                else -> c.currentPosition
            }
            // Фрагмент так и не заиграл (ошибка) — полную с начала, а не с середины.
            val target = if (onPreview && align != null && c.playerError == null) align.fullPositionMs(previewPos) else 0L
            c.setMediaItem(full, target)
            c.prepare()
            c.play()
            hook(app, c)
            fill(app, gen)
        }
    }

    // Замер «от нажатия до звука» — показываем в плеере, чтобы было видно, что и где тормозит.
    private var tapAt = 0L
    private var startPath = ""
    @Volatile var startInfo: String? = null; private set

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
            override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
                // В журнал: какая песня пошла и почему (сама доиграла прошлая, человек переключил, поменялась очередь).
                AppLog.add("СМЕНА ПЕСНИ → «${mediaItem?.mediaMetadata?.artist} — ${mediaItem?.mediaMetadata?.title}» из ${mediaItem?.mediaMetadata?.extras?.getString(X_SOURCE)} · причина: " + when (reason) {
                    androidx.media3.common.Player.MEDIA_ITEM_TRANSITION_REASON_AUTO -> "прошлая доиграла"
                    androidx.media3.common.Player.MEDIA_ITEM_TRANSITION_REASON_SEEK -> "переключили (кнопка/наушники/приложение)"
                    androidx.media3.common.Player.MEDIA_ITEM_TRANSITION_REASON_PLAYLIST_CHANGED -> "заменена очередь"
                    androidx.media3.common.Player.MEDIA_ITEM_TRANSITION_REASON_REPEAT -> "повтор"
                    else -> "$reason"
                } + " · в очереди проигрывателя ${c.mediaItemCount}, позиция ${c.currentMediaItemIndex}")
                // Заиграла другая песня — старая ошибка/«готовлю» больше не про неё: экран плеера
                // показывает то, что звучит (раньше оставались старые обложка и название).
                val p = Pending.track
                val nowTitle = mediaItem?.mediaMetadata?.title?.toString()
                if (p != null && nowTitle != null && (Pending.error != null || nowTitle != p.title) &&
                    mediaItem.mediaMetadata.extras?.getBoolean(X_PREVIEW) != true
                ) Pending.set(null, loading = false, error = null)
                // Фрагмент перешёл в полную версию — убираем его из очереди («назад» не вернёт к нему).
                val i = c.currentMediaItemIndex
                if (i > 0 && c.getMediaItemAt(i - 1).mediaMetadata.extras?.getBoolean(X_PREVIEW) == true) main.post {
                    val j = c.currentMediaItemIndex
                    if (j > 0 && c.getMediaItemAt(j - 1).mediaMetadata.extras?.getBoolean(X_PREVIEW) == true) c.removeMediaItem(j - 1)
                }
                learn(reason == androidx.media3.common.Player.MEDIA_ITEM_TRANSITION_REASON_SEEK)
                nowPlayingKey = mediaItem?.mediaMetadata?.title?.toString()?.let { Library.key(Track(it, mediaItem.mediaMetadata.artist?.toString().orEmpty())) }
                current = mediaItem?.takeIf { it.mediaMetadata.extras?.getBoolean(X_PREVIEW) != true }
                    ?.mediaMetadata?.let { m -> m.title?.toString()?.let { Track(it, m.artist?.toString().orEmpty()) } }
                currentSince = System.currentTimeMillis()
                mediaItem?.let { remember(it) }
                fill(app, queueGen)
            }
            // Фрагмент не открылся — показываем «готовлю», полная версия включится сама, как только найдётся.
            override fun onPlayerError(error: androidx.media3.common.PlaybackException) {
                // Файл из памяти не играет — выбрасываем его и включаем ту же песню из сети.
                val m = c.currentMediaItem?.mediaMetadata
                val fromHead = m?.extras?.getBoolean(X_HEAD) == true
                // То же, если не удалось продолжить песню после сохранённого начала (источник изменился) — играем обычным путём.
                if (m?.extras?.getString(X_SOURCE) == "памяти" || fromHead) {
                    val t = Track(m!!.title?.toString().orEmpty(), m.artist?.toString().orEmpty(), cover = m.artworkUri?.toString())
                    if (fromHead) HeadCache.drop(t) else MediaCache.forget(t)
                    val i = c.currentMediaItemIndex
                    val rest = queue.drop(maxOf(0, nextToAdd - (c.mediaItemCount - i)))
                    val here = rest.firstOrNull { Library.key(it.track) == Library.key(t) } ?: QItem(t, null, m.extras?.getString(X_SOURCE_URL))
                    main.post { playQueue(app, listOf(here) + rest.filter { it !== here }, 0, openScreen = false) }
                    return
                }
                if (c.currentMediaItem?.mediaMetadata?.extras?.getBoolean(X_PREVIEW) == true && waitingFull != null) {
                    Pending.set(waitingFull, loading = true, error = null)
                    return
                }
                // Любая другая ошибка проигрывателя: раньше она терялась — песня «включалась» и молчала. Теперь видно на экране и в журнале.
                AppLog.error("проигрыватель: «${m?.title}» из ${m?.extras?.getString(X_SOURCE)} (${error.errorCodeName})", error)
                val t = Track(m?.title?.toString().orEmpty(), m?.artist?.toString().orEmpty(), cover = m?.artworkUri?.toString())
                Streams.forget(t) // ссылка не играет — в следующий раз ищем заново, а не берём её же
                Pending.set(t, loading = false, error = "Звук не пошёл: ${error.errorCodeName}. ${error.cause?.message.orEmpty().take(120)}\nНажмите «Ещё раз» — найду заново.")
            }

            // Фрагмент закончился, а полная версия ещё не готова — не тишина, а «подхватываю».
            override fun onIsPlayingChanged(isPlaying: Boolean) {
                if (isPlaying && tapAt > 0) {
                    startInfo = "$startPath · ${(System.currentTimeMillis() - tapAt) / 100 / 10.0} с"
                    AppLog.add("ЗВУК ПОШЁЛ «${c.mediaMetadata.title}» из ${c.mediaMetadata.extras?.getString(X_SOURCE)}: $startInfo")
                    tapAt = 0
                }
            }

            // Остановки посреди песни: кто поставил на паузу и почему.
            override fun onPlayWhenReadyChanged(playWhenReady: Boolean, reason: Int) {
                AppLog.add((if (playWhenReady) "ИГРАТЬ" else "ПАУЗА") + " на ${c.currentPosition / 1000} с «${c.mediaMetadata.title}» · причина: " + when (reason) {
                    androidx.media3.common.Player.PLAY_WHEN_READY_CHANGE_REASON_USER_REQUEST -> "кнопка (экран, уведомление, наушники)"
                    androidx.media3.common.Player.PLAY_WHEN_READY_CHANGE_REASON_AUDIO_FOCUS_LOSS -> "звук забрало другое приложение / звонок / уведомление"
                    androidx.media3.common.Player.PLAY_WHEN_READY_CHANGE_REASON_AUDIO_BECOMING_NOISY -> "отключились наушники"
                    androidx.media3.common.Player.PLAY_WHEN_READY_CHANGE_REASON_REMOTE -> "удалённое управление"
                    androidx.media3.common.Player.PLAY_WHEN_READY_CHANGE_REASON_END_OF_MEDIA_ITEM -> "конец записи"
                    else -> "$reason"
                })
            }

            override fun onPlaybackSuppressionReasonChanged(playbackSuppressionReason: Int) {
                if (playbackSuppressionReason != androidx.media3.common.Player.PLAYBACK_SUPPRESSION_REASON_NONE)
                    AppLog.add("ЗВУК ПРИГЛУШЁН системой на ${c.currentPosition / 1000} с · причина $playbackSuppressionReason (1 — временно потерян звук, например уведомление)")
            }

            private var bufferingAt = 0L
            override fun onPlaybackStateChanged(state: Int) {
                // Подгрузка посреди песни (сеть не успевает) — с какой секунды и сколько длилась.
                if (state == androidx.media3.common.Player.STATE_BUFFERING) {
                    bufferingAt = System.currentTimeMillis()
                    if (c.currentPosition > 1500) AppLog.add("ПОДГРУЗКА началась на ${c.currentPosition / 1000} с «${c.mediaMetadata.title}» из ${c.mediaMetadata.extras?.getString(X_SOURCE)} (в запасе ${(c.bufferedPosition - c.currentPosition) / 1000} с)")
                } else if (state == androidx.media3.common.Player.STATE_READY && bufferingAt > 0) {
                    val ms = System.currentTimeMillis() - bufferingAt; bufferingAt = 0
                    if (ms > 700 && c.currentPosition > 1500) AppLog.add("ПОДГРУЗКА закончилась: ждали ${ms / 100 / 10.0} с")
                } else if (state == androidx.media3.common.Player.STATE_ENDED) AppLog.add("ОЧЕРЕДЬ ПРОИГРЫВАТЕЛЯ КОНЧИЛАСЬ (следующая не была готова)")
                if (state == androidx.media3.common.Player.STATE_ENDED) { learn(skipped = false); current = null }
                if (state == androidx.media3.common.Player.STATE_ENDED &&
                    c.currentMediaItem?.mediaMetadata?.extras?.getBoolean(X_PREVIEW) == true && waitingFull != null
                ) Pending.set(waitingFull, loading = true, error = null)
            }
        })
    }

    /** Что играет сейчас (ключ песни) — в списках у неё пляшут столбики. */
    @Volatile var nowPlayingKey: String? = null

    // Что играет и с какого момента — чтобы понять, дослушали песню или пролистнули.
    private var current: Track? = null
    private var currentSince = 0L

    /** Предпочтения: дослушано (больше 30 с) — нравится, переключено раньше — нет. */
    private fun learn(skipped: Boolean) {
        val t = current?.takeIf { it.title.isNotBlank() && !it.artist.equals("Скачано") } ?: return
        val listened = System.currentTimeMillis() - currentSince
        when {
            skipped && listened < 30_000 -> Taste.skipped(t)
            listened >= 30_000 -> Taste.played(t)
        }
        current = null
    }

    /** Записать в историю то, что начало играть (фрагменты — нет). */
    private fun remember(item: MediaItem) {
        val m = item.mediaMetadata
        val x = m.extras
        if (x?.getBoolean(X_PREVIEW) == true) return
        val title = m.title?.toString() ?: return
        val mime = x?.getString(X_LOCAL_MIME)
        val local = x?.getString(X_LOCAL_URI)?.takeIf { !it.startsWith("file:") }?.let { SavedFile(it, x.getString(X_LOCAL_NAME) ?: title, mime ?: "audio/mpeg") }
        val video = mime?.startsWith("video") == true || x?.getBoolean(X_VIDEO) == true
        History.add(History.Entry(
            Track(title, m.artist?.toString().orEmpty(), cover = m.artworkUri?.toString()),
            if (video) Kind.VIDEO else Kind.MUSIC,
            x?.getString(X_PAGE_URL), x?.getString(X_SOURCE_URL), local, System.currentTimeMillis(),
        ))
    }

    const val X_VIDEO = "video"

    /** Песня, для которой играет фрагмент и ещё ищется полная версия. */
    @Volatile private var waitingFull: Track? = null

    /** Есть ли следующая песня: уже в проигрывателе или ещё в текущем списке. */
    fun hasNext(c: MediaController) = c.hasNextMediaItem() || nextToAdd < queue.size

    /**
     * Следующая песня из текущего списка. Если она ещё не подготовлена в проигрывателе —
     * не ждём, а сразу включаем её (из списка, с начала).
     */
    fun next(ctx: Context) {
        val app = ctx.applicationContext
        controller(app) { c ->
            when {
                c.hasNextMediaItem() -> c.seekToNextMediaItem()
                nextToAdd < queue.size -> playQueue(app, queue, nextToAdd, openScreen = false)
            }
        }
    }

    /** Предыдущая: в начале песни — прошлая, дальше 3 секунд — с начала этой. */
    fun previous(ctx: Context) = controller(ctx.applicationContext) { it.seekToPrevious() }

    /** Следующие 8 песен очереди готовим заранее — переходы без ожидания. */
    private const val AHEAD = 2 // больше — и подготовка душит сеть и ту песню, которую нажали

    private fun prefetchAhead(from: Int) {
        val next = queue.drop(from).take(AHEAD).filter { it.local == null && it.directUrl == null && !MediaCache.has(it.track) }
        Streams.prefetchAhead(next.filter { it.pageUrl == null }.map { it.track })
        next.mapNotNull { q -> q.pageUrl?.let { Triple(it, Describe.site(it), q.track.title) } }
            .forEach { (u, site, title) -> Ytdlp.inBackground { Streams.prefetchPage(u, site, title) } }
    }

    /** Другая очередь (файлы, видео): старая больше не продолжается и не включает радио. */
    private fun resetQueue() {
        queueGen++
        queue = emptyList()
        nextToAdd = 0
        filling = false
    }

    private var radioGen = -1 // для какой очереди уже искали радио (чтобы не искать по кругу)

    private fun fill(app: Context, gen: Int) {
        if (filling || gen != queueGen) return
        val c = hooked ?: return
        if (c.mediaItemCount - 1 - c.currentMediaItemIndex >= 2) return
        if (nextToAdd >= queue.size) return radio(app, gen)
        val q = queue[nextToAdd]
        filling = true
        queueWorker.execute {
            val item = q.local?.let { item(it).withTrack(q.track) }
                ?: MediaCache.fileFor(q.track)?.let { cachedItem(q, it) }
                ?: (if (q.pageUrl == null && q.directUrl == null) HeadCache.entry(q.track)?.let { headItem(q, it) } else null)
                ?: runCatching { Ytdlp.inBackground { resolve(q) }.also { MediaCache.store(app, q.track, it.pageUrl) }.let { streamItem(q, it) } }.getOrNull() // не нашлась — пропускаем
            main.post {
                if (gen != queueGen) return@post
                filling = false
                nextToAdd++
                prefetchAhead(nextToAdd) // окно подготовки сдвигается вместе с очередью
                if (item != null) {
                    // Проигрыватель уже доиграл (фрагмент кончился, а полной версии нет) — сам он не продолжит: включаем добавленную.
                    val stalled = c.playbackState == androidx.media3.common.Player.STATE_ENDED || c.playbackState == androidx.media3.common.Player.STATE_IDLE
                    c.addMediaItem(item)
                    if (stalled) { c.seekToDefaultPosition(c.mediaItemCount - 1); c.prepare(); c.play() }
                }
                fill(app, gen)
            }
        }
    }

    /**
     * Очередь заканчивается — продолжаем похожей музыкой (радио исполнителя последней песни),
     * как в стриминговых сервисах. Выключается в настройках.
     */
    private fun radio(app: Context, gen: Int) {
        if (queue.isEmpty() || radioGen == gen || !Settings.radio(app)) return
        val seed = queue.last().track.takeIf { it.artist.isNotBlank() } ?: return
        radioGen = gen
        filling = true
        val played = queue.map { it.track }
        queueWorker.execute {
            val more = runCatching { Catalog.radio(seed, played) }.getOrDefault(emptyList())
            main.post {
                if (gen != queueGen) return@post
                filling = false
                if (more.isEmpty()) return@post
                queue = queue + more.map { QItem(it, Library.localFor(it), it.url) }
                radioGen = -1 // и дальше — когда закончится и это
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
            // Подпись отличается у фрагмента и полной версии — так проигрыватель замечает смену и обновляет экран.
            .setSubtitle(if (source == "фрагмента") "Фрагмент" else source)
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

    /** Мгновенный старт: начало с телефона, продолжение той же записи — из сети. */
    private fun headItem(q: QItem, e: HeadCache.Entry): MediaItem = MediaItem.Builder()
        .setUri(e.uri).setMediaId(e.uri.toString())
        .setRequestMetadata(MediaItem.RequestMetadata.Builder().setMediaUri(e.uri).build())
        .setMediaMetadata(meta(q, e.label.ifBlank { "интернета" }) { putBoolean(X_HEAD, true); if (e.where.startsWith("http")) putString(X_PAGE_URL, e.where) })
        .build()

    private fun cachedItem(q: QItem, f: java.io.File): MediaItem {
        val uri = Uri.fromFile(f)
        return MediaItem.Builder().setUri(uri).setMediaId(uri.toString())
            .setRequestMetadata(MediaItem.RequestMetadata.Builder().setMediaUri(uri).build())
            .setMediaMetadata(meta(q, "памяти") { putString(X_LOCAL_URI, uri.toString()); putString(X_LOCAL_MIME, "audio/" + f.extension) })
            .build()
    }

    private fun previewItem(q: QItem, url: String): MediaItem = MediaItem.Builder()
        .setUri(url).setMediaId(url)
        // Фрагмент заканчиваем чуть раньше его конца — там бывает затухание; дальше бесшовно идёт полная версия.
        .setClippingConfiguration(MediaItem.ClippingConfiguration.Builder().setEndPositionMs(PREVIEW_END_MS).build())
        .setRequestMetadata(MediaItem.RequestMetadata.Builder().setMediaUri(Uri.parse(url)).build())
        .setMediaMetadata(meta(q, "фрагмента") { putBoolean(X_PREVIEW, true) })
        .build()

    /** Посмотреть видео из истории снова (если файла на телефоне нет): ссылка на поток — через yt-dlp. */
    fun playVideoPage(ctx: Context, pageUrl: String, title: String) {
        val app = ctx.applicationContext
        resetQueue()
        ctx.startActivity(Intent(ctx, PlayerActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        worker.execute {
            val url = Downloader.videoStreamOf(pageUrl) ?: return@execute
            val item = MediaItem.Builder().setUri(url).setMediaId(url)
                .setRequestMetadata(MediaItem.RequestMetadata.Builder().setMediaUri(Uri.parse(url)).build())
                .setMediaMetadata(MediaMetadata.Builder().setTitle(title).setExtras(android.os.Bundle().apply {
                    putBoolean(X_VIDEO, true); putString(X_PAGE_URL, pageUrl)
                }).build())
                .build()
            main.post { controller(app) { c -> c.setMediaItem(item); c.prepare(); c.play() } }
        }
    }

    /**
     * Слушать/смотреть, пока идёт загрузка: играем прямо из интернета по ссылке, которую дал yt-dlp.
     * Для видео с двумя потоками (картинка + звук) вторую ссылку передаём проигрывателю — он склеит их сам.
     */
    fun playStream(ctx: Context, job: Job) {
        val urls = job.stream
        if (urls.isEmpty()) return
        resetQueue()
        Pending.set(null, loading = false, error = null)
        val video = job.kind == Kind.VIDEO
        val main = urls.first()
        val extras = android.os.Bundle().apply { if (urls.size > 1) putString(EXTRA_AUDIO_URL, urls[1]) }
        val metaExtras = android.os.Bundle().apply { putBoolean(X_VIDEO, video); putString(X_PAGE_URL, job.url); putString(X_SOURCE, job.site) }
        val parts = job.title.split(" — ", limit = 2)
        val item = MediaItem.Builder()
            .setUri(main)
            .setMediaId(main)
            .setRequestMetadata(MediaItem.RequestMetadata.Builder().setMediaUri(Uri.parse(main)).setExtras(extras).build())
            .setMediaMetadata(
                MediaMetadata.Builder()
                    .setTitle(if (parts.size == 2) parts[1] else job.title)
                    .setArtist(if (parts.size == 2) parts[0] else job.site)
                    .setExtras(metaExtras)
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
        resetQueue()
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
