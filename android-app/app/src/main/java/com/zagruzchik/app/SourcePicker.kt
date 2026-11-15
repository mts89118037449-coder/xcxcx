package com.zagruzchik.app

import android.app.Activity
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import kotlin.concurrent.thread

/**
 * Выбор источника песни: приложение опрашивает все площадки и показывает, где она нашлась.
 * Выбранное запоминается за этой песней — дальше она всегда играет оттуда («Автоматически» — вернуть как было).
 */
object SourcePicker {
    fun show(a: Activity, t: Track, onChosen: () -> Unit = {}) {
        val wait = MaterialAlertDialogBuilder(a)
            .setTitle("Источники «${t.title}»")
            .setMessage("Ищу, где есть эта песня… (до 25 секунд)")
            .setNegativeButton("Отмена", null).show()
        thread {
            val found = runCatching { Streams.options(t) }.getOrDefault(emptyList())
            a.runOnUiThread {
                if (a.isFinishing || a.isDestroyed) return@runOnUiThread
                val cancelled = !wait.isShowing
                runCatching { wait.dismiss() }
                if (cancelled) return@runOnUiThread
                val current = Streams.chosen(t)
                val labels = listOf("Автоматически (как решит приложение)") + found.map { o ->
                    o.label + (if (o.title.isNotBlank() && !o.title.equals(t.title, true)) " — «${o.title.take(40)}»" else "")
                }
                val checked = found.indexOfFirst { it.where == current }.let { if (it < 0) 0 else it + 1 }
                MaterialAlertDialogBuilder(a)
                    .setTitle(if (found.isEmpty()) "«${t.title}» нигде не нашлась" else "Откуда играть «${t.title}»")
                    .setSingleChoiceItems(labels.toTypedArray(), checked) { d, i ->
                        d.dismiss()
                        Streams.pin(t, if (i == 0) null else found[i - 1].where)
                        AppLog.add("ИСТОЧНИК ВЫБРАН для «${t.label}»: " + if (i == 0) "автоматически" else found[i - 1].label)
                        Playback.replay(a, t)
                        onChosen()
                    }
                    .setNegativeButton("Закрыть", null).show()
            }
        }
    }
}
