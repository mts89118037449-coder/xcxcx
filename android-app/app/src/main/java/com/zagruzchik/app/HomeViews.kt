package com.zagruzchik.app

import android.app.Activity
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.content.res.ResourcesCompat
import com.google.android.material.imageview.ShapeableImageView
import com.google.android.material.shape.ShapeAppearanceModel
import kotlin.concurrent.thread

/** Главная SoundAura: «Аура дня» и плитки разделов (вместо длинных списков). */
object HomeViews {

    private fun blob(a: Activity, color: Int, sizeDp: Int, x: Int, y: Int, alpha: Int) = View(a).apply {
        background = GradientDrawable().apply {
            gradientType = GradientDrawable.RADIAL_GRADIENT
            gradientRadius = a.dp(sizeDp / 2).toFloat()
            colors = intArrayOf(androidx.core.graphics.ColorUtils.setAlphaComponent(color, alpha), Color.TRANSPARENT)
        }
        layoutParams = FrameLayout.LayoutParams(a.dp(sizeDp), a.dp(sizeDp)).apply { leftMargin = a.dp(x); topMargin = a.dp(y) }
    }

    private fun text(a: Activity, s: String, sizeSp: Float, font: Int, color: Int) = TextView(a).apply {
        text = s; textSize = sizeSp; setTextColor(color)
        typeface = ResourcesCompat.getFont(a, font)
    }

    /** Кольца из логотипа — декор в углу карточки. */
    private class Rings(a: Activity) : View(a) {
        private val p = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply {
            style = android.graphics.Paint.Style.STROKE; strokeWidth = a.dp(1).toFloat() * 1.5f; color = Color.WHITE
        }
        override fun onDraw(c: android.graphics.Canvas) {
            val cx = width / 2f; val cy = height / 2f
            listOf(0.96f to 36, 0.71f to 52, 0.47f to 76).forEach { (k, alpha) ->
                p.alpha = alpha; c.drawCircle(cx, cy, width / 2f * k, p)
            }
        }
    }

    /** Большая карточка «Аура дня»: радио по вашему вкусу. */
    fun hero(a: Activity, subtitle: String, onPlay: () -> Unit): View {
        val card = FrameLayout(a).apply {
            background = a.getDrawable(R.drawable.bg_card)
            clipToOutline = true
            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, a.dp(210)).apply { bottomMargin = a.dp(12) }
        }
        card.addView(blob(a, AuraColors.c1(a), 340, -120, -150, 0xE6))
        card.addView(blob(a, AuraColors.c3(a), 320, 150, 40, 0xCC))
        card.addView(Rings(a), FrameLayout.LayoutParams(a.dp(230), a.dp(230), Gravity.END).apply { rightMargin = -a.dp(50); topMargin = -a.dp(10) })
        val col = LinearLayout(a).apply { orientation = LinearLayout.VERTICAL; setPadding(a.dp(22), a.dp(20), a.dp(22), a.dp(20)) }
        col.addView(text(a, "РАДИО ПО ВАШЕМУ ВКУСУ", 11f, R.font.onest_semibold, 0xCCFFFFFF.toInt()).apply { letterSpacing = 0.1f })
        col.addView(text(a, "Аура дня", 30f, R.font.unbounded_bold, Color.WHITE).apply { letterSpacing = -0.02f; setPadding(0, a.dp(4), 0, 0) })
        col.addView(text(a, subtitle, 14f, R.font.onest_regular, 0xDDFFFFFF.toInt()).apply {
            maxWidth = a.dp(230); setPadding(0, a.dp(4), 0, 0); maxLines = 2
        })
        col.addView(View(a), LinearLayout.LayoutParams(1, 0, 1f))
        val row = LinearLayout(a).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
        row.addView(ImageView(a).apply {
            setImageResource(R.drawable.ic_play_arrow); setColorFilter(0xFF0B0A0F.toInt())
            background = GradientDrawable().apply { shape = GradientDrawable.OVAL; setColor(Color.WHITE) }
            setPadding(a.dp(14), a.dp(14), a.dp(14), a.dp(14))
            contentDescription = "Слушать «Ауру дня»"
            setOnClickListener { onPlay() }
        }, LinearLayout.LayoutParams(a.dp(56), a.dp(56)))
        row.addView(EqBarsView(a).apply { playing(true) }, LinearLayout.LayoutParams(a.dp(26), a.dp(22)).apply { leftMargin = a.dp(14) })
        col.addView(row)
        card.addView(col, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        card.setOnClickListener { onPlay() }
        return card
    }

