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
     * «Аура дня»: каждое нажатие — новая подборка (радио любимых исполнителей + новые песни по вашим тегам), а не перемешанная
     * прошлая. Следующая готовится заранее, сразу после нажатия, — поэтому играет мгновенно.
     */
    fun playAura(a: Activity, snack: (String) -> Unit) {
        val ready = AuraDay.takeNext(a)
        // Набор не готов — заставка с дымом и шагами сборки на весь экран (вместо всплывающей снизу строки).
        val overlay = if (ready == null) AuraOverlay.show(a).also { it.say("Смотрю, что вы любите…") } else null
        thread {
            val mixed = ready ?: AuraDay.build(a) { msg -> a.runOnUiThread { overlay?.say(msg) } }
            if (mixed.isNotEmpty()) AuraDay.played(a, mixed)
            a.runOnUiThread {
                if (mixed.isEmpty()) { overlay?.say("Нет связи — попробуйте ещё раз"); overlay?.dismiss(1500); if (overlay == null) snack("Нет связи — попробуйте ещё раз") }
                else {
                    overlay?.say("Включаю «${mixed.first().title}»")
                    overlay?.dismiss(500)
                    Playback.playQueue(a, mixed.map { Playback.QItem(it, Library.localFor(it), it.url) }, 0)
                }
                AuraDay.prepare(a, delayMs = 15_000) // следующая — заранее, когда нажатая уже играет
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


/**
 * «Аура дня»: при каждом нажатии — новый набор. Готовый следующий набор лежит в файле (нажатие играет сразу);
 * песни двух прошлых наборов избегаются (повторов не больше четверти), исполнители и рекомендации каждый раз другие.
 */
object AuraDay {
    private fun file(ctx: android.content.Context) = java.io.File(ctx.filesDir, "aura_next.json")
    @Volatile private var building = false

    private fun toJson(list: List<Track>) = org.json.JSONArray(list.map { t -> org.json.JSONObject().put("t", t.title).put("a", t.artist)
        .put("d", t.durationSec).put("c", t.cover ?: "").put("u", t.url ?: "").put("p", t.preview ?: "").put("e", t.explicit) })
    private fun fromJson(arr: org.json.JSONArray?) = (0 until (arr?.length() ?: 0)).map { i -> arr!!.getJSONObject(i).let { j ->
        Track(j.optString("t"), j.optString("a"), j.optInt("d"), cover = j.optString("c").ifEmpty { null },
            url = j.optString("u").ifEmpty { null }, preview = j.optString("p").ifEmpty { null }, explicit = j.optBoolean("e"))
    } }

    @Synchronized private fun read(ctx: android.content.Context): org.json.JSONObject =
        runCatching { org.json.JSONObject(file(ctx).readText()) }.getOrDefault(org.json.JSONObject())
    @Synchronized private fun write(ctx: android.content.Context, o: org.json.JSONObject) { runCatching { file(ctx).writeText(o.toString()) } }

    /** Готовый следующий набор (и он сразу считается использованным). null — ещё не готов. */
    fun takeNext(ctx: android.content.Context): List<Track>? {
        val o = read(ctx)
        val next = fromJson(o.optJSONArray("next")).takeIf { it.isNotEmpty() } ?: return null
        o.remove("next"); write(ctx, o)
        return next
    }

    /** Набор начал играть: запоминаем его, чтобы следующий был другим. */
    fun played(ctx: android.content.Context, list: List<Track>) {
        val o = read(ctx)
        o.put("prev2", o.optJSONArray("prev1") ?: org.json.JSONArray())
        o.put("prev1", org.json.JSONArray(list.map { Library.key(it) }))
        write(ctx, o)
    }

    private fun recent(o: org.json.JSONObject): Set<String> {
        val out = HashSet<String>()
        for (k in listOf("prev1", "prev2")) o.optJSONArray(k)?.let { a -> for (i in 0 until a.length()) out += a.optString(i) }
        return out
    }

    /** Собрать новый набор (сеть). Звать не из главного потока. */
    fun build(ctx: android.content.Context, progress: (String) -> Unit = {}): List<Track> {
        val avoid = recent(read(ctx))
        val rnd = java.util.Random()
        // Каждый раз — другие любимые исполнители (из двенадцати самых любимых).
        val artists = Taste.favoriteArtists(12).shuffled(rnd).take(4)
        progress(if (artists.isEmpty()) "Беру лучшее из чарта…" else "Сегодня в основе:\n${artists.joinToString(", ")}")
        val pool = if (artists.isEmpty()) runCatching { Catalog.chartRu() }.getOrDefault(emptyList()).shuffled(rnd)
        else {
            var got = 0
            val lists = artists.map { name ->
                runCatching { Catalog.radio(Track(name, name), emptyList()) }.getOrDefault(emptyList()).shuffled(rnd)
                    .also { got += it.size; progress("Радио «$name» — ${it.size} песен\nвсего найдено $got") }
            }
            val out = mutableListOf<Track>()
            val seen = HashSet<String>()
            for (i in 0 until (lists.maxOfOrNull { it.size } ?: 0)) for (l in lists) l.getOrNull(i)?.let { if (seen.add(Library.key(it))) out += it }
            out
        }
        // Повторы из прошлых двух наборов — не больше четверти.
        val (old, fresh) = pool.partition { Library.key(it) in avoid }
        val base = (fresh.take(24) + old.shuffled(rnd).take(maxOf(0, minOf(8, 30 - fresh.size.coerceAtMost(24))))).take(30)
        progress(Tags.topCached.takeIf { it.isNotEmpty() }?.let { "Ищу новое по вашим тегам:\n${it.joinToString(" · ")}" } ?: "Ищу новое, похожее на любимое…")
        val recs = runCatching { Recs.today(ctx, 60) }.getOrDefault(emptyList()).filter { Library.key(it) !in avoid }.shuffled(rnd).take(12)
        val keys = base.map { Library.key(it) }.toHashSet()
        val mixed = ArrayList<Track>()
        val ri = recs.filter { Library.key(it) !in keys }.iterator()
        Taste.smart(base) { it }.forEachIndexed { i, t -> mixed += t; if (i % 2 == 1 && ri.hasNext()) mixed += ri.next() }
        ri.forEachRemaining { mixed += it }
        if (mixed.isNotEmpty()) progress("Смешиваю: ${mixed.size} песен,\nиз них новых для вас — ${mixed.size - base.size}")
        if (mixed.isNotEmpty()) AppLog.add("АУРА ДНЯ: собрана — ${mixed.size} песен (исполнители: ${artists.joinToString(", ")}), " +
            "новых по тегам ${mixed.size - base.size}, повторов из прошлых ${mixed.count { Library.key(it) in avoid }}")
        return mixed
    }

    /** Подготовить следующий набор заранее (если его ещё нет) и первые его песни — следующее нажатие играет сразу. */
    fun prepare(ctx: android.content.Context, delayMs: Long = 8_000) {
        if (building) return
        building = true
        thread(name = "aura-next") {
            try {
                Thread.sleep(delayMs)
                Streams.waitForeground()
                val o = read(ctx)
                var next = fromJson(o.optJSONArray("next"))
                if (next.isEmpty()) {
                    next = runCatching { build(ctx) }.getOrDefault(emptyList())
                    if (next.isNotEmpty()) { val cur = read(ctx); cur.put("next", toJson(next)); write(ctx, cur) }
                }
                Streams.prefetchAhead(next.take(2))
            } finally { building = false }
        }
    }
}
