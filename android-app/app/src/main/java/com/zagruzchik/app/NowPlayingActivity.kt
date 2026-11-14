package com.zagruzchik.app

import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.view.View
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
    private lateinit var shuffle: View
    private lateinit var repeat: MaterialButton
    private lateinit var download: View
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
            if (extras()?.getBoolean(Playback.X_PREVIEW) == true) render()
            // Пока песня ищется — показываем, что уже ответили площадки.
            Playback.Pending.let { p -> if (p.loading && p.error == null) p.track?.let { t -> Streams.progress(t)?.let { status.text = it } } }
            seekView.postDelayed(this, 250)
        }
    }

    private lateinit var glow: Aura.Glow

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Два вида плеера — выбираются в настройках: «Кольцо» (диск и кольцо ауры) или «Волна».
        setContentView(if (Settings.playerStyle(this) == Settings.PlayerStyle.WAVE) R.layout.activity_now_playing_wave else R.layout.activity_now_playing)
        cover = findViewById(R.id.npCover)
        title = findViewById(R.id.npTitle)
        artist = findViewById(R.id.npArtist)
        source = findViewById(R.id.npSource)
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
                .setNegativeButton("Закрыть", null).show()
        }
        seekView = findViewById(R.id.npSeek)
        pos = findViewById(R.id.npPos)
        dur = findViewById(R.id.npDur)
        play = findViewById(R.id.npPlay)
        glow = Aura.Glow(findViewById(R.id.npAura))
        shuffle = findViewById(R.id.npShuffle)
        repeat = findViewById(R.id.npRepeat)
        download = findViewById(R.id.npDownload)
        loading = findViewById(R.id.npLoading)
        status = findViewById(R.id.npStatus)
        retry = findViewById(R.id.npRetry)

        // Обложка — квадрат по меньшей стороне свободного места.
        val box = findViewById<View>(R.id.npCoverBox)
        val frame = findViewById<View>(R.id.npCoverFrame)
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
        findViewById<View>(R.id.npPrev).setOnClickListener { controller?.seekToPrevious() }
        findViewById<View>(R.id.npNext).setOnClickListener { Playback.next(this) }
        // Свайп по обложке: вправо — следующая песня из текущего списка, влево — предыдущая.
        Swipe.attach(findViewById(R.id.npCoverFrame), onRight = { Playback.next(this) }, onLeft = { Playback.previous(this) })
        shuffle.setOnClickListener { controller?.let { it.shuffleModeEnabled = !it.shuffleModeEnabled } }
        repeat.setOnClickListener {
            controller?.let {
                it.repeatMode = when (it.repeatMode) {
                    Player.REPEAT_MODE_OFF -> Player.REPEAT_MODE_ALL
                    Player.REPEAT_MODE_ALL -> Player.REPEAT_MODE_ONE
                    else -> Player.REPEAT_MODE_OFF
                }
            }
        }
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
        val share = View.OnClickListener { share() }
        findViewById<View>(R.id.npShare).setOnClickListener(share)
        findViewById<View>(R.id.npShareTop).setOnClickListener(share)
        findViewById<View>(R.id.npWhere).setOnClickListener {
            currentTrack()?.let { TransferActivity.openTrack(this, it, extras()?.getString(Playback.X_SOURCE_URL)) }
        }
        download.setOnClickListener { downloadCurrent() }
        findViewById<View>(R.id.npLyricsPeek).setOnClickListener { findViewById<View>(R.id.npLyrics).performClick() }
        findViewById<View>(R.id.npFx).setOnClickListener { startActivity(Intent(this, EqualizerActivity::class.java)) }
        findViewById<View>(R.id.npLyrics).setOnClickListener {
            val t = currentTrack() ?: return@setOnClickListener
            val d = controller?.let { Playback.duration(it) }?.takeIf { it > 0 }?.let { (it / 1000).toInt() } ?: 0
            LyricsSheet.show(this, t.copy(durationSec = d), position = { controller?.let { Playback.position(it) } ?: 0L },
                seek = { ms -> controller?.let { Playback.seek(it, ms) } })
        }
        // Исполнитель — ссылкой на его страницу: популярное, альбомы, радио.
        artist.setOnClickListener {
            val name = currentTrack()?.artist?.takeIf { it.isNotBlank() && it != "Скачано" } ?: return@setOnClickListener
            Rows.openArtist(this, name)
        }
        findViewById<MaterialButton>(R.id.npLike).setOnClickListener {
            val t = currentTrack() ?: return@setOnClickListener
            val x = extras()
            val local = x?.getString(Playback.X_LOCAL_URI) != null && x.getString(Playback.X_SOURCE) == "Скачано"
            val saved = Library.like(this, LinkCache.get(t)?.track ?: t, x?.getString(Playback.X_PAGE_URL), x?.getString(Playback.X_SOURCE_URL))
            val msg = when {
                !saved -> "Убрано из любимого"
                local || !Settings.saveLiked(this) -> "В любимом"
                MediaCache.has(t) -> "В любимом · сохраняю на телефон из памяти"
                else -> "В любимом · скачиваю на телефон"
            }
            Snackbar.make(seekView, msg, Snackbar.LENGTH_SHORT).show()
            render()
        }
        setupCastButton(findViewById(R.id.npCast))
    }

    override fun onStart() {
        super.onStart()
        Playback.Pending.listen(pendingListener)
        Playback.controller(this) { c ->
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
        if (t.title.isBlank() || !Settings.lyricsInPlayer(this)) return
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
        if (r == null || c == null || preview || showingPending()) { peek.isVisible = false; return }
        val prev = findViewById<TextView>(R.id.npLyrPrev)
        val now = findViewById<TextView>(R.id.npLyrNow)
        val next = findViewById<TextView>(R.id.npLyrNext)
        if (r.synced.isEmpty()) {
            // Только обычный текст — первые строки; весь — по нажатию.
            if (lyricLine == -1) return
            lyricLine = -1
            val lines = r.text.lines().filter { it.isNotBlank() && !it.startsWith("[") }
            prev.isVisible = false
            now.text = lines.getOrNull(0).orEmpty(); next.text = lines.getOrNull(1).orEmpty()
            peek.isVisible = lines.isNotEmpty()
            return
        }
        val pos = Playback.position(c) + 300
        val i = r.synced.indexOfLast { it.timeMs <= pos }
        if (i == lyricLine && peek.isVisible) return
        lyricLine = i
        prev.isVisible = true
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

    private fun render() {
        val c = controller
        // Видео — на отдельный экран.
        if (c != null && !showingPending() && c.currentTracks.isTypeSelected(C.TRACK_TYPE_VIDEO)) {
            startActivity(Intent(this, PlayerActivity::class.java))
            finish()
            return
        }
        val pending = showingPending()
        val p = Playback.Pending
        loading.isVisible = pending
        if (pending) {
            val t = p.track!!
            title.text = t.title
            artist.text = t.artist
            source.text = if (p.error != null) "Не получилось включить" else "Включаю…"
            status.text = p.error ?: Streams.progress(t) ?: "Беру полную версию: Zaycev, SoundCloud, YouTube…"
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
                isPreview -> Playback.joinIn(c)?.let { s -> "Полная версия найдена · продолжит без паузы через $s с" }
                    ?: "Фрагмент · ищу полную версию, продолжит с этого же места"
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
        play.contentDescription = if (playing) "Пауза" else "Играть"
        play.isEnabled = !pending
        shuffle.alpha = if (c?.shuffleModeEnabled == true) 1f else 0.45f
        repeat.alpha = if (c?.repeatMode == Player.REPEAT_MODE_OFF || c == null) 0.45f else 1f
        repeat.setIconResource(if (c?.repeatMode == Player.REPEAT_MODE_ONE) R.drawable.ic_repeat_one else R.drawable.ic_repeat)
        // «Скачано» — только для файла в Загрузках; память прослушанного — не загрузка.
        val local = extras()?.getString(Playback.X_LOCAL_URI) != null && extras()?.getString(Playback.X_SOURCE) == "Скачано" && !pending
        download.isEnabled = !local && !pending
        download.alpha = if (download.isEnabled || local) 1f else 0.45f
        findViewById<TextView>(R.id.npDownloadText).text = if (local) "Скачано" else "Скачать"
        findViewById<ImageView>(R.id.npDownloadIcon).setImageResource(if (local) R.drawable.ic_check_circle else R.drawable.ic_download)
        val liked = currentTrack()?.let { Library.isSaved(it) } == true
        findViewById<MaterialButton>(R.id.npLike).apply {
            setIconResource(if (liked) R.drawable.ic_favorite else R.drawable.ic_favorite_border)
            // В «кольце» сердечко само красится в цвет ауры, в «волне» оно на градиентном круге.
            if (seekView is RingProgressView) iconTint = android.content.res.ColorStateList.valueOf(
                if (liked) AuraColors.c3(this@NowPlayingActivity) else MaterialColors.getColor(this, M.attr.colorOnSurfaceVariant))
            contentDescription = if (liked) "Убрать из библиотеки" else "В библиотеку"
        }
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
            coverBitmap = null
            if (ring) cover.setImageDrawable(GradientDrawable().apply { shape = GradientDrawable.OVAL; setColor(MaterialColors.getColor(cover, M.attr.colorSurfaceContainerHighest)) })
            else cover.setImageResource(R.drawable.player_artwork)
            paintBackground(null)
            return
        }
        Images.load(url) { if (coverKey == key) applyCover(it) }
    }

    private fun applyCover(b: Bitmap) {
        coverBitmap = b
        // «Кольцо»: обложка — круглый диск (сама картинка обрезается по кругу, по центру квадрата).
        if (ring) cover.setImageDrawable(disc(b)) else cover.setImageBitmap(b)
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
        // Цвет обложки с оттенком ауры — сверху, плавно уходит в фон; вокруг обложки — свечение того же цвета.
        val tone = b?.let { ColorUtils.blendARGB(Images.dominant(it), Aura.VIOLET, 0.25f) } ?: Aura.VIOLET
        glow.color(tone)
        val top = ColorUtils.blendARGB(tone, surface, 0.45f)
        findViewById<View>(R.id.npBackground).background =
            GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, intArrayOf(top, surface, surface))
    }

    private fun updateProgress() {
        val c = controller ?: return
        if (showingPending()) {
            seek.progress = 0f; pos.text = "0:00"; dur.text = "0:00"; return
        }
        val d = Playback.duration(c)
        val p = Playback.position(c)
        if (d > 0 && !seek.isScrubbing) {
            seek.progress = (p.toFloat() / d).coerceIn(0f, 1f)
            pos.text = time(p)
        }
        dur.text = if (d > 0) time(d) else "0:00"
    }

    private fun time(ms: Long): String {
        val s = ms / 1000
        return if (s >= 3600) "%d:%02d:%02d".format(s / 3600, s / 60 % 60, s % 60) else "%d:%02d".format(s / 60, s % 60)
    }

    private fun share() {
        val t = currentTrack() ?: return
        val x = extras()
        val local = x?.getString(Playback.X_LOCAL_URI)?.let {
            SongShareSheet.LocalFile(it, x.getString(Playback.X_LOCAL_MIME) ?: "audio/mpeg", x.getString(Playback.X_LOCAL_NAME) ?: "песня")
        }
        SongShareSheet.show(this, t, x?.getString(Playback.X_SOURCE_URL), local, coverBitmap)
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
        download.isEnabled = false
        findViewById<TextView>(R.id.npDownloadText).text = "Качаю…"
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
            .setNeutralButton("Скопировать отчёт") { _, _ ->
                getSystemService(android.content.ClipboardManager::class.java)
                    ?.setPrimaryClip(android.content.ClipData.newPlainText("SoundAura", "${t.artist} — ${t.title}\n$report"))
            }
            .setNegativeButton("Закрыть", null).show()
    }
}
