package com.zagruzchik.app

import android.app.Activity
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Intent
import android.graphics.BitmapFactory
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.isVisible
import com.google.android.material.appbar.MaterialToolbar
import com.google.android.material.imageview.ShapeableImageView
import com.google.android.material.progressindicator.LinearProgressIndicator
import com.google.android.material.snackbar.Snackbar
import java.net.URL
import java.util.concurrent.Executors

/** Трансфер: прислали песню в одном сервисе — показываем ссылки на неё во всех остальных. */
class TransferActivity : AppCompatActivity() {

    private val pool = Executors.newFixedThreadPool(4)
    private val main = Handler(Looper.getMainLooper())
    private lateinit var url: String
    private var hint: String? = null

    private lateinit var cover: ShapeableImageView
    private lateinit var titleView: TextView
    private lateinit var artistView: TextView
    private lateinit var sourceView: TextView
    private lateinit var loading: LinearProgressIndicator
    private lateinit var errorView: TextView
    private lateinit var services: LinearLayout
    private lateinit var bottomBar: View

    private var track: Track? = null
    private var coverBitmap: android.graphics.Bitmap? = null
    private val preferred by lazy { Installed.preferred(this) }
    private val installed by lazy { Installed.all(this).toSet() }
    private lateinit var openMine: com.google.android.material.button.MaterialButton
    private val links = linkedMapOf<Service, Transfer.Link>()
    private val rows = mutableMapOf<Service, View>()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_transfer)
        url = intent.getStringExtra(EXTRA_URL) ?: return finish()
        hint = intent.getStringExtra(EXTRA_HINT)

        findViewById<MaterialToolbar>(R.id.toolbar).setNavigationOnClickListener { finish() }
        cover = findViewById(R.id.cover)
        titleView = findViewById(R.id.trackTitle)
        artistView = findViewById(R.id.trackArtist)
        sourceView = findViewById(R.id.trackSource)
        loading = findViewById(R.id.loading)
        errorView = findViewById(R.id.error)
        services = findViewById(R.id.services)
        bottomBar = findViewById(R.id.bottomBar)
        openMine = findViewById(R.id.openMine)
        sourceView.text = Describe.of(url)

        // Карточка песни: картинка + все ссылки одним сообщением.
        findViewById<View>(R.id.shareAll).setOnClickListener {
            val t = track ?: return@setOnClickListener
            SongCard.share(this, t, coverBitmap, Transfer.ORDER.mapNotNull { links[it] })
        }
        findViewById<View>(R.id.copyAll).setOnClickListener {
            val t = track ?: return@setOnClickListener
            copy(Transfer.shareText(t, Transfer.ORDER.mapNotNull { links[it] }), "Все ссылки скопированы")
        }
        findViewById<View>(R.id.mp3).setOnClickListener {
            DownloadService.enqueue(this, url, Format.MP3, hint)
            startActivity(
                Intent(this, MainActivity::class.java).putExtra(MainActivity.EXTRA_SHOW_JOBS, true)
                    .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            )
            finish()
        }
        load()
    }

    private fun load() {
        pool.execute {
            try {
                val item = Music.resolve(url, hint)
                val first = item.tracks.first()
                // Для альбома или плейлиста ищем сам альбом: «Исполнитель Название альбома».
                val t = if (item.type == "track") Transfer.enrich(first) else Track(item.name, first.artist, cover = first.cover)
                main.post { showTrack(t, item) }
                for (s in Transfer.ORDER) {
                    if (s == item.source && item.type == "track") {
                        main.post { setLink(Transfer.Link(s, url, true), original = true) }
                        continue
                    }
                    pool.execute {
                        val link = if (item.type == "track") Transfer.find(s, t, Downloader::youtubeId)
                        else Transfer.Link(s, s.searchUrl("${first.artist} ${item.name}".trim()), false)
                        main.post { setLink(link) }
                    }
                }
            } catch (e: Exception) {
                val msg = (e as? UserError)?.message ?: "Не получилось: ${e.message}"
                main.post {
                    if (isDestroyed) return@post
                    loading.isVisible = false
                    titleView.text = "Трек не найден"
                    errorView.text = msg
                    errorView.isVisible = true
                }
            }
        }
    }

    private fun showTrack(t: Track, item: MusicItem) {
        if (isDestroyed) return
        track = t
        titleView.text = t.title
        artistView.text = t.artist
        sourceView.text = when (item.type) {
            "album" -> "Альбом · ${item.tracks.size} треков · ${item.source.title}"
            "playlist" -> "Плейлист · ${item.tracks.size} треков · ${item.source.title}"
            else -> "Из ${item.source.title}"
        }
        // Сразу показываем все сервисы с крутилкой, ссылки подставляются по мере ответа.
        services.removeAllViews()
        rows.clear()
        // Сначала мой сервис, потом установленные на телефоне, потом остальные.
        val order = Transfer.ORDER.sortedBy { s -> if (s == preferred) 0 else if (s in installed) 1 else 2 }
        for (s in order) {
            val row = layoutInflater.inflate(R.layout.item_service, services, false)
            row.findViewById<TextView>(R.id.badge).showBadge(s.badge)
            row.findViewById<TextView>(R.id.name).text = s.title
            row.findViewById<TextView>(R.id.kind).text = "ищу…"
            row.findViewById<View>(R.id.copy).isVisible = false
            row.findViewById<View>(R.id.open).isVisible = false
            rows[s] = row
            services.addView(row)
        }
        loading.isVisible = false
        bottomBar.isVisible = true
        findViewById<TextView>(R.id.mp3).text = if (item.tracks.size > 1) "MP3 · ${item.tracks.size}" else "MP3"
        t.cover?.let { c ->
            pool.execute {
                val bmp = runCatching { URL(c).openStream().use { BitmapFactory.decodeStream(it) } }.getOrNull()
                main.post { if (bmp != null && !isDestroyed) { coverBitmap = bmp; cover.setImageBitmap(bmp) } }
            }
        }
    }

    private fun setLink(link: Transfer.Link, original: Boolean = false) {
        if (isDestroyed) return
        links[link.service] = link
        val row = rows[link.service] ?: return
        val kind = row.findViewById<TextView>(R.id.kind)
        val what = when {
            original -> "исходная ссылка"
            link.exact -> "✓ точная ссылка"
            else -> "поиск в сервисе"
        }
        kind.text = if (link.service in installed) "$what · установлено" else what
        if (link.service == preferred) {
            openMine.text = "Открыть в ${link.service.inTitle}"
            openMine.setOnClickListener { open(link) }
            openMine.isVisible = true
        }
        row.findViewById<View>(R.id.spinner).isVisible = false
        row.findViewById<View>(R.id.copy).apply {
            isVisible = true
            setOnClickListener { copy(link.url, "Ссылка ${link.service.title} скопирована") }
        }
        row.findViewById<View>(R.id.open).apply {
            isVisible = true
            setOnClickListener { open(link) }
        }
        row.findViewById<View>(R.id.card).setOnClickListener { open(link) }
    }

    /** Открываем прямо в приложении сервиса, если оно установлено. */
    private fun open(link: Transfer.Link) {
        if (!Installed.open(this, link.service, link.url)) snack("Нечем открыть ссылку")
    }

    private fun copy(text: String, message: String) {
        getSystemService(ClipboardManager::class.java).setPrimaryClip(ClipData.newPlainText("ссылка", text))
        snack(message)
    }

    private fun snack(text: String) {
        Snackbar.make(services, text, Snackbar.LENGTH_SHORT).apply { if (bottomBar.isVisible) setAnchorView(bottomBar) }.show()
    }

    override fun onDestroy() {
        pool.shutdownNow()
        super.onDestroy()
    }

    companion object {
        const val EXTRA_URL = "url"
        const val EXTRA_HINT = "hint"

        fun open(activity: Activity, url: String, hint: String?) {
            activity.startActivity(
                Intent(activity, TransferActivity::class.java).putExtra(EXTRA_URL, url).putExtra(EXTRA_HINT, hint)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            )
        }
    }
}
