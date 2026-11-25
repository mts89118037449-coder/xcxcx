package com.zagruzchik.app

import android.app.Activity
import android.app.Application
import android.content.Intent
import android.graphics.BitmapFactory
import android.graphics.Outline
import android.os.Bundle
import android.text.TextUtils
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.ViewOutlineProvider
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.isVisible
import androidx.media3.common.Player
import androidx.media3.session.MediaController
import com.google.android.material.color.MaterialColors
import java.util.WeakHashMap

/**
 * Полоска «сейчас играет» внизу любого экрана приложения (подборка, перенос, эквалайзер, Telegram…):
 * обложка, название, пауза и «следующая»; нажатие открывает плеер. На главном экране — свой мини-плеер,
 * на экране плеера и видео полоска не нужна.
 */
object MiniBar {
    private val skip = setOf<Class<*>>(
        MainActivity::class.java, PlayerActivity::class.java,
        ShareActivity::class.java, LoginActivity::class.java,
    )
    private val bars = WeakHashMap<Activity, Bar>()
    private val artExec = java.util.concurrent.Executors.newSingleThreadExecutor()

    fun install(app: Application) {
        app.registerActivityLifecycleCallbacks(object : Application.ActivityLifecycleCallbacks {
            override fun onActivityStarted(a: Activity) {
                if (a.javaClass in skip) return
                runCatching { bars.getOrPut(a) { Bar(a, navOnly = a is NowPlayingActivity) }.start() }
            }
            override fun onActivityStopped(a: Activity) { bars[a]?.stop() }
            override fun onActivityDestroyed(a: Activity) { bars.remove(a) }
            override fun onActivityCreated(a: Activity, s: Bundle?) {}
            override fun onActivityResumed(a: Activity) {}
            override fun onActivityPaused(a: Activity) {}
            override fun onActivitySaveInstanceState(a: Activity, out: Bundle) {}
        })
    }

    /**
     * [navOnly] — только меню разделов, без полоски «сейчас играет» (в самом плеере она не нужна). Владелец 20.11: «слушая песню,
     * не могу попасть в остальные пункты» — теперь меню есть и в плеере; нажатие закрывает плеер и открывает раздел.
     */
    private class Bar(private val a: Activity, private val navOnly: Boolean = false) {
        private val content: FrameLayout = a.findViewById(android.R.id.content)
        private val onSurface = MaterialColors.getColor(content, com.google.android.material.R.attr.colorOnSurface)
        private val muted = MaterialColors.getColor(content, com.google.android.material.R.attr.colorOnSurfaceVariant)
        private val cover = ImageView(a).apply {
            scaleType = ImageView.ScaleType.CENTER_CROP
            clipToOutline = true
            outlineProvider = object : ViewOutlineProvider() {
                override fun getOutline(v: View, o: Outline) = o.setRoundRect(0, 0, v.width, v.height, a.dp(12).toFloat())
            }
            setImageResource(R.drawable.ph_cover)
        }
        private val title = TextView(a).apply { textSize = 14f; setTextColor(onSurface); maxLines = 1; ellipsize = TextUtils.TruncateAt.END }
        private val artist = TextView(a).apply { textSize = 12f; setTextColor(muted); maxLines = 1; ellipsize = TextUtils.TruncateAt.END }
        private val play = button(R.drawable.ic_pause, "Пауза") { controller?.let { if (it.isPlaying) it.pause() else it.play() } }
        private val next = button(R.drawable.ic_skip_next, "Следующая") { Playback.next(a) }
        private val view = FrameLayout(a).apply {
            setBackgroundResource(R.drawable.bg_mini_player)
            clipToOutline = true
            elevation = a.dp(6).toFloat()
            isClickable = true; isFocusable = true
            visibility = View.GONE
            contentDescription = "Сейчас играет — открыть плеер"
            addView(LinearLayout(a).apply {
                orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL
                setPadding(a.dp(8), 0, a.dp(4), 0)
                addView(cover, LinearLayout.LayoutParams(a.dp(44), a.dp(44)))
                addView(LinearLayout(a).apply {
                    orientation = LinearLayout.VERTICAL
                    addView(title); addView(artist)
                }, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply { marginStart = a.dp(12) })
                addView(play, LinearLayout.LayoutParams(a.dp(48), a.dp(48)))
                addView(next, LinearLayout.LayoutParams(a.dp(48), a.dp(48)))
            }, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
            setOnClickListener { a.startActivity(Intent(a, NowPlayingActivity::class.java)) }
        }
        private var controller: MediaController? = null
        private var started = false
        private var coverUrl: String? = null
        private var coverArtKey: String? = null
        private val listener = object : Player.Listener {
            override fun onEvents(player: Player, events: Player.Events) = update()
        }

        // Нижнее меню — как на главном экране: раньше при переходе в раздел оно пропадало.
        private val nav = PillNav(a).apply {
            setItems(MainActivity.navItems())
            selectedItemId = MainActivity.currentPage
            val go = { id: Int ->
                a.startActivity(Intent(a, MainActivity::class.java).putExtra(MainActivity.EXTRA_PAGE, id)
                    .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP))
            }
            listener = go; onReselect = go
        }

