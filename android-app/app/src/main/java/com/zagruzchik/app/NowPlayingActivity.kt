package com.zagruzchik.app

import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.graphics.ColorUtils
import androidx.core.view.isVisible
import androidx.media3.common.C
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import androidx.media3.session.MediaController
import com.google.android.material.button.MaterialButton
import com.google.android.material.color.MaterialColors
import com.google.android.material.imageview.ShapeableImageView
import com.google.android.material.snackbar.Snackbar
import com.google.android.material.R as M

/**
 * Экран «Сейчас играет» для музыки: большая обложка, фон в цвет обложки, перемотка,
 * управление и три главных действия — скачать, сервисы, отправить.
 * Видео показывается в [PlayerActivity].
 */
class NowPlayingActivity : AppCompatActivity() {

    private var preparingShare = false
    private var controller: MediaController? = null
    private lateinit var cover: ImageView
    private lateinit var title: TextView
    private lateinit var artist: TextView
    private lateinit var source: TextView
    private lateinit var seekView: View
    private val seek: AuraSeek get() = seekView as AuraSeek
    private lateinit var pos: TextView
    private lateinit var dur: TextView
    private lateinit var play: MaterialButton
    private lateinit var loading: View
    private lateinit var status: TextView
    private lateinit var retry: View
    private var coverBitmap: Bitmap? = null
    private var coverKey: Any? = null

    private val listener = object : Player.Listener {
        override fun onEvents(player: Player, events: Player.Events) = render()
    }
    private val pendingListener = { render() }
    private val ticker = object : Runnable {
        override fun run() {
            updateProgress()
            updateLyrics()
            // Пока играет фрагмент — обновляем «найдена · продолжит через N с».
            if (!showingPending() && extras()?.getBoolean(Playback.X_PREVIEW) == true) {
                controller?.let { c ->
                    val text = Cast.deviceName(this@NowPlayingActivity)?.let { "На телевизоре: $it" } ?: previewStatus(c)
                    if (source.text != text) source.text = text
                }
            }
            // Пока песня ищется — показываем, что уже ответили площадки.
            seekView.postDelayed(this, 250)
        }
    }

    private lateinit var glow: Aura.Glow

    override fun finish() {
        super.finish()
        if (android.os.Build.VERSION.SDK_INT >= 34) {
            runCatching { overrideActivityTransition(OVERRIDE_TRANSITION_CLOSE, android.R.anim.fade_in, android.R.anim.fade_out) }
        } else {
            @Suppress("DEPRECATION") runCatching { overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out) }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (android.os.Build.VERSION.SDK_INT >= 34) {
            runCatching { overrideActivityTransition(OVERRIDE_TRANSITION_OPEN, android.R.anim.fade_in, android.R.anim.fade_out) }
        } else {
            @Suppress("DEPRECATION") runCatching { overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out) }
        }
        // Два вида плеера — выбираются в настройках: «Кольцо» (диск и кольцо ауры) или «Волна».
        setContentView(if (Settings.playerStyle(this) == Settings.PlayerStyle.WAVE) R.layout.activity_now_playing_wave else R.layout.activity_now_playing)
        cover = findViewById(R.id.npCover)
        title = findViewById(R.id.npTitle)
        artist = findViewById(R.id.npArtist)
        source = findViewById(R.id.npSource)
        // Верхняя плашка с названием площадки — выбор источника для этой песни.
        findViewById<View>(R.id.npHeader).setOnClickListener { currentTrack()?.let { SourcePicker.show(this, it) } }
        // Нажатие на строку «Играет из…» — что ответила каждая площадка и за сколько (чтобы видеть, что тормозит).
        source.setOnClickListener {
            val t = currentTrack() ?: return@setOnClickListener
            val report = "Старт: ${Playback.startInfo ?: "—"}\n\n" + (Streams.report(t) ?: "Поиска не было: источник уже был известен или песня играла с телефона.")
            com.google.android.material.dialog.MaterialAlertDialogBuilder(this)
                .setTitle("Как включилась «${t.title}»")
                .setMessage(report)
                .setPositiveButton("Скопировать") { _, _ ->
                    getSystemService(android.content.ClipboardManager::class.java)
                        ?.setPrimaryClip(android.content.ClipData.newPlainText("SoundAura", "${t.artist} — ${t.title}\n$report"))
                }
                .setNeutralButton("Скопировать журнал") { _, _ -> AppLog.copy(this) }
                .setNegativeButton("Закрыть", null).show()
        }
        seekView = findViewById(R.id.npSeek)
        pos = findViewById(R.id.npPos)
        dur = findViewById(R.id.npDur)
        play = findViewById(R.id.npPlay)
        glow = Aura.Glow(findViewById(R.id.npAura))
        loading = findViewById(R.id.npLoading)
        status = findViewById(R.id.npStatus)
        retry = findViewById(R.id.npRetry)

