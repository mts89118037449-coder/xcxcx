package com.zagruzchik.app

import android.app.Activity
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.view.View
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.core.view.isVisible
import com.google.android.material.bottomsheet.BottomSheetBehavior
import com.google.android.material.bottomsheet.BottomSheetDialog
import com.google.android.material.imageview.ShapeableImageView

/**
 * «Отправить» песню: панель снизу.
 * Сверху — мессенджеры с телефона (одно нажатие — и карточка со ссылками ушла),
 * ниже — копировать ссылки, отправить сам файл, открыть в своём сервисе.
 * Ссылки к этому моменту обычно уже готовы: их ищет [LinkCache], пока песня играет.
 */
object SongShareSheet {

    /** Мессенджеры, которые показываем первыми (если установлены). */
    val MESSENGERS = listOf(
        "org.telegram.messenger", "org.telegram.messenger.web", "org.thunderdog.challegram",
        "com.whatsapp", "com.whatsapp.w4b", "ru.oneme.app", "com.vkontakte.android", "com.vk.im",
        "com.viber.voip", "com.discord", "org.thoughtcrime.securesms",
    )

    class LocalFile(val uri: String, val mime: String, val name: String)

    fun show(activity: Activity, track: Track, sourceUrl: String?, local: LocalFile?, cover: Bitmap?) {
        val entry = LinkCache.prefetch(track, sourceUrl)
        val sheet = BottomSheetDialog(activity)
        val v = activity.layoutInflater.inflate(R.layout.sheet_song_share, null)
        sheet.setContentView(v)
        sheet.behavior.state = BottomSheetBehavior.STATE_EXPANDED
        sheet.behavior.skipCollapsed = true

        v.findViewById<TextView>(R.id.shTitle).text = track.title
        v.findViewById<TextView>(R.id.shArtist).text = track.artist
        val coverView = v.findViewById<ShapeableImageView>(R.id.shCover)
        if (cover != null) coverView.setImageBitmap(cover) else Images.into(coverView, entry.track.cover ?: track.cover, R.drawable.ph_cover)

        val status = v.findViewById<TextView>(R.id.shStatus)
        val spinner = v.findViewById<View>(R.id.shSpinner)
        fun refresh() {
            val exact = entry.links.values.count { it.exact }
            status.text = if (entry.ready) "Ссылки готовы · точных: $exact из ${Transfer.ORDER.size}"
            else "Ищу ссылки в сервисах… ${entry.links.size} из ${Transfer.ORDER.size}"
            spinner.isVisible = !entry.ready
        }
        refresh()
        val listener = { refresh() }
        LinkCache.listen(entry, listener)
        sheet.setOnDismissListener { LinkCache.unlisten(entry, listener) }

        fun cardIntent(): Intent {
            val links = LinkCache.linksFor(entry)
            return SongCard.intent(activity, entry.track, cover ?: Images.cached(entry.track.cover), links)
        }

        // Мессенджеры на телефоне — отправка в одно нажатие.
        val targets = v.findViewById<LinearLayout>(R.id.shTargets)
        val pm = activity.packageManager
        MESSENGERS.filter { runCatching { pm.getLaunchIntentForPackage(it) != null }.getOrDefault(false) }.forEach { pkg ->
            val info = runCatching { pm.getApplicationInfo(pkg, 0) }.getOrNull() ?: return@forEach
            val t = activity.layoutInflater.inflate(R.layout.item_share_target, targets, false)
            t.findViewById<ImageView>(R.id.tgIcon).setImageDrawable(pm.getApplicationIcon(info))
            t.findViewById<TextView>(R.id.tgLabel).text = pm.getApplicationLabel(info)
            t.setOnClickListener {
                try {
                    activity.startActivity(cardIntent().setPackage(pkg))
                } catch (e: Exception) {
                    activity.startActivity(Intent.createChooser(cardIntent(), "Отправить"))
                }
                sheet.dismiss()
            }
            targets.addView(t)
        }
        // «Ещё» — системный выбор приложения.
        targets.addView(activity.layoutInflater.inflate(R.layout.item_share_target, targets, false).apply {
            findViewById<ImageView>(R.id.tgIcon).apply {
                setImageResource(R.drawable.ic_more_horiz)
                layoutParams = layoutParams.apply { width = activity.dp(28); height = activity.dp(28) }
            }
            findViewById<TextView>(R.id.tgLabel).text = "Ещё"
            setOnClickListener {
                activity.startActivity(Intent.createChooser(cardIntent(), "Отправить песню"))
                sheet.dismiss()
            }
        })

        val actions = v.findViewById<LinearLayout>(R.id.shActions)
        fun action(icon: Int, title: String, hint: String, onClick: () -> Unit) {
            val row = activity.layoutInflater.inflate(R.layout.item_action, actions, false)
            row.findViewById<ImageView>(R.id.acIcon).setImageResource(icon)
            row.findViewById<TextView>(R.id.acTitle).text = title
            row.findViewById<TextView>(R.id.acHint).text = hint
            row.setOnClickListener { onClick(); sheet.dismiss() }
            actions.addView(row)
        }
        action(R.drawable.ic_content_copy, "Копировать ссылки", "Название и ссылки на все сервисы — одним текстом") {
            val text = Transfer.shareText(entry.track, LinkCache.linksFor(entry))
            activity.getSystemService(ClipboardManager::class.java).setPrimaryClip(ClipData.newPlainText("песня", text))
            Toast.makeText(activity, "Ссылки скопированы", Toast.LENGTH_SHORT).show()
        }
        if (local != null) {
            action(R.drawable.ic_audio_file, "Отправить файл", local.name) {
                val send = Intent(Intent.ACTION_SEND).setType(local.mime)
                    .putExtra(Intent.EXTRA_STREAM, Uri.parse(local.uri))
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                activity.startActivity(Intent.createChooser(send, "Отправить файл"))
            }
        }
        Installed.preferred(activity)?.let { mine ->
            action(R.drawable.ic_open_in_new, "Открыть в ${mine.inTitle}", "Ваш сервис") {
                val link = entry.links[mine]?.url ?: mine.searchUrl(entry.track.query)
                Installed.open(activity, mine, link)
            }
        }
        action(R.drawable.ic_link, "Все сервисы", "Ссылки по отдельности: открыть или скопировать") {
            TransferActivity.openTrack(activity, entry.track, sourceUrl)
        }
        sheet.show()
    }
}
