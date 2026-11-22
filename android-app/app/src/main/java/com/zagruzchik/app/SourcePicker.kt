package com.zagruzchik.app

import android.app.Activity
import android.graphics.Color
import android.view.Gravity
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import com.google.android.material.color.MaterialColors
import com.google.android.material.dialog.MaterialAlertDialogBuilder

/**
 * Выбор источника песни. Окно открывается сразу и музыку не останавливает: первым стоит источник, откуда песня играет
 * сейчас, остальные добавляются в список по мере ответа площадок. Выбранное запоминается за песней.
 */
object SourcePicker {
    fun show(a: Activity, t: Track, onChosen: () -> Unit = {}, fresh: Boolean = false) {
        val live = Streams.live(t, urgent = true, fresh = fresh)
        val onSurface = MaterialColors.getColor(a, com.google.android.material.R.attr.colorOnSurface, Color.WHITE)
        val muted = MaterialColors.getColor(a, com.google.android.material.R.attr.colorOnSurfaceVariant, Color.GRAY)
        val rows = LinearLayout(a).apply { orientation = LinearLayout.VERTICAL; setPadding(a.dp(8), a.dp(4), a.dp(8), 0) }
        val foot = TextView(a).apply { textSize = 13f; setTextColor(muted); setPadding(a.dp(18), a.dp(10), a.dp(18), a.dp(4)) }
        val box = LinearLayout(a).apply { orientation = LinearLayout.VERTICAL; addView(rows); addView(foot) }
        val dialog = MaterialAlertDialogBuilder(a)
            .setTitle("Откуда играть «${t.title}»")
            .setView(ScrollView(a).apply { addView(box) })
            .setNegativeButton("Закрыть", null).create()

        fun choose(where: String?, label: String) {
            dialog.dismiss()
            if (where == Streams.chosen(t) && where != null) return
            Streams.pin(t, where)
            AppLog.add("ИСТОЧНИК ВЫБРАН для «${t.label}»: $label")
            Playback.replay(a, t)
            onChosen()
        }
        fun row(text: String, sub: String?, selected: Boolean, click: () -> Unit) {
            rows.addView(LinearLayout(a).apply {
                orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER_VERTICAL
                setPadding(a.dp(14), a.dp(11), a.dp(14), a.dp(11)); isClickable = true; isFocusable = true
                if (selected) background = AuraColors.drawable(a, a.dp(16).toFloat()) else setBackgroundResource(android.R.drawable.list_selector_background)
                addView(TextView(a).apply { this.text = text; textSize = 16f; setTextColor(if (selected) Color.WHITE else onSurface) })
                if (!sub.isNullOrBlank()) addView(TextView(a).apply { this.text = sub; textSize = 12f; setTextColor(if (selected) 0xDDFFFFFF.toInt() else muted) })
                setOnClickListener { click() }
            }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { bottomMargin = a.dp(4) })
        }
        fun render() {
            if (a.isFinishing || a.isDestroyed) return
            val current = Streams.chosen(t)
            rows.removeAllViews()
            row("Автоматически", "как решит приложение", current == null) { choose(null, "автоматически") }
            live.list.forEach { o ->
                val sub = if (o.title.isNotBlank() && !o.title.equals(t.title, true)) "запись: «${o.title.take(60)}»" else null
                row(o.label, sub, o.where == current) { choose(o.where, o.label) }
            }
            foot.text = if (!live.done) "Ищу на остальных площадках… список пополняется"
                else if (live.list.isEmpty()) "Площадки сейчас ничего не отдали" else "Поиск закончен: найдено ${live.list.size}"
            // Поиск закончен — можно опросить площадки ещё раз.
            if (live.done) row("Искать ещё раз", null, false) { dialog.dismiss(); show(a, t, onChosen, fresh = true) }
        }
        val listener: () -> Unit = { a.runOnUiThread { render() } }
        live.listeners += listener
        dialog.setOnDismissListener { live.listeners -= listener }
        render()
        dialog.show()
    }
}
