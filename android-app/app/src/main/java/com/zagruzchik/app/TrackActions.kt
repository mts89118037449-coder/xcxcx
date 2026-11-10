package com.zagruzchik.app

import android.app.Activity
import android.view.Gravity
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.content.res.ResourcesCompat
import com.google.android.material.bottomsheet.BottomSheetDialog
import com.google.android.material.color.MaterialColors
import com.google.android.material.imageview.ShapeableImageView
import com.google.android.material.shape.ShapeAppearanceModel
import kotlin.concurrent.thread

/** Действия с песней («…» в строке): в любимое, скачать, исполнитель, радио, поделиться. */
object TrackActions {
    fun show(a: Activity, t: Track, snack: (String) -> Unit, pageUrl: String? = null, directUrl: String? = null, local: SavedFile? = null,
             onLikeChanged: (Boolean) -> Unit = {}) {
        val dlg = BottomSheetDialog(a)
        val onSurface = MaterialColors.getColor(a, com.google.android.material.R.attr.colorOnSurface, 0)
        val muted = MaterialColors.getColor(a, com.google.android.material.R.attr.colorOnSurfaceVariant, 0)
        val root = LinearLayout(a).apply { orientation = LinearLayout.VERTICAL; setPadding(a.dp(20), a.dp(8), a.dp(20), a.dp(24)) }

        val head = LinearLayout(a).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL; setPadding(0, 0, 0, a.dp(12)) }
        head.addView(ShapeableImageView(a).apply {
            scaleType = ImageView.ScaleType.CENTER_CROP
            shapeAppearanceModel = ShapeAppearanceModel.builder().setAllCornerSizes(a.dp(12).toFloat()).build()
            Images.into(this, t.cover, R.drawable.ph_cover)
        }, LinearLayout.LayoutParams(a.dp(56), a.dp(56)))
        val names = LinearLayout(a).apply { orientation = LinearLayout.VERTICAL; setPadding(a.dp(14), 0, 0, 0) }
        names.addView(TextView(a).apply { text = t.title; textSize = 17f; setTextColor(onSurface); typeface = ResourcesCompat.getFont(a, R.font.onest_semibold); maxLines = 1 })
        names.addView(TextView(a).apply { text = t.artist; textSize = 14f; setTextColor(muted); maxLines = 1 })
        head.addView(names)
        root.addView(head)

        fun item(icon: Int, label: String, action: () -> Unit) {
            root.addView(LinearLayout(a).apply {
                orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL
                minimumHeight = a.dp(52)
                setBackgroundResource(android.R.drawable.list_selector_background)
                background = a.obtainStyledAttributes(intArrayOf(android.R.attr.selectableItemBackground)).let { ta -> ta.getDrawable(0).also { ta.recycle() } }
                addView(ImageView(a).apply { setImageResource(icon); setColorFilter(onSurface) }, LinearLayout.LayoutParams(a.dp(24), a.dp(24)))
                addView(TextView(a).apply { text = label; textSize = 16f; setTextColor(onSurface); setPadding(a.dp(16), 0, 0, 0) })
                setOnClickListener { dlg.dismiss(); action() }
            })
        }
        val saved = Library.isSaved(t)
        item(if (saved) R.drawable.ic_favorite else R.drawable.ic_favorite_border, if (saved) "Убрать из любимого" else "В любимое") {
            val inCache = MediaCache.has(t)
            val now = Library.like(a, t, pageUrl ?: directUrl, t.url)
            onLikeChanged(now)
            snack(when {
                !now -> "Убрано из любимого"
                local != null || !Settings.saveLiked(a) -> "«${t.title}» — в любимом"
                inCache -> "«${t.title}» — в любимом, сохраняю из памяти"
                else -> "«${t.title}» — в любимом, скачиваю на телефон"
            })
        }
        if (local == null) item(R.drawable.ic_download, "Скачать") {
            val u = directUrl ?: pageUrl ?: t.url ?: return@item snack("Эту песню можно только послушать")
            DownloadService.enqueue(a, u, Format.MP3, t.label)
            snack("Скачиваю «${t.title}»")
        }
        if (t.artist.isNotBlank()) {
            item(R.drawable.ic_person_outline, "Исполнитель: ${t.artist}") { Rows.openArtist(a, t.artist) }
            item(R.drawable.ic_queue_music, "Радио по этой песне") {
                snack("Радио: похоже на «${t.title}»")
                thread {
                    val list = runCatching { Catalog.radio(t, listOf(t)) }.getOrDefault(emptyList())
                    a.runOnUiThread { Playback.playQueue(a, (listOf(t) + list).map { Playback.QItem(it, Library.localFor(it), it.url) }, 0) }
                }
            }
        }
        item(R.drawable.ic_link, "Где ещё послушать") { TransferActivity.openTrack(a, t, t.url) }
        // Поиск не находит или включает не ту версию — человек сам даёт страницу песни, запоминаем.
        item(R.drawable.ic_link, if (Streams.pinned(t) != null) "Своя ссылка: изменить" else "Указать свою ссылку на песню") {
            val input = android.widget.EditText(a).apply { hint = "YouTube, SoundCloud, VK Видео…"; setSingleLine(); setText(Streams.pinned(t).orEmpty()) }
            val box = android.widget.FrameLayout(a).apply { setPadding(a.dp(22), a.dp(8), a.dp(22), 0); addView(input) }
            com.google.android.material.dialog.MaterialAlertDialogBuilder(a)
                .setTitle("Откуда играть «${t.title}»")
                .setMessage("Вставьте ссылку на страницу песни — дальше она всегда будет играть оттуда. Пусто — снова обычный поиск.")
                .setView(box)
                .setPositiveButton("Сохранить") { _, _ ->
                    val raw = input.text.toString().trim()
                    val url = Links.extract(raw) ?: raw
                    if (raw.isEmpty()) { Streams.pin(t, null); snack("Ссылка убрана — буду искать сам") }
                    else if (url.startsWith("http")) { MediaCache.forget(t); Streams.pin(t, url); snack("Запомнил — «${t.title}» играет по вашей ссылке") }
                    else snack("Это не ссылка")
                }
                .setNegativeButton("Отмена", null).show()
        }
        dlg.setContentView(root)
        dlg.show()
    }
}
