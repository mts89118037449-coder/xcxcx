package com.zagruzchik.app

import android.app.Activity
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.HorizontalScrollView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.view.isVisible
import com.google.android.material.button.MaterialButton
import com.google.android.material.imageview.ShapeableImageView
import com.google.android.material.shape.ShapeAppearanceModel

/** Строки и карточки, общие для главной, поиска и страниц исполнителя/альбома. */
object Rows {

    /** Где песня сейчас: на телефоне, качается, в памяти — чтобы было видно, что включится мгновенно. */
    fun statusOf(t: Track, local: SavedFile?): String? = when {
        local != null || Library.localFor(t) != null -> "на телефоне"
        Library.downloading(t) -> "качается…"
        MediaCache.has(t) -> "в памяти · мгновенно"
        else -> null
    }

    /**
     * Строка песни: обложка, название, ♥, скачать, ▶. Долгое нажатие — страница исполнителя.
     * [pageUrl] — конкретная страница (SoundCloud/YouTube), [local] — уже скачанный файл.
     */
    fun track(
        act: Activity, parent: ViewGroup, t: Track, snack: (String) -> Unit,
        pageUrl: String? = null, local: SavedFile? = null,
        subtitle: String? = null, onPlay: (() -> Unit)? = null,
        directUrl: String? = null, directSource: String? = null,
        status: String? = null, video: Boolean = false, number: Int? = null,
        beforePlay: () -> Unit = {},
    ): View {
        val row = LayoutInflater.from(act).inflate(R.layout.item_search, parent, false)
        // Песня из каталога (не файл и не конкретная страница) — помечаем: пока строка на экране, готовим её к мгновенному старту.
        if (local == null && pageUrl == null && directUrl == null && !video) row.setTag(R.id.libContent, t)
        Images.into(row.findViewById(R.id.srCover), t.cover, R.drawable.ph_cover)
        row.findViewById<TextView>(R.id.srTitle).text = t.title + if (t.explicit) "  🅴" else ""
        row.findViewById<TextView>(R.id.srNumber).apply { isVisible = number != null; text = number?.toString() }
        val d = if (t.durationSec > 0) "%d:%02d".format(t.durationSec / 60, t.durationSec % 60) else null
        val st = status ?: statusOf(t, local)
        row.findViewById<TextView>(R.id.srSub).text = listOfNotNull((subtitle ?: t.artist).ifBlank { null }, d, st).joinToString(" · ")
        val play = View.OnClickListener {
            beforePlay()
            if (onPlay != null) onPlay()
            else Playback.playQueue(act, listOf(Playback.QItem(t, local ?: Library.localFor(t), t.url, pageUrl, directUrl, directSource)), 0)
        }
        row.setOnClickListener(play)
        // Палец задержался на песне (не листание) — уже ищем полную версию, к отпусканию часть работы сделана.
        // При прокрутке ничего не запускаем: иначе десятки поисков забивали очередь и нажатая песня ждала.
        if (!video && local == null && directUrl == null) {
            val slop = android.view.ViewConfiguration.get(act).scaledTouchSlop
            var downX = 0f; var downY = 0f
            val start = Runnable {
                if (Library.localFor(t) == null && !MediaCache.has(t)) {
                    if (pageUrl != null) Streams.prefetchPage(pageUrl, Describe.site(pageUrl), t.title) else Streams.touch(t)
                }
            }
            val touch = View.OnTouchListener { v, e ->
                when (e.actionMasked) {
                    android.view.MotionEvent.ACTION_DOWN -> {
                        downX = e.rawX; downY = e.rawY
                        v.postDelayed(start, android.view.ViewConfiguration.getTapTimeout().toLong())
                    }
                    android.view.MotionEvent.ACTION_MOVE ->
                        if (kotlin.math.abs(e.rawX - downX) > slop || kotlin.math.abs(e.rawY - downY) > slop) v.removeCallbacks(start)
                    android.view.MotionEvent.ACTION_CANCEL -> v.removeCallbacks(start)
                }
                false
            }
            row.setOnTouchListener(touch)
        }
        if (!video && t.artist.isNotBlank()) row.setOnLongClickListener { openArtist(act, t.artist); true }
        // Играет сейчас — столбики ауры справа.
        // Песня уже в «Любимом» — сердечко ауры справа (видно везде: у исполнителя, в альбоме, в поиске).
        row.findViewById<View>(R.id.srLiked).isVisible = !video && Library.isSaved(t)
        val playingNow = Playback.nowPlayingKey == Library.key(t)
        row.findViewById<EqBarsView>(R.id.srEq).apply { isVisible = playingNow; playing(playingNow) }
        row.findViewById<View>(R.id.srMore).apply {
            isVisible = !video
            setOnClickListener {
                TrackActions.show(act, t, snack, pageUrl = pageUrl, directUrl = directUrl, local = local) { liked ->
                    row.findViewById<View>(R.id.srLiked).isVisible = liked
                }
            }
        }
        return row
    }

