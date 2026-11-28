package com.zagruzchik.app

import android.app.Activity
import android.graphics.Typeface
import android.view.Gravity
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.core.view.isVisible
import com.google.android.material.bottomsheet.BottomSheetBehavior
import com.google.android.material.bottomsheet.BottomSheetDialog
import com.google.android.material.button.MaterialButton
import com.google.android.material.color.MaterialColors
import com.google.android.material.progressindicator.CircularProgressIndicator
import kotlin.concurrent.thread

/**
 * Текст песни снизу. Если у песни есть строки с временем — режим «Караоке»:
 * текущая строка подсвечивается и сама прокручивается, нажатие на строку — перемотка к ней.
 */
object LyricsSheet {
    fun show(act: Activity, t: Track, position: () -> Long, seek: (Long) -> Unit, onVisibilityChanged: () -> Unit) {
        val dlg = BottomSheetDialog(act)
        val pad = act.dp(20)
        val onSurface = 0xFFF4F4F5.toInt()
        val muted = 0xFFA8A4B8.toInt()
        val root = LinearLayout(act).apply { orientation = LinearLayout.VERTICAL; setPadding(pad, 0, pad, 0) }
        root.addView(glassDragHandle(act))
        val head = LinearLayout(act).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
        val titles = LinearLayout(act).apply { orientation = LinearLayout.VERTICAL }
        titles.addView(TextView(act).apply {
            text = t.title; setTextAppearance(com.google.android.material.R.style.TextAppearance_Material3_TitleLarge)
            setTextColor(onSurface)
            maxLines = 1; ellipsize = android.text.TextUtils.TruncateAt.END
        })
        val sub = TextView(act).apply {
            text = t.artist; setTextAppearance(com.google.android.material.R.style.TextAppearance_Material3_BodyMedium)
            setTextColor(muted)
        }
        titles.addView(sub)
        head.addView(titles, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        val karaoke = MaterialButton(act, null, com.google.android.material.R.attr.materialButtonOutlinedStyle).apply {
            text = "Караоке"; isCheckable = true; isVisible = false
            setTextColor(onSurface)
        }
        head.addView(karaoke)
        root.addView(head)
        root.addView(MaterialButton(act, null, com.google.android.material.R.attr.materialButtonOutlinedStyle).apply {
            val visible = Settings.lyricsInPlayer(act)
            text = if (visible) "Скрыть текст в плеере" else "Показывать текст в плеере"
            setTextColor(onSurface)
            setOnClickListener {
                Settings.setLyricsInPlayer(act, !visible)
                onVisibilityChanged()
                dlg.dismiss()
            }
        })
        root.addView(glassDivider(act))

        val progress = CircularProgressIndicator(act).apply { isIndeterminate = true }
        root.addView(progress, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
            gravity = Gravity.CENTER_HORIZONTAL; topMargin = act.dp(40); bottomMargin = act.dp(40)
        })
        val scroll = ScrollView(act)
        val body = LinearLayout(act).apply { orientation = LinearLayout.VERTICAL; setPadding(0, act.dp(12), 0, act.dp(32)) }
        scroll.addView(body)
        root.addView(scroll, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, act.resources.displayMetrics.heightPixels * 2 / 3))
        dlg.setContentView(root)
        dlg.behavior.state = BottomSheetBehavior.STATE_EXPANDED
        dlg.behavior.skipCollapsed = true

        val normal = muted
        val active = 0xFFC9B6FF.toInt()
        var lines: List<TextView> = emptyList()
        var synced: List<Lyrics.Line> = emptyList()
        var lastActive = -1
        val ticker = object : Runnable {
            override fun run() {
                if (!dlg.isShowing) return
                if (karaoke.isChecked && synced.isNotEmpty()) {
                    val pos = position() + 300 // чуть заранее — так естественнее
                    val i = synced.indexOfLast { it.timeMs <= pos }
                    if (i != lastActive) {
                        lines.getOrNull(lastActive)?.apply { setTextColor(normal); setTypeface(null, Typeface.NORMAL) }
                        lines.getOrNull(i)?.let { v ->
                            v.setTextColor(active); v.setTypeface(null, Typeface.BOLD)
                            scroll.smoothScrollTo(0, (v.top - scroll.height / 3).coerceAtLeast(0))
                        }
                        lastActive = i
                    }
                }
                scroll.postDelayed(this, 250)
            }
        }

        fun showPlain(text: String) {
            body.removeAllViews(); lines = emptyList(); lastActive = -1
            body.addView(TextView(act).apply {
                this.text = text; setTextIsSelectable(true)
                setTextColor(onSurface)
                setTextAppearance(com.google.android.material.R.style.TextAppearance_Material3_BodyLarge)
                setLineSpacing(0f, 1.25f)
            })
        }

        fun showSynced() {
            body.removeAllViews(); lastActive = -1
            lines = synced.map { l ->
                TextView(act).apply {
                    text = l.text.ifEmpty { "♪" }
                    setTextAppearance(com.google.android.material.R.style.TextAppearance_Material3_TitleMedium)
                    setTextColor(normal)
                    setPadding(0, act.dp(6), 0, act.dp(6))
                    setOnClickListener { seek(l.timeMs) }
                }.also { body.addView(it) }
            }
        }

        dlg.makeGlassSheet(root) { scroll.post(ticker) }
        dlg.setOnDismissListener { scroll.removeCallbacks(ticker) }
        dlg.show()

        thread {
            val r = runCatching { Lyrics.find(t) }.getOrNull()
            act.runOnUiThread {
                if (act.isFinishing || act.isDestroyed || !dlg.isShowing) return@runOnUiThread
                progress.isVisible = false
                if (r == null) {
                    showPlain("Текст не нашёлся ни на Genius, ни в LRCLIB.")
                    return@runOnUiThread
                }
                sub.text = "${t.artist} · текст: ${r.source}"
                synced = r.synced
                karaoke.isVisible = synced.isNotEmpty()
                karaoke.addOnCheckedChangeListener { _, on -> if (on) showSynced() else showPlain(r.text) }
                // Синхронный текст есть, а Genius нет — сразу караоке; иначе — текст Genius.
                if (synced.isNotEmpty()) karaoke.isChecked = true else showPlain(r.text)
            }
        }
    }
}
