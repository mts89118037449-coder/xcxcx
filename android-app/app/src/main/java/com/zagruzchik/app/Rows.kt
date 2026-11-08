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
        Images.into(row.findViewById(R.id.srCover), t.cover, R.drawable.ic_music_note)
        row.findViewById<TextView>(R.id.srTitle).text = (number?.let { "$it. " } ?: "") + t.title + if (t.explicit) "  🅴" else ""
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
            row.findViewById<View>(R.id.srPlay).setOnTouchListener(touch)
        }
        row.findViewById<View>(R.id.srPlay).setOnClickListener(play)
        if (!video && t.artist.isNotBlank()) row.setOnLongClickListener { openArtist(act, t.artist); true }
        val like = row.findViewById<MaterialButton>(R.id.srLike)
        fun paintLike() = like.setIconResource(if (Library.isSaved(t)) R.drawable.ic_favorite else R.drawable.ic_favorite_border)
        paintLike()
        like.isVisible = !video
        like.setOnClickListener {
            val inCache = MediaCache.has(t)
            val saved = Library.like(act, t, pageUrl ?: directUrl, t.url)
            snack(when {
                !saved -> "Убрано из любимого"
                local != null || !Settings.saveLiked(act) -> "«${t.title}» — в любимом"
                inCache -> "«${t.title}» — в любимом, сохраняю из памяти"
                else -> "«${t.title}» — в любимом, скачиваю на телефон"
            })
            paintLike()
        }
        val dl = row.findViewById<View>(R.id.srDownload)
        dl.isVisible = local == null && !video
        dl.setOnClickListener {
            val u = directUrl ?: pageUrl ?: t.url ?: return@setOnClickListener snack("Эту песню можно только послушать")
            DownloadService.enqueue(act, u, Format.MP3, t.label)
            snack("Скачиваю «${t.title}»")
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
        Images.into(img, image, if (round) R.drawable.ic_person_outline else R.drawable.ic_library_music)
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