    /** Горизонтальная лента карточек. */
    fun shelf(act: Activity): Pair<HorizontalScrollView, LinearLayout> {
        val inner = LinearLayout(act).apply { orientation = LinearLayout.HORIZONTAL }
        val scroll = HorizontalScrollView(act).apply {
            isHorizontalScrollBarEnabled = false
            clipToPadding = false
            addView(inner)
        }
        return scroll to inner
    }

    /** Карточка альбома или исполнителя (исполнитель — круглая). */
    fun card(act: Activity, parent: ViewGroup, title: String, sub: String?, image: String?, round: Boolean, onClick: () -> Unit): View {
        val v = LayoutInflater.from(act).inflate(R.layout.item_card, parent, false)
        val img = v.findViewById<ShapeableImageView>(R.id.cardImage)
        if (round) img.shapeAppearanceModel = ShapeAppearanceModel.builder().setAllCornerSizes(ShapeAppearanceModel.PILL).build()
        Images.into(img, image, if (round) R.drawable.ph_artist else R.drawable.ph_cover)
        v.findViewById<TextView>(R.id.cardTitle).apply {
            text = title
            textAlignment = if (round) View.TEXT_ALIGNMENT_CENTER else View.TEXT_ALIGNMENT_VIEW_START
        }
        v.findViewById<TextView>(R.id.cardSub).apply {
            text = sub.orEmpty(); isVisible = !sub.isNullOrBlank()
            textAlignment = if (round) View.TEXT_ALIGNMENT_CENTER else View.TEXT_ALIGNMENT_VIEW_START
        }
        v.setOnClickListener { onClick() }
        return v
    }

    fun albumCard(act: Activity, parent: ViewGroup, a: Album) =
        card(act, parent, a.title + if (a.explicit) " 🅴" else "", listOfNotNull(a.artist.ifBlank { null }, a.year).joinToString(" · "), a.cover, false) { openAlbum(act, a) }

    fun artistCard(act: Activity, parent: ViewGroup, a: Artist) =
        card(act, parent, a.name, null, a.picture, true) { openArtist(act, a) }

    fun openAlbum(act: Activity, a: Album) = act.startActivity(CollectionActivity.album(act, a))
    fun openArtist(act: Activity, a: Artist) = act.startActivity(CollectionActivity.artist(act, a.id, a.name, a.picture))
    fun openArtist(act: Activity, name: String) = act.startActivity(CollectionActivity.artistByName(act, name))
}

/**
 * Мгновенный старт и для новых песен: всё, что видно на экране (поиск, чарт, альбом, исполнитель, медиатека),
 * готовится заранее — находится источник и сохраняется начало полной версии. Нажать можно только на то, что видно,
 * так что к нажатию песня обычно уже готова.
 */
object VisiblePrefetch {
    fun install(a: Activity) {
        val root = a.window.decorView
        val run = Runnable {
            val screen = android.graphics.Rect(0, 0, root.width, root.height)
            val found = mutableListOf<Track>()
            val r = android.graphics.Rect()
            fun walk(v: View) {
                if (found.size >= 14 || v.visibility != View.VISIBLE) return
                (v.getTag(R.id.libContent) as? Track)?.let { t ->
                    if (v.isShown && v.getGlobalVisibleRect(r) && android.graphics.Rect.intersects(r, screen) && !MediaCache.has(t) && !HeadCache.has(t)) found += t
                    return
                }
                if (v is ViewGroup) for (i in 0 until v.childCount) walk(v.getChildAt(i))
            }
            walk(root)
            if (found.isNotEmpty()) Streams.prefetchMany(found, 14)
        }
        val kick = { root.removeCallbacks(run); root.postDelayed(run, 350) }
        root.viewTreeObserver.addOnScrollChangedListener { kick() }
        root.viewTreeObserver.addOnGlobalLayoutListener { kick() }
    }
}