        init {
            content.addView(view, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, a.dp(HEIGHT), Gravity.BOTTOM).apply {
                leftMargin = a.dp(12); rightMargin = a.dp(12); bottomMargin = a.dp(8)
            })
            content.addView(nav, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, a.dp(NAV), Gravity.BOTTOM).apply {
                leftMargin = a.dp(12); rightMargin = a.dp(12); bottomMargin = a.dp(12)
            })
            Swipe.attach(view, onRight = { Playback.next(a) }, onLeft = { Playback.previous(a) })
            // Экран может уходить под системную панель навигации — поднимаем полоску над ней.
            ViewCompat.setOnApplyWindowInsetsListener(view) { _, insets -> place(); insets }
            content.post { place() }
        }

        private fun button(icon: Int, label: String, click: () -> Unit) = ImageView(a).apply {
            setImageResource(icon); setColorFilter(onSurface)
            scaleType = ImageView.ScaleType.CENTER
            contentDescription = label
            setBackgroundResource(android.R.drawable.list_selector_background)
            setOnClickListener { click() }
        }

        fun start() {
            started = true
            Playback.controller(a) { c ->
                if (!started) return@controller
                controller?.removeListener(listener)
                controller = c
                c.addListener(listener)
                update()
            }
        }

        fun stop() {
            started = false
            controller?.removeListener(listener)
            controller = null
        }

        /** Отступ снизу: над панелью навигации, если экран рисуется под ней; содержимое экрана полоской не закрываем. */
        private fun place() {
            val navInset = ViewCompat.getRootWindowInsets(content)?.getInsets(WindowInsetsCompat.Type.systemBars())?.bottom ?: 0
            val under = content.rootView.height > 0 && run {
                val at = IntArray(2); content.getLocationInWindow(at)
                at[1] + content.height >= content.rootView.height
            }
            val sys = if (under) navInset else 0
            (this.nav.layoutParams as FrameLayout.LayoutParams).let { val b = a.dp(12) + sys; if (it.bottomMargin != b) { it.bottomMargin = b; this.nav.layoutParams = it } }
            // Полоска «сейчас играет» — над меню.
            val bottom = a.dp(12 + NAV + 8) + sys
            (view.layoutParams as FrameLayout.LayoutParams).let { if (it.bottomMargin != bottom) { it.bottomMargin = bottom; view.layoutParams = it } }
            val room = a.dp(NAV + 12 + 8) + sys + if (view.isVisible) a.dp(HEIGHT + 8) else 0
            for (i in 0 until content.childCount) {
                val child = content.getChildAt(i)
                if (child === view || child === this.nav) continue
                val lp = child.layoutParams as? FrameLayout.LayoutParams ?: continue
                if (lp.bottomMargin != room) { lp.bottomMargin = room; child.layoutParams = lp }
            }
        }

        private fun update() {
            val c = controller
            val has = !navOnly && c != null && c.mediaItemCount > 0 && c.playbackState != Player.STATE_IDLE
            if (view.isVisible != has) { view.isVisible = has; view.bringToFront(); nav.bringToFront() }
            place()
            if (!has || c == null) return
            val m = c.mediaMetadata
            title.text = m.title ?: "Без названия"
            artist.text = listOfNotNull(m.artist, m.albumTitle).joinToString(" · ")
            artist.isVisible = artist.text.isNotEmpty()
            play.setImageResource(if (c.isPlaying) R.drawable.ic_pause else R.drawable.ic_play_arrow)
            play.contentDescription = if (c.isPlaying) "Пауза" else "Играть"
            next.isVisible = Playback.hasNext(c)
            val art = m.artworkData
            val url = m.artworkUri?.toString()
            when {
                art != null -> {
                    coverUrl = null
                    val artKey = "${m.title}|${m.artist}|${art.size}"
                    if (artKey != coverArtKey) {
                        coverArtKey = artKey
                        artExec.execute {
                            val bmp = runCatching { BitmapFactory.decodeByteArray(art, 0, art.size) }.getOrNull()
                            cover.post {
                                if (started && coverArtKey == artKey) {
                                    if (bmp != null) cover.setImageBitmap(bmp) else cover.setImageResource(R.drawable.ph_cover)
                                }
                            }
                        }
                    }
                }
                url != null && url != coverUrl -> { coverArtKey = null; coverUrl = url; Images.into(cover, url, R.drawable.ph_cover) }
                url == null -> { coverArtKey = null; coverUrl = null; cover.setImageResource(R.drawable.ph_cover) }
            }
        }
    }

    private const val HEIGHT = 60
    private const val NAV = 60
}