        // Обложка — квадрат по меньшей стороне свободного места.
        val box = findViewById<View>(R.id.npCoverBox)
        val frame = findViewById<View>(R.id.npCoverFrame)
        // Дым вокруг обложки: отдельный слой сразу над фоном, под обложкой и кнопками.
        if (Settings.coverSmoke(this)) {
            val aura = findViewById<View>(R.id.npAura)
            val layer = aura.parent as ViewGroup
            // Своё свечение приложения (с фиолетовым оттенком) под дымом не нужно: оно подмешивало к цветам обложки чужой цвет.
            aura.visibility = View.INVISIBLE
            smoke = SmokeView(this).also { layer.addView(it, layer.indexOfChild(aura) + 1, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)) }
            // Положение дыма следует за обложкой при любой раскладке (и в «кольце», и в «волне»).
            cover.addOnLayoutChangeListener { _, _, _, _, _, _, _, _, _ ->
                val sm = smoke ?: return@addOnLayoutChangeListener
                val a = IntArray(2); val b = IntArray(2)
                cover.getLocationInWindow(a); sm.getLocationInWindow(b)
                sm.place(a[0] - b[0] + cover.width / 2f, a[1] - b[1] + cover.height / 2f, minOf(cover.width, cover.height) / 2f)
            }
        }
        box.addOnLayoutChangeListener { _, l, t, r, b, _, _, _, _ ->
            val side = minOf(r - l, b - t)
            if (frame.layoutParams.width != side) frame.post {
                frame.layoutParams = frame.layoutParams.apply { width = side; height = side }
                // В «кольце» диск всегда помещается внутри кольца прогресса — с зазором.
                if (ring) (cover.layoutParams as android.widget.FrameLayout.LayoutParams).apply { val m = (side * 0.11f).toInt(); setMargins(m, m, m, m); cover.layoutParams = this }
            }
        }

        findViewById<View>(R.id.npClose).setOnClickListener { finish() }
        play.setOnClickListener { controller?.let { if (it.isPlaying) it.pause() else { if (it.playbackState == Player.STATE_ENDED) it.seekTo(0); it.play() } } }
        findViewById<View>(R.id.npPrev).setOnClickListener { Playback.previous(this) }
        findViewById<View>(R.id.npNext).setOnClickListener { Playback.next(this) }
        // Свайп по обложке: вправо — следующая песня из текущего списка, влево — предыдущая.
        Swipe.attach(findViewById(R.id.npCoverFrame), onRight = { Playback.next(this) }, onLeft = { Playback.previous(this) })
        // Нажатие на диск переворачивает его: с обратной стороны — «компакт-диск на свету».
        findViewById<View>(R.id.npCoverFrame).setOnClickListener { flipDisc() }
        // Перемотка: по кольцу пальцем по кругу или по волне — влево-вправо.
        seek.onScrub = { f ->
            val d = controller?.let { Playback.duration(it) } ?: 0
            if (d > 0) pos.text = time((f * d).toLong())
        }
        seek.onSeek = { f ->
            controller?.let { c -> val d = Playback.duration(c); if (d > 0) Playback.seek(c, (f * d).toLong()) }
        }
        retry.setOnClickListener { Playback.retry(this) }
        // Не нашлась — по нажатию на сообщение: что ответили площадки и поле для своей ссылки.
        status.setOnClickListener { Playback.Pending.track?.takeIf { Playback.Pending.error != null }?.let(::notFoundDialog) }
        findViewById<View>(R.id.npLike).setOnClickListener { toggleLike() }
        findViewById<View>(R.id.npSpeed).setOnClickListener { anchor ->
            val c = controller ?: return@setOnClickListener
            val popup = androidx.appcompat.widget.PopupMenu(this, anchor)
            for (speed in listOf(0.5f, 0.75f, 1f, 1.25f, 1.5f, 2f)) {
                popup.menu.add(speedLabel(speed)).apply {
                    isCheckable = true
                    isChecked = c.playbackParameters.speed == speed
                    setOnMenuItemClickListener { c.setPlaybackSpeed(speed); true }
                }
            }
            popup.show()
        }
        findViewById<View>(R.id.npShare).setOnClickListener { share() }
        findViewById<View>(R.id.npMore).setOnClickListener(::showActions)
        findViewById<View>(R.id.npLyricsPeek).setOnClickListener { openLyrics() }
        // Исполнитель — ссылкой на его страницу: популярное, альбомы, радио.
        artist.setOnClickListener {
            val name = currentTrack()?.artist?.takeIf { it.isNotBlank() && it != "Скачано" } ?: return@setOnClickListener
            Rows.openArtist(this, name)
        }
        setupCastButton(findViewById(R.id.npCast))
    }

    override fun onStart() {
        super.onStart()
        Playback.Pending.listen(pendingListener)
        Playback.controller(this) { c ->
            if (!lifecycle.currentState.isAtLeast(androidx.lifecycle.Lifecycle.State.STARTED)) return@controller
            controller = c
            c.addListener(listener)
            render()
        }
        render()
        seekView.post(ticker)
    }

    override fun onDestroy() {
        if (::glow.isInitialized) glow.stop()
        super.onDestroy()
    }

    override fun onStop() {
        Playback.Pending.unlisten(pendingListener)
        controller?.removeListener(listener)
        controller = null
        seekView.removeCallbacks(ticker)
        super.onStop()
    }

    // Метки песни (фрагмент или полная, откуда играет) — из текущего элемента очереди. Общие данные
    // проигрывателя не обновляются при переходе фрагмент → полная: название, исполнитель и обложка те же.
    // ---------------- Текст песни в плеере ----------------

    private var lyricsKey: String? = null
    private var lyrics: Lyrics.Result? = null
    private var lyricLine = -2

    /** Текст новой песни — фоном; синхронный (LRCLIB) — строки пойдут вместе с музыкой. */
    private fun loadLyrics(t: Track) {
        if (t.title.isBlank() || !Settings.lyricsInPlayer(this)) {
            lyricsKey = null
            lyrics = null
            findViewById<View>(R.id.npLyricsPeek).isVisible = false
            return
        }
        val key = Library.key(t)
        if (key == lyricsKey) return
        lyricsKey = key; lyrics = null; lyricLine = -2
        findViewById<View>(R.id.npLyricsPeek).isVisible = false
        Thread {
            val r = runCatching { Lyrics.find(t) }.getOrNull()
            runOnUiThread { if (lyricsKey == key && !isDestroyed) { lyrics = r; updateLyrics() } }
        }.start()
    }

    private fun updateLyrics() {
        val peek = findViewById<View>(R.id.npLyricsPeek)
        val r = lyrics
        val c = controller
        val preview = extras()?.getBoolean(Playback.X_PREVIEW) == true
        if (r == null || c == null || preview || showingPending()) { peek.isVisible = false; lyricLine = -2; return }
        val prev = findViewById<TextView>(R.id.npLyrPrev)
        val now = findViewById<TextView>(R.id.npLyrNow)
        val next = findViewById<TextView>(R.id.npLyrNext)
        if (r.synced.isEmpty()) {
            // Только обычный текст — первые строки; весь — по нажатию.
            if (lyricLine == -1) return
            lyricLine = -1
            val lines = r.text.lines().filter { it.isNotBlank() && !it.startsWith("[") }
            prev.text = ""
            now.text = lines.getOrNull(0).orEmpty(); next.text = lines.getOrNull(1).orEmpty()
            peek.isVisible = lines.isNotEmpty()
            return
        }
        val pos = Playback.position(c) + 300
        val i = r.synced.indexOfLast { it.timeMs <= pos }
        if (i == lyricLine && peek.isVisible) return
        lyricLine = i
        prev.text = r.synced.getOrNull(i - 1)?.text.orEmpty()
        now.text = r.synced.getOrNull(i)?.text?.ifEmpty { "♪" } ?: "♪"
        next.text = r.synced.getOrNull(i + 1)?.text.orEmpty()
        peek.isVisible = true
    }

    private fun extras(): Bundle? = controller?.currentMediaItem?.mediaMetadata?.extras

    /** Пока поток готовится — показываем песню из запроса, когда заиграла — из проигрывателя. */
    private fun showingPending(): Boolean {
        val p = Playback.Pending
        return p.track != null && (p.loading || p.error != null)
    }

    private fun currentTrack(): Track? {
        if (showingPending()) return Playback.Pending.track
        val m = controller?.mediaMetadata ?: return null
        val t = m.title?.toString() ?: return null
        return Track(t, m.artist?.toString().orEmpty(), cover = m.artworkUri?.toString())
    }

    private fun previewStatus(c: MediaController) =
        Playback.joinIn(c)?.let { "Полная версия найдена · продолжит без паузы через $it с" }
            ?: "Фрагмент · ищу полную версию, продолжит с этого же места"

    private fun render() {
        val c = controller
        // Видео — на отдельный экран.
        if (c != null && !showingPending() && c.currentMediaItem?.mediaMetadata?.extras?.let { it.getBoolean(Playback.X_VIDEO) || it.getString(Playback.X_LOCAL_MIME)?.startsWith("video/") == true } == true) {
            startActivity(Intent(this, PlayerActivity::class.java))
            finish()
            return
        }
        val pending = showingPending()
        val p = Playback.Pending
        val track = currentTrack()
        val saved = track?.let(Library::isSaved) == true
        findViewById<ImageView>(R.id.npLike).apply {
            isEnabled = track != null
            setImageResource(if (saved) R.drawable.ic_favorite else R.drawable.ic_favorite_border)
            contentDescription = if (saved) "Убрать из любимого" else "В любимое"
        }
        findViewById<TextView>(R.id.npSpeed).apply {
            isEnabled = c?.isCommandAvailable(Player.COMMAND_SET_SPEED_AND_PITCH) == true
            text = speedLabel(c?.playbackParameters?.speed ?: 1f)
            contentDescription = "Скорость воспроизведения $text"
        }
        findViewById<View>(R.id.npShare).isEnabled = track != null
        loading.isVisible = pending
        if (pending || extras()?.getBoolean(Playback.X_PREVIEW) == true) {
            findViewById<View>(R.id.npLyricsPeek).isVisible = false
            lyricLine = -2
        }
        // Сменилась песня — название, исполнитель и обложка мягко проявляются, а не подменяются рывком.
        val nowKey = if (pending) p.track?.let { it.title + "|" + it.artist } else c?.mediaMetadata?.let { "${it.title}|${it.artist}" }
        val changed = nowKey != null && nowKey != shownKey
        if (changed) { shownKey = nowKey; fadeIn(title, 0); fadeIn(artist, 40); fadeIn(source, 80); coverFade = true }
        if (pending) {
            val t = p.track!!
            title.text = t.title
            artist.text = t.artist
            source.text = if (p.error != null) "Не получилось включить" else "Включаю…"
            // На экране — только суть, как в обычном плеере. Подробности (что ответила каждая площадка) — по нажатию и в журнале.
            status.text = if (p.error != null) "Песня сейчас недоступна" + (if (p.error!!.startsWith("Включаю следующую")) " — включаю следующую" else "") else "Загружается…"
            findViewById<TextView>(R.id.npHeader).text = "Сейчас играет"
            findViewById<View>(R.id.npSpinner).isVisible = p.error == null
            retry.isVisible = p.error != null
            setCover(t.cover ?: LinkCache.get(t)?.track?.cover, null)
        } else if (c != null && c.mediaItemCount > 0) {
            val m = c.mediaMetadata
            title.text = m.title ?: "Без названия"
            artist.text = listOfNotNull(m.artist, m.albumTitle).joinToString(" · ")
            val x = extras()
            val src = x?.getString(Playback.X_SOURCE)
            val isPreview = x?.getBoolean(Playback.X_PREVIEW) == true
            val tv = Cast.deviceName(this)
            source.text = when {
                tv != null -> "На телевизоре: $tv"
                src == null -> ""
                src == "Скачано" -> "Из загрузок · без интернета"
                isPreview -> previewStatus(c)
                else -> "Играет из $src" + (Playback.startInfo?.let { " · старт: $it" } ?: "")
            }
            setCover(m.artworkUri?.toString(), m.artworkData)
            // Вверху — откуда играет: площадка, память, телефон или ТВ.
            findViewById<TextView>(R.id.npHeader).text = when {
                tv != null -> tv
                src == "Скачано" -> "С телефона"
                isPreview -> "Фрагмент"
                src != null -> src.replaceFirstChar { it.uppercase() }
                else -> "Сейчас играет"
            }
            if (!isPreview) loadLyrics(Track(m.title?.toString().orEmpty(), m.artist?.toString().orEmpty(),
                (Playback.duration(c) / 1000).toInt().coerceAtLeast(0)))
            // Рисунок «волны» — свой у каждой песни.
            (seekView as? WaveSeekView)?.let { w -> val s = (m.title?.toString() + m.artist).hashCode(); if (w.seed != s) w.seed = s }
        }
        val playing = c?.isPlaying == true
        findViewById<EqBarsView>(R.id.npEq).playing(playing)
        play.setIconResource(if (playing) R.drawable.ic_pause else R.drawable.ic_play_arrow)
        glow.playing(playing) // аура «дышит», пока играет
        smoke?.playing = playing
        discBack.playing = playing
        play.contentDescription = if (playing) "Пауза" else "Играть"
        play.isEnabled = !pending
        updateProgress()
        // Ссылки для «Отправить» готовим сразу, пока песня играет.
        currentTrack()?.let { LinkCache.prefetch(it, extras()?.getString(Playback.X_SOURCE_URL)) }
    }

    private fun setCover(url: String?, data: ByteArray?) {
        val key: Any? = data?.contentHashCode() ?: url
        if (key == coverKey && coverBitmap != null) return
        coverKey = key
        if (data != null) {
            BitmapFactory.decodeByteArray(data, 0, data.size)?.let { applyCover(it); return }
        }
        if (url == null) {
            if (coverBitmap != null && showingPending()) return // пока включается следующая — держим прежнюю обложку, без мигания
            coverBitmap = null
            smoke?.setCover(null)
            if (ring) setFront(android.graphics.drawable.LayerDrawable(arrayOf(
                GradientDrawable().apply { shape = GradientDrawable.OVAL; setColor(MaterialColors.getColor(cover, M.attr.colorSurfaceContainerHighest)) },
                androidx.core.content.ContextCompat.getDrawable(this, R.drawable.ic_music_note_white)?.mutate()?.apply { alpha = 0x55 },
            )).apply { val p = (cover.width.takeIf { it > 0 } ?: dp(240)) * 3 / 10; setLayerInset(1, p, p, p, p) })
            else cover.setImageResource(R.drawable.player_artwork)
            paintBackground(null)
            // Картинки нет ни у песни, ни у записи — ищем обложку этой песни в каталоге; найдётся — появится сама.
            currentTrack()?.let { t ->
                val k = Library.key(t)
                kotlin.concurrent.thread(name = "cover") {
                    val found = Catalog.coverFor(t) ?: return@thread
                    runOnUiThread {
                        if (isFinishing || isDestroyed || coverKey != null || currentTrack()?.let { Library.key(it) } != k) return@runOnUiThread
                        coverKey = found
                        Images.load(found) { if (coverKey == found) applyCover(it) }
                    }
                }
            }
            return
        }
        Images.load(url) { if (coverKey == key) applyCover(it) }
    }

    private var smoke: SmokeView? = null

    // ---- Диск переворачивается по нажатию ----
    private val discBack = DiscBack()
    private var front: android.graphics.drawable.Drawable? = null
    private var flipping = false

    /** Лицевая сторона диска (обложка или заглушка); если диск перевёрнут — на экране остаётся обратная. */
    private fun setFront(d: android.graphics.drawable.Drawable) {
        front = d
        cover.setImageDrawable(if (discFlipped) discBack else d)
    }

    private fun flipDisc() {
        if (!ring || flipping) return
        flipping = true
        cover.cameraDistance = resources.displayMetrics.density * 9000
        cover.animate().rotationY(90f).setDuration(170).setInterpolator(android.view.animation.AccelerateInterpolator()).withEndAction {
            discFlipped = !discFlipped
            cover.setImageDrawable(if (discFlipped) discBack else front)
            cover.rotationY = -90f
            cover.animate().rotationY(0f).setDuration(190).setInterpolator(android.view.animation.DecelerateInterpolator())
                .withEndAction { flipping = false }.start()
        }.start()
    }
    private var shownKey: String? = null
    private var coverFade = false

    private fun fadeIn(v: View, delay: Long) {
        v.animate().cancel()
        v.alpha = 0f; v.translationY = dp(6).toFloat()
        v.animate().alpha(1f).translationY(0f).setStartDelay(delay).setDuration(220).start()
    }

    private fun applyCover(b: Bitmap) {
        // Новая обложка проявляется поверх старой (старая не сбрасывается на заглушку — экран не мигает).
        if (coverFade || coverBitmap != null && coverBitmap !== b) {
            coverFade = false
            cover.animate().cancel()
            cover.rotationY = 0f; flipping = false
            cover.alpha = 0.35f; cover.scaleX = 0.96f; cover.scaleY = 0.96f
            cover.animate().alpha(1f).scaleX(1f).scaleY(1f).setDuration(260).start()
        }
        coverBitmap = b
        smoke?.setCover(b)
        // «Кольцо»: обложка — круглый диск (сама картинка обрезается по кругу, по центру квадрата).
        if (ring) setFront(disc(b)) else cover.setImageBitmap(b)
        paintBackground(b)
    }

    private val ring get() = seekView is RingProgressView

    /** Круглая картинка из любой: центральный квадрат, обрезанный по кругу. */
    private fun disc(b: Bitmap): android.graphics.drawable.Drawable {
        val side = minOf(b.width, b.height)
        val sq = Bitmap.createBitmap(b, (b.width - side) / 2, (b.height - side) / 2, side, side)
        return androidx.core.graphics.drawable.RoundedBitmapDrawableFactory.create(resources, sq).apply { isCircular = true; setAntiAlias(true) }
    }

    /** Фон: цвет обложки сверху, плавно уходящий в обычный фон. */
    private fun paintBackground(b: Bitmap?) {
        val surface = MaterialColors.getColor(cover, M.attr.colorSurface)
        // Бегунок — цвета основного акцента обложки; без обложки — фирменные цвета.
        seek.accent = b?.let { Images.accent(it) } ?: NO_COVER_ACCENT
        // Цвет обложки с оттенком ауры — сверху, плавно уходит в фон; вокруг обложки — свечение того же цвета.
        // С дымом — чистый цвет обложки, без подмешивания цвета приложения.
        val tone = b?.let { if (smoke != null) Images.dominant(it) else ColorUtils.blendARGB(Images.dominant(it), Aura.VIOLET, 0.25f) } ?: NO_COVER_TONE // обложки нет — спокойный нейтральный фон, а не яркий цвет приложения
        glow.color(tone)
        val top = ColorUtils.blendARGB(tone, surface, 0.45f)
        findViewById<View>(R.id.npBackground).background =
            GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, intArrayOf(top, surface, surface))
    }

    private fun speedLabel(speed: Float) = speed.toString().removeSuffix(".0").replace('.', ',') + "×"

    private var positionSecond = -1L
    private var durationSecond = -1L

    private fun updateProgress() {
        val c = controller ?: return
        val pending = showingPending()
        val d = if (pending) 0L else Playback.duration(c).coerceAtLeast(0)
        val p = if (pending) 0L else Playback.position(c).coerceAtLeast(0)
        if (!seek.isScrubbing) {
            val fraction = if (d > 0) (p.toFloat() / d).coerceIn(0f, 1f) else 0f
            if (seek.progress != fraction) seek.progress = fraction
            if (positionSecond != p / 1000) {
                positionSecond = p / 1000
                pos.text = time(p)
            }
        }
        if (durationSecond != d / 1000) {
            durationSecond = d / 1000
            dur.text = time(d)
        }
    }

    private fun time(ms: Long): String {
        val s = ms / 1000
        return if (s >= 3600) "%d:%02d:%02d".format(s / 3600, s / 60 % 60, s % 60) else "%d:%02d".format(s / 60, s % 60)
    }

    private fun openLyrics() {
        val t = currentTrack() ?: return
        val d = controller?.let { Playback.duration(it) }?.takeIf { it > 0 }?.let { (it / 1000).toInt() } ?: 0
        LyricsSheet.show(this, t.copy(durationSec = d), position = { controller?.let { Playback.position(it) } ?: 0L },
            seek = { ms -> controller?.let { Playback.seek(it, ms) } }, onVisibilityChanged = { render() })
    }

    private fun toggleLike() {
        val t = currentTrack() ?: return
        val x = extras()?.takeUnless { showingPending() }
        val local = x?.getString(Playback.X_LOCAL_URI) != null && x.getString(Playback.X_SOURCE) == "Скачано"
        val saved = Library.like(this, t, x?.getString(Playback.X_PAGE_URL), x?.getString(Playback.X_SOURCE_URL))
        val msg = when {
            !saved -> "Убрано из любимого"
            local || !Settings.saveLiked(this) -> "В любимом"
            MediaCache.has(t) -> "В любимом · сохраняю на телефон из памяти"
            else -> "В любимом · скачиваю на телефон"
        }
        Snackbar.make(seekView, msg, Snackbar.LENGTH_SHORT).show()
        render()
    }

    private fun showActions(anchor: View) {
        val popup = androidx.appcompat.widget.PopupMenu(this, anchor)
        val track = currentTrack()
        val c = controller
        val x = extras()
        val pending = showingPending()
        val url = x?.getString(Playback.X_PAGE_URL) ?: x?.getString(Playback.X_SOURCE_URL)
        val local = x?.getString(Playback.X_LOCAL_URI) != null && x.getString(Playback.X_SOURCE) == "Скачано" && !pending
        val downloading = url != null && Jobs.all.any { it.active && it.url == url }

        fun action(label: String, enabled: Boolean = true, run: () -> Unit): android.view.MenuItem =
            popup.menu.add(label).apply {
                isEnabled = enabled
                setOnMenuItemClickListener { run(); true }
            }

        action("Текст песни", track != null) { openLyrics() }
        action("Перемешать", c != null) { c?.let { it.shuffleModeEnabled = !it.shuffleModeEnabled } }.apply {
            isCheckable = true
            isChecked = c?.shuffleModeEnabled == true
        }
        val modes = popup.menu.addSubMenu("Повтор")
        modes.item.isEnabled = c != null
        listOf(Player.REPEAT_MODE_OFF to "Выключен", Player.REPEAT_MODE_ALL to "Вся очередь",
            Player.REPEAT_MODE_ONE to "Одна песня").forEach { (mode, label) ->
            modes.add(1, mode, mode, label).apply {
                isCheckable = true
                isChecked = c?.repeatMode == mode
                setOnMenuItemClickListener { c?.repeatMode = mode; true }
            }
        }
        action(when { local -> "Скачано"; downloading -> "Скачивается…"; else -> "Скачать" },
            !pending && !local && !downloading && url != null) { downloadCurrent() }
        action("Слушать в другом сервисе", track != null) {
            track?.let { TransferActivity.openTrack(this, it, x?.getString(Playback.X_SOURCE_URL)) }
        }
        action("Эквалайзер") { startActivity(Intent(this, EqualizerActivity::class.java)) }
        popup.show()
    }

    private fun share() {
        val t = currentTrack() ?: return
        val item = controller?.currentMediaItem?.takeUnless { showingPending() }
        val info = item?.mediaMetadata?.extras
        val source = info?.getString(Playback.X_SOURCE_URL)
        val audio = info?.getString(Playback.X_LOCAL_URI) ?: item?.mediaId?.takeIf {
            it.startsWith("http") && info?.getBoolean(Playback.X_PREVIEW) != true && info?.getBoolean(Playback.X_HEAD) != true
        }
        com.google.android.material.dialog.MaterialAlertDialogBuilder(this)
            .setTitle("Поделиться песней")
            .setItems(arrayOf("Карточкой", "MP3-файлом")) { _, mode ->
                if (mode == 0) {
                    val entry = LinkCache.prefetch(t, source)
                    SongCard.share(this, entry.track, Images.cached(entry.track.cover), LinkCache.linksFor(entry))
                } else if (!preparingShare) {
                    preparingShare = true
                    val status = Snackbar.make(seekView, "Готовлю MP3 · ${t.title}", Snackbar.LENGTH_INDEFINITE)
                    status.show()
                    Thread {
                        val result = runCatching { ShareMp3.intent(applicationContext, t, audio) }
                        runOnUiThread {
                            preparingShare = false
                            if (isDestroyed || isFinishing) return@runOnUiThread
                            status.dismiss()
                            result.onSuccess { startActivity(Intent.createChooser(it, "Отправить MP3")) }
                                .onFailure { Snackbar.make(seekView, "Не удалось подготовить MP3", Snackbar.LENGTH_LONG).show() }
                        }
                    }.start()
                }
            }.show()
    }

    /** Скачать то, что звучит сейчас: по странице потока — без повторного поиска. */
    private fun downloadCurrent() {
        val x = extras() ?: return
        val url = x.getString(Playback.X_PAGE_URL) ?: x.getString(Playback.X_SOURCE_URL) ?: return
        val t = currentTrack()
        DownloadService.enqueue(this, url, Format.MP3, t?.label)
        Snackbar.make(seekView, "Скачиваю «${t?.title ?: "песню"}»", Snackbar.LENGTH_LONG)
            .setAction("Загрузки") {
                startActivity(Intent(this, MainActivity::class.java).putExtra(MainActivity.EXTRA_SHOW_JOBS, true)
                    .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP))
            }
            .show()
    }

    private fun notFoundDialog(t: Track) {
        val report = (Streams.report(t) ?: "Отчёта пока нет — нажмите «Ещё раз».")
        val input = android.widget.EditText(this).apply {
            hint = "Ссылка на песню: YouTube, SoundCloud, VK Видео…"; setSingleLine()
            setText(Streams.pinned(t).orEmpty())
        }
        val text = TextView(this).apply { this.text = report; textSize = 12f; setTextIsSelectable(true); setPadding(0, dp(12), 0, 0) }
        val box = android.widget.LinearLayout(this).apply {
            orientation = android.widget.LinearLayout.VERTICAL; setPadding(dp(22), dp(8), dp(22), 0)
            addView(input); addView(text)
        }
        com.google.android.material.dialog.MaterialAlertDialogBuilder(this)
            .setTitle("«${t.title}» не нашлась")
            .setView(android.widget.ScrollView(this).apply { addView(box) })
            .setPositiveButton("Играть по ссылке") { _, _ ->
                val url = Links.extract(input.text.toString()) ?: input.text.toString().trim()
                if (url.startsWith("http")) { Streams.pin(t, url); Playback.retry(this) }
            }
            .setNeutralButton("Скопировать журнал") { _, _ -> AppLog.copy(this) }
            .setNegativeButton("Закрыть", null).show()
    }
}

/** Диск перевёрнут обратной стороной — помним, пока приложение открыто. */
private var discFlipped = false

/** Песня без обложки: нейтральные цвета фона и бегунка. */
private const val NO_COVER_TONE = 0xFF4A4C5C.toInt()
private const val NO_COVER_ACCENT = 0xFFD8D9E3.toInt()
