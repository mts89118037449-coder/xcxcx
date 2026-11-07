package com.zagruzchik.app

import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.isVisible
import com.google.android.material.bottomsheet.BottomSheetBehavior
import com.google.android.material.bottomsheet.BottomSheetDialog
import com.google.android.material.button.MaterialButton
import com.google.android.material.button.MaterialButtonToggleGroup

/** «Поделиться → Загрузчик»: снизу выезжает панель с выбором формата. */
class ShareActivity : AppCompatActivity() {

    private val handler = Handler(Looper.getMainLooper())
    private var secondsLeft = AUTO_START_SEC
    private var started = false

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
        val view = layoutInflater.inflate(R.layout.sheet_share, null)
        sheet.setContentView(view)
        sheet.behavior.state = BottomSheetBehavior.STATE_EXPANDED
        sheet.behavior.skipCollapsed = true

        view.findViewById<TextView>(R.id.service).text = Describe.of(url)
        view.findViewById<TextView>(R.id.url).text = url
        val formats = view.findViewById<MaterialButtonToggleGroup>(R.id.formats)
        FormatPicker.setup(formats, url)
        val download = view.findViewById<MaterialButton>(R.id.download)
        val transfer = view.findViewById<MaterialButton>(R.id.transfer)
        transfer.isVisible = music
        // Пришли через быструю кнопку «Скачать» — сразу качаем в формате по умолчанию.
        val quickDownload = intent.getStringExtra(androidx.core.content.pm.ShortcutManagerCompat.EXTRA_SHORTCUT_ID) == Shortcuts.ID_DOWNLOAD

        fun start() {
            if (started) return
            started = true
            handler.removeCallbacksAndMessages(null)
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
            handler.removeCallbacksAndMessages(null)
            TransferActivity.open(this, url, shared)
            sheet.dismiss()
        }
        // Человек начал выбирать формат — не торопим его таймером.
        formats.addOnButtonCheckedListener { _, _, _ -> stopCountdown(download) }
        sheet.setOnDismissListener { finish() }
        sheet.show()

        if (quickDownload) {
            start()
            return
        }
        // Для видео: если ничего не нажать, загрузка начнётся сама. Для музыки — нет:
        // человек мог прийти за ссылками в других сервисах.
        if (!music) {
            val tick = object : Runnable {
                override fun run() {
                    if (secondsLeft == 0) return start()
                    download.text = "Скачать · $secondsLeft"
                    secondsLeft--
                    handler.postDelayed(this, 1000)
                }
            }
            handler.post(tick)
        }
    }

    private fun stopCountdown(download: MaterialButton) {
        handler.removeCallbacksAndMessages(null)
        download.text = "Скачать"
    }

    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        super.onDestroy()
    }

    companion object {
        private const val AUTO_START_SEC = 8
    }
}
