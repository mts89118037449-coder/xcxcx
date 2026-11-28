package com.zagruzchik.app

import android.app.Activity
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import kotlin.concurrent.thread

object PersonalMixes {
    enum class Mode(val title: String, val description: String) {
        MOOD("По настроению", "Спокойно, энергично или басово"),
        REDISCOVER("Давно не слушали", "Любимые песни, к которым пора вернуться"),
        DISCOVER("Может понравиться", "Новые для вас треки и исполнители"),
        LIKES("Из любимого", "Микс из лайков и того, что дослушиваете"),
    }

    fun play(activity: Activity, mode: Mode, feedback: (String) -> Unit) {
        val labels = arrayOf("Спокойно", "Энергично", "Басово")
        if (mode == Mode.MOOD) {
            MaterialAlertDialogBuilder(activity).setTitle("Настроение").setItems(labels) { _, i ->
                generate(activity, mode, feedback, i)
            }.show()
        } else generate(activity, mode, feedback)
    }

    private fun generate(activity: Activity, mode: Mode, feedback: (String) -> Unit, mood: Int = 0) {
        val ctx = activity.applicationContext
        if (mode == Mode.DISCOVER) feedback("Собираю подборку…")
        thread {
            val favorites = Library.favorites.filterNot(Taste::disliked)
            val tracks = runCatching {
                when (mode) {
                    Mode.MOOD -> {
                        val tags = listOf(
                            setOf("медленная", "акустика", "lo-fi", "джаз", "классика"),
                            setOf("быстрая", "танцевальная", "hardstyle", "speed up"),
                            setOf("басовая", "phonk"),
                        )
                        val recent = History.all.filter { it.kind == Kind.MUSIC }.map { it.track }
                        (favorites + recent).distinctBy(Library::key).filterNot(Taste::disliked)
                            .filter { t -> Tags.of(t).any { it in tags[mood] } }.shuffled()
                    }
                    Mode.REDISCOVER -> Taste.forgottenFavorites(35)
                    Mode.DISCOVER -> Recs.today(ctx).shuffled()
                    Mode.LIKES -> Taste.smart(favorites.shuffled()) { it }
                }.take(35)
            }.getOrDefault(emptyList())
            val items = tracks.map { Playback.QItem(it, Library.localFor(it), it.url) }
            activity.runOnUiThread {
                if (activity.isFinishing || activity.isDestroyed) return@runOnUiThread
                if (items.isEmpty()) feedback(when (mode) {
                    Mode.MOOD -> "Пока мало песен с таким темпом или настроением"
                    Mode.DISCOVER -> "Подборка пока недоступна"
                    else -> "Пока мало сохранённых песен для этой подборки"
                }) else Playback.playQueue(activity, items, 0)
            }
        }
    }
}
