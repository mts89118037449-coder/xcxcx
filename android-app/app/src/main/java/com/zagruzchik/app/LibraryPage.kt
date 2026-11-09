package com.zagruzchik.app

import android.app.Activity
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.GridLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.content.res.ResourcesCompat
import androidx.core.view.isVisible
import com.google.android.material.color.MaterialColors
import kotlin.concurrent.thread

/**
 * Медиатека: подвкладки Песни · Исполнители · Альбомы · Плейлисты · Скачано · История.
 * [row] — строка песни (общая с остальными экранами).
 */
class LibraryPage(
    private val a: Activity,
    private val snack: (String) -> Unit,
    private val row: (parent: ViewGroup, t: Track, local: SavedFile?, status: String?, video: Boolean, onPlay: () -> Unit) -> View,
) {
    enum class Tab(val label: String) { SONGS("Песни"), ARTISTS("Исполнители"), ALBUMS("Альбомы"), PLAYLISTS("Плейлисты"), DOWNLOADED("Скачано"), HISTORY("История") }
    enum class Sort(val label: String) { RECENT("Недавние"), ABC("По алфавиту"), OFTEN("Часто") }

    private var tab = Tab.SONGS
    private var sort = Sort.RECENT
    private val bar: LinearLayout = a.findViewById(R.id.libTabBar)
    private val content: LinearLayout = a.findViewById(R.id.libContent)
    private val onSurface = MaterialColors.getColor(a, com.google.android.material.R.attr.colorOnSurface, Color.WHITE)
    private val muted = MaterialColors.getColor(a, com.google.android.material.R.attr.colorOnSurfaceVariant, Color.GRAY)

    init {
        a.findViewById<View>(R.id.libShuffleAll).setOnClickListener {
            val items = songs().shuffled()
            if (items.isEmpty()) snack("Медиатека пока пуста — ставьте ♥ песням") else Playback.playQueue(a, items, 0)
        }
        buildTabs()
    }

    private fun font(id: Int) = ResourcesCompat.getFont(a, id)

    private fun buildTabs() {
        bar.removeAllViews()
        Tab.entries.forEach { t ->
            val on = t == tab
            val cell = LinearLayout(a).apply {
                orientation = LinearLayout.VERTICAL
                setPadding(a.dp(8), a.dp(4), a.dp(8), 0)
                isClickable = true; isFocusable = true
                setOnClickListener { tab = t; buildTabs(); refresh() }
            }
            cell.addView(TextView(a).apply {
                text = t.label; textSize = 15f; typeface = font(R.font.onest_semibold)
                setTextColor(if (on) onSurface else muted)
            })
            // Подчёркивание активной вкладки — градиентом ауры.
            cell.addView(View(a).apply {
                background = if (on) AuraColors.drawable(a, a.dp(2).toFloat(), GradientDrawable.Orientation.LEFT_RIGHT) else null
            }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, a.dp(3)).apply { topMargin = a.dp(10) })
            bar.addView(cell)
        }
    }

    /** Любимые песни в выбранном порядке. */
    private fun songs(): List<Playback.QItem> {
        val fav = Library.favorites
        val sorted = when (sort) {
            Sort.RECENT -> fav
            Sort.ABC -> fav.sortedBy { it.title.lowercase() }
            Sort.OFTEN -> Taste.smartStable(fav) { it }
        }
        return sorted.map { Playback.QItem(it, Library.localFor(it), it.url) }
    }

    private fun empty(text: String) {
        content.addView(TextView(a).apply {
            this.text = text; textSize = 15f; setTextColor(muted); gravity = Gravity.CENTER
            setPadding(a.dp(16), a.dp(48), a.dp(16), a.dp(16)); setLineSpacing(0f, 1.3f)
        })
    }

    fun refresh() {
        content.removeAllViews()
        when (tab) {
            Tab.SONGS -> songsTab()
            Tab.ARTISTS -> artistsTab()
            Tab.ALBUMS -> albumsTab()
            Tab.PLAYLISTS -> playlistsTab()
            Tab.DOWNLOADED -> downloadedTab()
            Tab.HISTORY -> historyTab()
        }
    }

    /** «Умный микс» — карточка ауры с кнопкой. */
    private fun mixCard(title: String, sub: String, onPlay: () -> Unit): View {
        val card = FrameLayout(a).apply {
            background = a.getDrawable(R.drawable.bg_card); clipToOutline = true
            isClickable = true; setOnClickListener { onPlay() }
        }
        fun blob(color: Int, size: Int, x: Int, y: Int) = View(a).apply {
            background = GradientDrawable().apply {
                gradientType = GradientDrawable.RADIAL_GRADIENT; gradientRadius = a.dp(size / 2).toFloat()
                colors = intArrayOf(androidx.core.graphics.ColorUtils.setAlphaComponent(color, 0xD0), Color.TRANSPARENT)
            }
            layoutParams = FrameLayout.LayoutParams(a.dp(size), a.dp(size)).apply { leftMargin = a.dp(x); topMargin = a.dp(y) }
        }
        card.addView(blob(AuraColors.c1(a), 240, -70, -90))
        card.addView(blob(AuraColors.c3(a), 220, 70, -40))
        val rowV = LinearLayout(a).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL; setPadding(a.dp(16), 0, a.dp(16), 0) }
        val col = LinearLayout(a).apply { orientation = LinearLayout.VERTICAL }
        col.addView(TextView(a).apply { text = title; textSize = 17f; typeface = font(R.font.unbounded_semibold); setTextColor(Color.WHITE) })
        col.addView(TextView(a).apply { text = sub; textSize = 13f; setTextColor(0xCCFFFFFF.toInt()); setPadding(0, a.dp(4), 0, 0) })
        rowV.addView(col, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        rowV.addView(ImageView(a).apply {
            setImageResource(R.drawable.ic_play_arrow); setColorFilter(0xFF0B0A0F.toInt())
            background = GradientDrawable().apply { shape = GradientDrawable.OVAL; setColor(Color.WHITE) }
            setPadding(a.dp(13), a.dp(13), a.dp(13), a.dp(13)); contentDescription = "Слушать"
            setOnClickListener { onPlay() }
        }, LinearLayout.LayoutParams(a.dp(52), a.dp(52)))
        card.addView(rowV, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        card.layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, a.dp(92)).apply { bottomMargin = a.dp(14) }
        return card
    }

    private fun songsTab() {
        val items = songs()
        if (items.isEmpty()) return empty("Ставьте ♥ песням — они появятся здесь,\nсохранятся на телефон и будут играть даже без интернета.")
        content.addView(mixCard("Умный микс", "${items.size} любимых · самое ваше — чаще") {
            Playback.playQueue(a, Taste.smart(items) { it.track }, 0)
        })
        // Порядок: недавние, по алфавиту, часто слушаемые.
        val chips = LinearLayout(a).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
        Sort.entries.forEach { s ->
            val on = s == sort
            chips.addView(TextView(a).apply {
                text = s.label; textSize = 13f; typeface = font(if (on) R.font.onest_semibold else R.font.onest_regular)
                setTextColor(if (on) onSurface else muted)
                setPadding(a.dp(12), a.dp(7), a.dp(12), a.dp(7))
                background = GradientDrawable().apply {
                    cornerRadius = a.dp(16).toFloat()
                    if (on) setColor(MaterialColors.getColor(a, com.google.android.material.R.attr.colorSurfaceContainerHighest, Color.DKGRAY))
                    else setStroke(a.dp(1), androidx.core.content.ContextCompat.getColor(a, R.color.line))
                }
                setOnClickListener { sort = s; refresh() }
            }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { rightMargin = a.dp(6) })
        }
        content.addView(chips, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { bottomMargin = a.dp(6) })
        items.forEachIndexed { i, q ->
            content.addView(row(content, q.track, q.local, Rows.statusOf(q.track, q.local), false) { Playback.playQueue(a, items, i) })
        }
    }

    /** Исполнители из любимого и скачанного: сетка кругов, число песен; фото — фоном. */
    private fun artistsTab() {
        val all = (Library.favorites + Library.downloaded().map { it.first }).filter { it.artist.isNotBlank() }
        val groups = all.groupBy { it.artist.split(Regex("""\s*(,|&| feat\.? | ft\.? )\s*""", RegexOption.IGNORE_CASE)).first().trim() }
            .mapValues { (_, l) -> l.distinctBy { Library.key(it) } }
            .entries.sortedByDescending { it.value.size }
        if (groups.isEmpty()) return empty("Здесь появятся исполнители песен,\nкоторые вы любите и скачиваете.")
        content.addView(TextView(a).apply { text = "${groups.size} исполнителей · из любимого и скачанного"; textSize = 13f; setTextColor(muted); setPadding(0, 0, 0, a.dp(12)) })
        val grid = GridLayout(a).apply { columnCount = 3 }
        val fresh = News.releases.map { Match.norm(it.album.artist) }.toSet()
        groups.forEach { (name, list) ->
            val cell = LinearLayout(a).apply {
                orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER_HORIZONTAL
                setPadding(0, 0, 0, a.dp(16)); isClickable = true
                setOnClickListener { Rows.openArtist(a, name) }
            }
            val ring = FrameLayout(a).apply {
                // Кольцо ауры — у исполнителей с новинками.
                background = if (Match.norm(name) in fresh) GradientDrawable(GradientDrawable.Orientation.TL_BR, intArrayOf(AuraColors.c1(a), AuraColors.c2(a), AuraColors.c3(a))).apply { shape = GradientDrawable.OVAL } else null
                setPadding(a.dp(3), a.dp(3), a.dp(3), a.dp(3))
            }
            val img = com.google.android.material.imageview.ShapeableImageView(a).apply {
                scaleType = ImageView.ScaleType.CENTER_CROP
                shapeAppearanceModel = com.google.android.material.shape.ShapeAppearanceModel.builder().setAllCornerSizes(com.google.android.material.shape.ShapeAppearanceModel.PILL).build()
                setImageResource(R.drawable.ph_artist)
            }
            ring.addView(img, FrameLayout.LayoutParams(a.dp(92), a.dp(92)))
            cell.addView(ring)
            cell.addView(TextView(a).apply { text = name; textSize = 14f; typeface = font(R.font.onest_semibold); setTextColor(onSurface); gravity = Gravity.CENTER; maxLines = 1; setPadding(0, a.dp(8), 0, 0) })
            cell.addView(TextView(a).apply { text = songsWord(list.size); textSize = 12f; setTextColor(muted) })
            grid.addView(cell, GridLayout.LayoutParams(GridLayout.spec(GridLayout.UNDEFINED), GridLayout.spec(GridLayout.UNDEFINED, 1f)).apply { width = 0 })
            thread { val ar = runCatching { Catalog.artistByName(name) }.getOrNull(); a.runOnUiThread { ar?.picture?.let { Images.into(img, it, R.drawable.ph_artist) } } }
        }
        content.addView(grid)
    }

    private fun songsWord(n: Int) = "$n " + when {
        n % 100 in 11..14 -> "песен"; n % 10 == 1 -> "песня"; n % 10 in 2..4 -> "песни"; else -> "песен"
    }

    /** Альбомы: сохранённые (♥ на странице альбома) и скачанные целиком. */
    private fun albumsTab() {
        val saved = Library.albums
        val downloaded = Jobs.all.filter { it.status == Status.DONE && it.kind == Kind.MUSIC && it.files.size > 1 }
        if (saved.isEmpty() && downloaded.isEmpty()) return empty("Откройте альбом и нажмите ♥ —\nон появится здесь. Скачанные альбомы — тоже.")
        val grid = GridLayout(a).apply { columnCount = 2 }
        fun add(title: String, sub: String, cover: String?, click: () -> Unit) {
            val cell = LinearLayout(a).apply { orientation = LinearLayout.VERTICAL; setPadding(a.dp(4), 0, a.dp(4), a.dp(16)); isClickable = true; setOnClickListener { click() } }
            val img = com.google.android.material.imageview.ShapeableImageView(a).apply {
                scaleType = ImageView.ScaleType.CENTER_CROP
                shapeAppearanceModel = com.google.android.material.shape.ShapeAppearanceModel.builder().setAllCornerSizes(a.dp(16).toFloat()).build()
                Images.into(this, cover, R.drawable.ph_cover)
            }
            cell.addView(img, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, a.dp(156)))
            cell.addView(TextView(a).apply { text = title; textSize = 14f; typeface = font(R.font.onest_semibold); setTextColor(onSurface); maxLines = 1; ellipsize = android.text.TextUtils.TruncateAt.END; setPadding(0, a.dp(8), 0, 0) })
            cell.addView(TextView(a).apply { text = sub; textSize = 12f; setTextColor(muted); maxLines = 1 })
            grid.addView(cell, GridLayout.LayoutParams(GridLayout.spec(GridLayout.UNDEFINED), GridLayout.spec(GridLayout.UNDEFINED, 1f)).apply { width = 0 })
        }
        saved.forEach { al -> add(al.title + if (al.explicit) " 🅴" else "", listOfNotNull(al.artist, al.year).joinToString(" · "), al.cover) { Rows.openAlbum(a, al) } }
        downloaded.forEach { j ->
            add(j.title, "скачан · ${songsWord(j.files.size)}", j.coverUrl) {
                Playback.play(a, j.files.filter { it.mime.startsWith("audio") }.map { it to j.title }, 0)
            }
        }
        content.addView(grid)
    }

    /** Подборки, которые собираются сами. */
    private fun playlistsTab() {
        val fav = Library.favorites
        val history = History.all.filter { it.kind == Kind.MUSIC }
        fun q(l: List<Track>) = l.map { Playback.QItem(it, Library.localFor(it), it.url) }
        val lists = listOf(
            Triple("Умный микс", "любимое, самое ваше — чаще", { Taste.smart(q(fav)) { it.track } }),
            Triple("Часто слушаю", "по вашим прослушиваниям", { q(Taste.smartStable(history.map { it.track }.distinctBy { Library.key(it) }) { it }.take(50)) }),
            Triple("Недавно добавленные", "последние ♥", { q(fav.take(30)) }),
            Triple("Новинки для вас", "свежие релизы ваших исполнителей", { q(News.tracks) }),
            Triple("Без интернета", "всё, что на телефоне", { Library.downloaded().map { (t, f) -> Playback.QItem(t, f) } }),
        )
        lists.forEachIndexed { i, (title, sub, make) ->
            val r = LinearLayout(a).apply {
                orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL; minimumHeight = a.dp(76)
                isClickable = true; isFocusable = true
                setOnClickListener {
                    val items = make()
                    if (items.isEmpty()) snack("Пока пусто") else Playback.playQueue(a, items, 0)
                }
            }
            // Обложка подборки — свой оттенок ауры.
            r.addView(FrameLayout(a).apply {
                background = GradientDrawable(GradientDrawable.Orientation.TL_BR, intArrayOf(AuraColors.at(a, i / 5f), AuraColors.at(a, (i + 2) / 6f))).apply { cornerRadius = a.dp(14).toFloat() }
                addView(ImageView(a).apply { setImageResource(R.drawable.ic_launcher_foreground) }, FrameLayout.LayoutParams(a.dp(60), a.dp(60), Gravity.CENTER))
            }, LinearLayout.LayoutParams(a.dp(60), a.dp(60)))
            val col = LinearLayout(a).apply { orientation = LinearLayout.VERTICAL; setPadding(a.dp(14), 0, 0, 0) }
            col.addView(TextView(a).apply { text = title; textSize = 16f; typeface = font(R.font.onest_semibold); setTextColor(onSurface) })
            col.addView(TextView(a).apply { text = sub; textSize = 13f; setTextColor(muted) })
            r.addView(col)
            content.addView(r, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { bottomMargin = a.dp(8) })
        }
    }

    /** Скачанная музыка и видео. */
    private fun downloadedTab() {
        val music = Library.downloaded()
        val videos = Jobs.all.filter { it.status == Status.DONE && it.kind == Kind.VIDEO }
        if (music.isEmpty() && videos.isEmpty()) return empty("Скачанного пока нет.\nСкачайте песню или поставьте ♥ — она появится здесь.")
        val items = music.map { (t, f) -> Playback.QItem(t, f) }
        items.forEachIndexed { i, q -> content.addView(row(content, q.track, q.local, "на телефоне", false) { Playback.playQueue(a, items, i) }) }
        if (videos.isNotEmpty()) {
            content.addView(TextView(a, null, 0, R.style.SectionTitle).apply { text = "Видео" })
            videos.forEach { j ->
                content.addView(row(content, Track(j.title, j.site, cover = j.coverUrl), null, "видео", true) { Playback.play(a, j.files.map { it to null }, 0) })
            }
        }
    }

    private fun historyTab() {
        val all = History.all
        if (all.isEmpty()) return empty("Здесь будет всё, что вы слушали и смотрели.\nПовторное включение — мгновенно.")
        all.forEach { e ->
            val local = e.local ?: if (e.kind == Kind.MUSIC) Library.localFor(e.track) else null
            val video = e.kind == Kind.VIDEO
            content.addView(row(content, e.track, local, listOfNotNull(if (video) "видео" else Rows.statusOf(e.track, local), ago(e.time)).joinToString(" · "), video) {
                when {
                    local != null -> Playback.play(a, listOf(local to null), 0)
                    video && e.pageUrl != null -> Playback.playVideoPage(a, e.pageUrl, e.track.title)
                    else -> Playback.playQueue(a, listOf(Playback.QItem(e.track, null, e.sourceUrl, e.pageUrl)), 0)
                }
            })
        }
    }

    private fun ago(time: Long): String {
        val m = (System.currentTimeMillis() - time) / 60000
        return when {
            m < 1 -> "только что"
            m < 60 -> "$m мин назад"
            m < 60 * 24 -> "${m / 60} ч назад"
            else -> "${m / 60 / 24} дн назад"
        }
    }

    @Suppress("unused") private fun hide(v: View) { v.isVisible = false }
}
