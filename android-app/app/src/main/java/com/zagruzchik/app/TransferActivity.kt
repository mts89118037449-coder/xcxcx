package com.zagruzchik.app

import android.app.Activity
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Intent
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.TextUtils
import android.view.Gravity
import android.view.View
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import java.net.URL
import java.util.concurrent.Executors

/**
 * Трансфер: прислали песню в одном сервисе — показываем ссылки на неё во всех остальных.
 */
class TransferActivity : Activity() {

    private val pool = Executors.newFixedThreadPool(4)
    private val main = Handler(Looper.getMainLooper())
    private lateinit var url: String
    private var hint: String? = null

    private lateinit var cover: ImageView
    private lateinit var titleView: TextView
    private lateinit var artistView: TextView
    private lateinit var status: TextView
    private lateinit var spinner: ProgressBar
    private lateinit var rows: LinearLayout
    private lateinit var actions: LinearLayout

    private var track: Track? = null
    private val links = linkedMapOf<Service, Transfer.Link>()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        title = "Ссылки в других сервисах"
        url = intent.getStringExtra(EXTRA_URL) ?: return finish()
        hint = intent.getStringExtra(EXTRA_HINT)

        cover = ImageView(this).apply {
            scaleType = ImageView.ScaleType.CENTER_CROP
            clipToOutline = true
            background = GradientDrawable().apply { cornerRadius = dp(18).toFloat(); setColor(Color.argb(40, 128, 128, 128)) }
            layoutParams = LinearLayout.LayoutParams(dp(180), dp(180)).apply { gravity = Gravity.CENTER_HORIZONTAL; bottomMargin = dp(12) }
            visibility = View.GONE
        }
        titleView = text("", 22f, bold = true).apply { gravity = Gravity.CENTER_HORIZONTAL }
        artistView = text("", 16f, muted = true).apply { gravity = Gravity.CENTER_HORIZONTAL }
        status = text("Узнаю, что за трек…", 14f, muted = true).apply { gravity = Gravity.CENTER_HORIZONTAL }
        spinner = ProgressBar(this).apply {
            layoutParams = LinearLayout.LayoutParams(dp(36), dp(36)).apply { gravity = Gravity.CENTER_HORIZONTAL; topMargin = dp(8) }
        }
        rows = column(0)
        actions = column(0).apply { visibility = View.GONE }

        val root = column().apply {
            addView(cover)
            addView(titleView)
            addView(artistView)
            addView(status)
            addView(spinner)
            addView(rows)
            addView(actions)
        }
        setContentView(ScrollView(this).apply { addView(root) })
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
                        main.post { addLink(Transfer.Link(s, url, true), original = true) }
                        continue
                    }
                    pool.execute {
                        val link = if (item.type == "track") {
                            Transfer.find(s, t, ::youtubeId)
                        } else {
                            Transfer.Link(s, s.searchUrl("${first.artist} ${item.name}".trim()), false)
                        }
                        main.post { addLink(link) }
                    }
                }
            } catch (e: Exception) {
                val msg = (e as? UserError)?.message ?: "Не получилось: ${e.message}"
                main.post {
                    spinner.visibility = View.GONE
                    status.text = msg
                    status.setTextColor(errorText())
                    status.alpha = 1f
                }
            }
        }
    }

    private fun youtubeId(q: String): String? = Downloader.youtubeId(q)

    private fun showTrack(t: Track, item: MusicItem) {
        if (isDestroyed) return
        track = t
        titleView.text = t.title
        artistView.text = t.artist
        status.text = when (item.type) {
            "album" -> "Альбом · ${item.tracks.size} треков · из ${item.source.title}"
            "playlist" -> "Плейлист · ${item.tracks.size} треков · из ${item.source.title}"
            else -> "Из ${item.source.title}"
        }
        t.cover?.let { c ->
            pool.execute {
                val bmp = runCatching { URL(c).openStream().use { BitmapFactory.decodeStream(it) } }.getOrNull()
                main.post { if (bmp != null && !isDestroyed) { cover.setImageBitmap(bmp); cover.visibility = View.VISIBLE } }
            }
        }
        showActions(item)
    }

    private fun addLink(link: Transfer.Link, original: Boolean = false) {
        if (isDestroyed) return
        links[link.service] = link
        // Показываем в постоянном порядке, независимо от того, кто ответил первым.
        rows.removeAllViews()
        for (s in Transfer.ORDER) links[s]?.let { rows.addView(row(it, original = it.url == url)) }
        if (links.size == Transfer.ORDER.size) spinner.visibility = View.GONE
    }

    private fun row(link: Transfer.Link, original: Boolean): View {
        val name = text(link.service.title, 16f, bold = true)
        val sub = text(
            when {
                original -> "исходная ссылка"
                link.exact -> "точная ссылка на трек"
                else -> "поиск в ${link.service.title}"
            }, 13f, muted = true,
        )
        val info = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            addView(name)
            addView(sub)
        }
        return LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(14), dp(8), dp(6), dp(8))
            background = GradientDrawable().apply {
                cornerRadius = dp(14).toFloat()
                setStroke(dp(1), Color.argb(60, 128, 128, 128))
            }
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
                .apply { topMargin = dp(8) }
            addView(info)
            addView(smallAction("Открыть") { open(link.url) })
            addView(smallAction("Копировать") { copy(link.url, "Ссылка ${link.service.title} скопирована") })
        }
    }

    private fun showActions(item: MusicItem) {
        actions.removeAllViews()
        actions.addView(spacer(8))
        actions.addView(button("Поделиться всеми ссылками") {
            val t = track ?: return@button
            val all = Transfer.ORDER.mapNotNull { links[it] }
            startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, Transfer.shareText(t, all)), "Поделиться"))
        })
        actions.addView(button("Копировать всё", primary = false) {
            val t = track ?: return@button
            copy(Transfer.shareText(t, Transfer.ORDER.mapNotNull { links[it] }), "Все ссылки скопированы")
        })
        actions.addView(button(if (item.tracks.size > 1) "Скачать MP3 (${item.tracks.size})" else "Скачать MP3", primary = false) {
            DownloadService.enqueue(this, url, Format.MP3, hint)
            startActivity(Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP))
            finish()
        })
        actions.visibility = View.VISIBLE
    }

    private fun open(u: String) {
        try {
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(u)))
        } catch (e: Exception) {
            Toast.makeText(this, "Нечем открыть ссылку", Toast.LENGTH_SHORT).show()
        }
    }

    private fun copy(text: String, toast: String) {
        getSystemService(ClipboardManager::class.java).setPrimaryClip(ClipData.newPlainText("ссылка", text))
        Toast.makeText(this, toast, Toast.LENGTH_SHORT).show()
    }

    private fun smallAction(label: String, onClick: () -> Unit) = TextView(this).apply {
        text = label
        textSize = 14f
        setTextColor(accentText())
        setTypeface(typeface, android.graphics.Typeface.BOLD)
        setPadding(dp(8), dp(10), dp(8), dp(10))
        ellipsize = TextUtils.TruncateAt.END
        isClickable = true
        background = getDrawable(android.R.drawable.list_selector_background)
        setOnClickListener { onClick() }
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