    /** Плитка раздела: заголовок, подпись, обложки-превью, необязательная плашка («3 новых»). */
    fun tile(a: Activity, title: String, sub: String, covers: List<String?>, badge: String?, foot: String?, tall: Boolean, onClick: () -> Unit): View {
        val onSurface = com.google.android.material.color.MaterialColors.getColor(a, com.google.android.material.R.attr.colorOnSurface, Color.WHITE)
        val muted = com.google.android.material.color.MaterialColors.getColor(a, com.google.android.material.R.attr.colorOnSurfaceVariant, Color.GRAY)
        val v = LinearLayout(a).apply {
            orientation = LinearLayout.VERTICAL
            background = a.getDrawable(R.drawable.bg_card)
            setPadding(a.dp(16), a.dp(14), a.dp(16), a.dp(14))
            isClickable = true; isFocusable = true
            setOnClickListener { onClick() }
        }
        val head = LinearLayout(a).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.TOP }
        head.addView(text(a, title, if (tall) 15f else 13.5f, R.font.unbounded_semibold, onSurface).apply { maxLines = 1; ellipsize = android.text.TextUtils.TruncateAt.END },
            LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        if (badge != null) head.addView(text(a, badge, 11f, R.font.onest_bold, Color.WHITE).apply {
            background = AuraColors.drawable(a, a.dp(11).toFloat(), GradientDrawable.Orientation.LEFT_RIGHT)
            setPadding(a.dp(8), a.dp(3), a.dp(8), a.dp(3))
        })
        v.addView(head)
        v.addView(text(a, sub, 12f, R.font.onest_regular, muted).apply { setPadding(0, a.dp(3), 0, 0); maxLines = if (tall) 1 else 2; ellipsize = android.text.TextUtils.TruncateAt.END })
        if (tall) {
            v.addView(View(a), LinearLayout.LayoutParams(1, 0, 1f))
            val strip = LinearLayout(a).apply { orientation = LinearLayout.HORIZONTAL }
            covers.take(3).forEachIndexed { i, url ->
                val img = ShapeableImageView(a).apply {
                    scaleType = ImageView.ScaleType.CENTER_CROP
                    shapeAppearanceModel = ShapeAppearanceModel.builder().setAllCornerSizes(a.dp(12).toFloat()).build()
                    strokeColor = android.content.res.ColorStateList.valueOf(androidx.core.content.ContextCompat.getColor(a, R.color.card))
                    strokeWidth = a.dp(2).toFloat()
                    setPadding(a.dp(1), a.dp(1), a.dp(1), a.dp(1))
                    elevation = (3 - i).toFloat()
                }
                Images.into(img, url, R.drawable.ph_cover)
                strip.addView(img, LinearLayout.LayoutParams(a.dp(52), a.dp(52)).apply { if (i > 0) leftMargin = -a.dp(16) })
            }
            v.addView(strip)
            if (foot != null) v.addView(text(a, foot, 13f, R.font.onest_semibold, onSurface).apply { setPadding(0, a.dp(8), 0, 0); maxLines = 1; ellipsize = android.text.TextUtils.TruncateAt.END })
        } else {
            v.addView(View(a), LinearLayout.LayoutParams(1, 0, 1f))
        }
        return v
    }

    /** Сетка 2×N плиток. */
    fun grid(a: Activity, rows: List<Pair<View, View>>, heightsDp: List<Int>): View {
        val col = LinearLayout(a).apply { orientation = LinearLayout.VERTICAL }
        rows.forEachIndexed { i, (l, r) ->
            val row = LinearLayout(a).apply { orientation = LinearLayout.HORIZONTAL }
            row.addView(l, LinearLayout.LayoutParams(0, a.dp(heightsDp[i]), 1f).apply { rightMargin = a.dp(6) })
            row.addView(r, LinearLayout.LayoutParams(0, a.dp(heightsDp[i]), 1f).apply { leftMargin = a.dp(6) })
            col.addView(row, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { bottomMargin = a.dp(12) })
        }
        return col
    }

    /**
     * «Аура дня»: радио любимых исполнителей вперемешку, по вашему вкусу.
     * Если любимых пока нет — чарт России в «умном» порядке.
     */
    fun playAura(a: Activity, snack: (String) -> Unit) {
        snack("Собираю «Ауру дня»…")
        thread {
            val artists = Taste.favoriteArtists(4)
            val mixed = if (artists.isEmpty()) runCatching { Catalog.chartRu() }.getOrDefault(emptyList()).shuffled()
            else {
                val lists = artists.map { name -> runCatching { Catalog.radio(Track(name, name), emptyList()) }.getOrDefault(emptyList()) }
                val out = mutableListOf<Track>()
                val seen = HashSet<String>()
                for (i in 0 until (lists.maxOfOrNull { it.size } ?: 0)) for (l in lists) l.getOrNull(i)?.let { if (seen.add(Library.key(it))) out += it }
                Taste.smart(out.take(40)) { it }
            }
            a.runOnUiThread {
                if (mixed.isEmpty()) snack("Нет связи — попробуйте ещё раз")
                else Playback.playQueue(a, mixed.map { Playback.QItem(it, Library.localFor(it), it.url) }, 0)
            }
        }
    }

    /** Радио от последней песни (или любимого исполнителя). */
    fun playRadio(a: Activity, snack: (String) -> Unit) {
        val seed = History.all.firstOrNull { it.kind == Kind.MUSIC && it.track.artist.isNotBlank() }?.track
            ?: Taste.favoriteArtists(1).firstOrNull()?.let { Track(it, it) }
            ?: return snack("Включите любую песню — радио подберёт похожее")
        snack("Радио: похоже на «${seed.artist}»")
        thread {
            val list = runCatching { Catalog.radio(seed, emptyList()) }.getOrDefault(emptyList())
            a.runOnUiThread {
                if (list.isEmpty()) snack("Радио сейчас недоступно")
                else Playback.playQueue(a, list.map { Playback.QItem(it, Library.localFor(it), it.url) }, 0)
            }
        }
    }
}
