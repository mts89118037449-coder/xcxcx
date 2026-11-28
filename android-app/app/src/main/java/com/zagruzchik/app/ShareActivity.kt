package com.zagruzchik.app

import android.content.Intent
import android.os.Bundle
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.isVisible
import com.google.android.material.bottomsheet.BottomSheetBehavior
import com.google.android.material.bottomsheet.BottomSheetDialog
import com.google.android.material.button.MaterialButton
import com.google.android.material.button.MaterialButtonToggleGroup

/** «Поделиться → SoundAura»: снизу выезжает панель с выбором формата. */
class ShareActivity : AppCompatActivity() {

    private var started = false
    private var sheet: BottomSheetDialog? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val shared = intent.getStringExtra(Intent.EXTRA_TEXT) ?: intent.dataString
        val url = Links.extract(shared) ?: run {
            Toast.makeText(this, "В том, чем поделились, нет ссылки", Toast.LENGTH_LONG).show()
            finish()
            return
        }
        val music = Music.isMusic(url) || Service.of(url) == Service.YOUTUBE

        // Выбрали «Где послушать» (отдельный пункт или быстрая кнопка) — сразу к ссылкам, без панели.
        val linksMode = componentName.className.endsWith("ShareLinksAlias") ||
            intent.getStringExtra(androidx.core.content.pm.ShortcutManagerCompat.EXTRA_SHORTCUT_ID) == Shortcuts.ID_LINKS
        if (linksMode) {
            if (music) {
                TransferActivity.open(this, url, shared)
            } else {
                Toast.makeText(this, "«Где послушать» работает для ссылок на песни", Toast.LENGTH_LONG).show()
            }
            finish()
            return
        }

        val sheet = BottomSheetDialog(this)
        this.sheet = sheet
        val view = layoutInflater.inflate(R.layout.sheet_share, null)
        sheet.setContentView(view)
        sheet.behavior.state = BottomSheetBehavior.STATE_EXPANDED
        sheet.behavior.skipCollapsed = true

        view.findViewById<TextView>(R.id.service).text = Describe.of(url)
        view.findViewById<TextView>(R.id.url).text = url
        view.findViewById<MaterialButton>(R.id.saveOpenMusic).setOnClickListener {
            started = true
            startActivity(Intent(this, MainActivity::class.java).putExtra("open_music_url", url).putExtra("open_music_hint", shared)
                .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP))
            sheet.dismiss()
        }
        val formats = view.findViewById<MaterialButtonToggleGroup>(R.id.formats)
        FormatPicker.setup(formats, url)
        val download = view.findViewById<MaterialButton>(R.id.download)
        val transfer = view.findViewById<MaterialButton>(R.id.transfer)
        transfer.isVisible = music
        transfer.text = "Где послушать"
        // Музыка: главное — «Слушать» (сразу, без скачивания). Песню начинаем готовить уже сейчас.
        val listen = view.findViewById<MaterialButton>(R.id.listen)
        listen.isVisible = music
        // Поделились плейлистом или альбомом — можно перенести его целиком в медиатеку.
        val isList = Regex("""playlist|/album/|/sets/|/likes|[?&]list=""").containsMatchIn(url)
        view.findViewById<MaterialButton>(R.id.importLib).apply {
            isVisible = music && isList
            setOnClickListener { started = true; ImportActivity.open(this@ShareActivity, url); sheet.dismiss() }
        }
        if (music) {
            Playback.prefetchLink(url, shared)
            view.findViewById<android.view.View>(R.id.formats).isVisible = !Music.needsSearch(url)
            download.text = if (Service.of(url) == Service.YOUTUBE) "Скачать" else "Скачать MP3"
            download.backgroundTintList = android.content.res.ColorStateList.valueOf(
                com.google.android.material.color.MaterialColors.getColor(download, com.google.android.material.R.attr.colorSecondaryContainer))
            download.setTextColor(com.google.android.material.color.MaterialColors.getColor(download, com.google.android.material.R.attr.colorOnSecondaryContainer))
            download.iconTint = download.textColors
            listen.setOnClickListener {
                started = true
                Playback.playLink(this, url, shared)
                sheet.dismiss()
            }
        }
        // Пришли через быструю кнопку «Скачать» — сразу качаем в формате по умолчанию.
        val quickDownload = intent.getStringExtra(androidx.core.content.pm.ShortcutManagerCompat.EXTRA_SHORTCUT_ID) == Shortcuts.ID_DOWNLOAD

        fun start() {
            if (started) return
            started = true
            DownloadService.enqueue(this, url, FormatPicker.selected(formats), shared)
            // Открываем приложение на вкладке «Загрузки», чтобы был виден прогресс.
            startActivity(
                Intent(this, MainActivity::class.java).putExtra(MainActivity.EXTRA_SHOW_JOBS, true)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            )
            sheet.dismiss()
        }

        download.setOnClickListener { start() }
        transfer.setOnClickListener {
            started = true
            TransferActivity.open(this, url, shared)
            sheet.dismiss()
        }
        sheet.setOnDismissListener { finish() }
        sheet.show()

        if (quickDownload) {
            start()
            return
        }
    }

    override fun onDestroy() {
        sheet?.setOnDismissListener(null)
        sheet?.dismiss()
        sheet = null
        super.onDestroy()
    }

}
