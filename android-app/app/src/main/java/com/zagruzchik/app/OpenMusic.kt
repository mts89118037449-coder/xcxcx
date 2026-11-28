package com.zagruzchik.app

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.text.InputType
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.Toast
import androidx.core.view.isVisible
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import kotlin.concurrent.thread

object OpenMusic {
    fun search(activity: Activity, query: String) {
        val uri = Uri.parse("https://www.google.com/search").buildUpon()
            .appendQueryParameter("q", "$query слушать").build()
        runCatching { activity.startActivity(Intent(Intent.ACTION_VIEW, uri)) }
            .onFailure { Toast.makeText(activity, "Браузер недоступен", Toast.LENGTH_SHORT).show() }
    }

    fun show(activity: Activity, initial: String = "", hint: String? = null, target: Track? = null) {
        val fields = LinearLayout(activity).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(activity.dp(24), activity.dp(8), activity.dp(24), 0)
        }
        fun field(label: String) = EditText(activity).apply { this.hint = label; setSingleLine(); fields.addView(this) }
        val link = field("Ссылка на песню или аудиофайл").apply {
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI
            setText(initial)
        }
        val known = target ?: Music.hintTrack(hint?.replace(initial, "")?.trim())
        val title = field("Название песни").apply {
            setText(known?.title ?: initial.substringBefore('?').substringAfterLast('/').substringBeforeLast('.')
                .takeIf { Http.isDirectAudio(initial) }?.let(Uri::decode).orEmpty())
        }
        val artist = field("Исполнитель").apply { setText(known?.artist.orEmpty()) }
        if (target != null) {
            title.isVisible = false
            artist.isVisible = false
        }
        val primary = if (target == null) "Добавить" else "Выбрать"
        val dialog = MaterialAlertDialogBuilder(activity).setTitle(if (target == null) "Добавить по ссылке" else target.title)
            .setView(fields).setNegativeButton("Отмена", null).setPositiveButton(primary, null).create()
        dialog.setOnShowListener {
            val button = dialog.getButton(android.content.DialogInterface.BUTTON_POSITIVE)
            button.setOnClickListener {
                val url = ProfileBackup.publicUrl(Links.extract(link.text.toString()))
                val name = title.text.toString().trim()
                if (url == null) { link.error = "Введите веб-ссылку на песню"; return@setOnClickListener }
                if (name.isBlank()) { title.error = "Укажите название"; return@setOnClickListener }
                val track = target ?: Track(name, artist.text.toString().trim(), url = url)
                val direct = Http.isDirectAudio(url)
                listOf(link, title, artist).forEach { it.isEnabled = false }
                button.isEnabled = false
                button.text = "Проверяю…"
                thread {
                    val available = if (direct) Http.canReadAudio(url)
                        else Streams.page(url, Describe.site(url), name) != null
                    activity.runOnUiThread {
                        if (activity.isFinishing || activity.isDestroyed || !dialog.isShowing) return@runOnUiThread
                        listOf(link, title, artist).forEach { it.isEnabled = true }
                        button.isEnabled = true
                        button.text = primary
                        if (!available) { link.error = "По ссылке сейчас нет доступного аудио"; return@runOnUiThread }
                        Streams.pin(track, if (direct) "direct:$url" else url)
                        dialog.dismiss()
                        if (target != null) Playback.replay(activity, track)
                        else {
                            Library.addFavorites(listOf(track))
                            Toast.makeText(activity, "Песня в медиатеке", Toast.LENGTH_SHORT).show()
                        }
                    }
                }
            }
        }
        dialog.show()
    }
}
