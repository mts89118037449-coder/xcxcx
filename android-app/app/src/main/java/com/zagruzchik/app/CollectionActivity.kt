package com.zagruzchik.app

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.isVisible
import com.google.android.material.imageview.ShapeableImageView
import com.google.android.material.shape.ShapeAppearanceModel
import com.google.android.material.snackbar.Snackbar
import kotlin.concurrent.thread

/** Страница исполнителя (популярное, альбомы, похожие, радио) или альбома (все треки). */
class CollectionActivity : AppCompatActivity() {

    private lateinit var content: LinearLayout
    private var tracks: List<Track> = emptyList()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_collection)
        content = findViewById(R.id.colContent)
        findViewById<View>(R.id.colBack).setOnClickListener { finish() }
        findViewById<View>(R.id.colPlay).setOnClickListener { playAll(shuffle = false) }
        findViewById<View>(R.id.colShuffle).setOnClickListener { playAll(shuffle = true) }

        val i = intent
        val title = i.getStringExtra(X_TITLE).orEmpty()
        findViewById<TextView>(R.id.colTitle).text = title
        Images.into(findViewById(R.id.colImage), i.getStringExtra(X_IMAGE), R.drawable.ph_cover)
        when (i.getStringExtra(X_KIND)) {
            KIND_LIST -> loadList(i.getStringExtra(X_ID_S).orEmpty())
            KIND_ALBUM -> loadAlbum(
                Album(i.getLongExtra(X_ID, 0).takeIf { it > 0 }, title, i.getStringExtra(X_ARTIST).orEmpty(), i.getStringExtra(X_IMAGE))
            )
            else -> {
                // Исполнитель — фото на всю ширину, имя поверх.
                findViewById<View>(R.id.colHero).isVisible = true
                findViewById<View>(R.id.colHead).isVisible = false
                findViewById<TextView>(R.id.colHeroName).text = title
                Images.load(i.getStringExtra(X_IMAGE)) { findViewById<android.widget.ImageView>(R.id.colHeroImage).setImageBitmap(it) }
                loadArtist(i.getLongExtra(X_ID, 0).takeIf { it > 0 }, title)
            }
        }
    }

    private fun loadAlbum(a: Album) {
        findViewById<TextView>(R.id.colSub).text = a.artist
        thread {
            val r = runCatching { Catalog.album(a) }
            runOnUiThread {
                if (isDestroyed) return@runOnUiThread
                findViewById<View>(R.id.colProgress).isVisible = false
                r.onFailure { return@runOnUiThread error(it) }
                val (full, list) = r.getOrThrow()
                findViewById<TextView>(R.id.colTitle).text = full.title + if (full.explicit) "  🅴" else ""
                val total = list.sumOf { it.durationSec }
                findViewById<TextView>(R.id.colSub).apply {
                    text = listOfNotNull(full.artist, full.year, "${list.size} ${plural(list.size, "трек", "трека", "треков")}",
                        if (total > 0) "${total / 60} мин" else null).joinToString(" · ")
                    setOnClickListener { Rows.openArtist(this@CollectionActivity, full.artist) }
                }
                Images.into(findViewById(R.id.colImage), full.cover, R.drawable.ph_cover)
                // ♥ — альбом в медиатеку (вкладка «Альбомы»).
                findViewById<android.widget.ImageButton>(R.id.colLike).apply {
                    isVisible = true
                    fun paint() = setImageResource(if (Library.isAlbumSaved(full)) R.drawable.ic_favorite else R.drawable.ic_favorite_border)
                    paint()
                    setOnClickListener { snack(if (Library.toggleAlbum(full)) "Альбом — в медиатеке" else "Альбом убран из медиатеки"); paint() }
                }
                tracks = list
                showTracks(list, numbered = true)
                Streams.prefetchMany(list, 6)
            }
        }
    }

    /** Чарт России, мировой чарт или новинки — полный список с «Слушать». */
    private fun loadList(which: String) {
        val (name, sub) = when (which) {
            LIST_RU -> "Чарт России" to "Apple Music · обновляется каждый день"
            LIST_WORLD -> "Мировой чарт" to "Deezer · самое популярное в мире"
            else -> "Новинки для вас" to "Свежие релизы ваших исполнителей"
        }
        findViewById<TextView>(R.id.colTitle).text = name
        findViewById<TextView>(R.id.colSub).text = sub
        findViewById<android.widget.ImageView>(R.id.colImage).setImageResource(R.drawable.ic_logo_mark)
        thread {
            val list = runCatching {
                when (which) {
                    LIST_RU -> Catalog.chartRu()
                    LIST_WORLD -> Catalog.chartWorld()
                    else -> News.tracks
                }
            }
            runOnUiThread {
                if (isDestroyed) return@runOnUiThread
                findViewById<View>(R.id.colProgress).isVisible = false
                list.onFailure { return@runOnUiThread error(it) }
                val l = list.getOrThrow()
                if (l.isEmpty()) return@runOnUiThread error(UserError(if (which == LIST_NEWS) "Ставьте ♥ песням — здесь появятся новинки ваших исполнителей" else "Не загрузилось. Проверьте интернет."))
                tracks = l
                showTracks(l, numbered = which != LIST_NEWS)
                Streams.prefetchMany(l, 6)
            }
        }
    }

    private fun loadArtist(id: Long?, name: String) {
        findViewById<TextView>(R.id.colSub).text = "Исполнитель"
        thread {
            val r = runCatching {
                val artistId = id ?: Catalog.artistByName(name)?.id ?: throw UserError("Исполнитель «$name» не нашёлся в каталоге")
                Catalog.artist(artistId)
            }
            runOnUiThread {
                if (isDestroyed) return@runOnUiThread
                findViewById<View>(R.id.colProgress).isVisible = false
                r.onFailure { return@runOnUiThread error(it) }
                val p = r.getOrThrow()
                findViewById<TextView>(R.id.colHeroName).text = p.artist.name
                findViewById<TextView>(R.id.colHeroSub).text =
                    if (p.artist.fans > 0) "${fans(p.artist.fans)} слушателей" else "Исполнитель"
                p.artist.picture?.let { url -> Images.load(url) { findViewById<android.widget.ImageView>(R.id.colHeroImage).setImageBitmap(it) } }
                findViewById<View>(R.id.colRadio).apply {
                    isVisible = true
                    setOnClickListener { radio(p.artist) }
                }
                tracks = p.top
                if (p.top.isNotEmpty()) {
                    section("Популярное")
                    showTracks(p.top, numbered = true)
                    Streams.prefetchMany(p.top, 6)
                }
                // Альбомы и синглы — отдельно, новые первыми.
                for ((title, list) in listOf("Альбомы" to p.longPlays, "Синглы и EP" to p.singles)) {
                    if (list.isEmpty()) continue
                    section(title)
                    val (scroll, inner) = Rows.shelf(this)
                    list.forEach { inner.addView(Rows.albumCard(this, inner, it)) }
                    content.addView(scroll)
                }
                if (p.related.isNotEmpty()) {
                    section("Похожие исполнители")
                    val (scroll, inner) = Rows.shelf(this)
                    p.related.forEach { inner.addView(Rows.artistCard(this, inner, it)) }
                    content.addView(scroll)
                }
            }
        }
    }

    private fun showTracks(list: List<Track>, numbered: Boolean) {
        findViewById<View>(R.id.colButtons).isVisible = list.isNotEmpty()
        val items = list.map { Playback.QItem(it, Library.localFor(it), it.url) }
        list.forEachIndexed { i, t ->
            content.addView(Rows.track(this, content, t, ::snack, local = items[i].local, number = if (numbered) i + 1 else null,
                onPlay = { Playback.playQueue(this, items, i) }))
        }
    }

    private fun playAll(shuffle: Boolean) {
        val items = tracks.map { Playback.QItem(it, Library.localFor(it), it.url) }.let { if (shuffle) it.shuffled() else it }
        Playback.playQueue(this, items, 0)
    }

    /** Радио исполнителя: его песни вперемешку с похожими, бесконечно. */
    private fun radio(a: Artist) {
        snack("Включаю радио «${a.name}»…")
        thread {
            val list = runCatching { Catalog.radio(Track(a.name, a.name), emptyList()) }.getOrDefault(emptyList())
            runOnUiThread {
                if (list.isEmpty()) snack("Радио сейчас недоступно")
                else Playback.playQueue(this, list.map { Playback.QItem(it, Library.localFor(it), it.url) }, 0)
            }
        }
    }

    private fun section(title: String) {
        content.addView(TextView(this, null, 0, R.style.SectionTitle).apply {
            text = title
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
                topMargin = dp(20); bottomMargin = dp(8); marginStart = dp(4)
            }
        })
    }

    private fun error(e: Throwable) {
        findViewById<TextView>(R.id.colError).apply {
            isVisible = true
            text = (e as? UserError)?.message ?: "Не удалось загрузить. Проверьте интернет."
        }
    }

    private fun snack(text: String) = Snackbar.make(content, text, Snackbar.LENGTH_SHORT).show()

    private fun fans(n: Int) = when {
        n >= 1_000_000 -> "%.1f млн".format(n / 1_000_000.0)
        n >= 1_000 -> "${n / 1000} тыс."
        else -> n.toString()
    }

    private fun plural(n: Int, one: String, few: String, many: String) = when {
        n % 100 in 11..14 -> many
        n % 10 == 1 -> one
        n % 10 in 2..4 -> few
        else -> many
    }

    companion object {
        private const val X_KIND = "kind"
        private const val X_ID = "id"
        private const val X_TITLE = "title"
        private const val X_ARTIST = "artist"
        private const val X_IMAGE = "image"
        private const val KIND_ALBUM = "album"
        private const val KIND_ARTIST = "artist"
        private const val KIND_LIST = "list"
        private const val X_ID_S = "list_id"
        const val LIST_RU = "ru"
        const val LIST_WORLD = "world"
        const val LIST_NEWS = "news"

        fun list(ctx: Context, which: String) = Intent(ctx, CollectionActivity::class.java)
            .putExtra(X_KIND, KIND_LIST).putExtra(X_ID_S, which)

        fun album(ctx: Context, a: Album) = Intent(ctx, CollectionActivity::class.java)
            .putExtra(X_KIND, KIND_ALBUM).putExtra(X_ID, a.id ?: 0L).putExtra(X_TITLE, a.title)
            .putExtra(X_ARTIST, a.artist).putExtra(X_IMAGE, a.cover)

        fun artist(ctx: Context, id: Long, name: String, picture: String?) = Intent(ctx, CollectionActivity::class.java)
            .putExtra(X_KIND, KIND_ARTIST).putExtra(X_ID, id).putExtra(X_TITLE, name).putExtra(X_IMAGE, picture)

        fun artistByName(ctx: Context, name: String) = Intent(ctx, CollectionActivity::class.java)
            .putExtra(X_KIND, KIND_ARTIST).putExtra(X_TITLE, name)
    }
}
