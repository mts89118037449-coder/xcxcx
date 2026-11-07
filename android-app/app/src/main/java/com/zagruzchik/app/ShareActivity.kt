package com.zagruzchik.app

import android.app.Activity
import android.content.Intent
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.TextUtils
import android.widget.Button
import android.widget.Toast

/** Окошко, которое появляется после «Поделиться → Загрузчик». */
class ShareActivity : Activity() {

    private val handler = Handler(Looper.getMainLooper())
    private var secondsLeft = 8
    private var url: String = ""

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        url = Links.extract(intent.getStringExtra(Intent.EXTRA_TEXT) ?: intent.dataString) ?: run {
            Toast.makeText(this, "В том, чем поделились, нет ссылки", Toast.LENGTH_LONG).show()
            finish()
            return
        }

        val default = Links.defaultFormat(url)
        val formats = if (Spotify.isSpotify(url)) listOf(Format.MP3) else Format.entries.toList()

        val root = column(22).apply {
            background = GradientDrawable().apply {
                cornerRadius = dp(24).toFloat()
                setColor(themeColor(android.R.attr.colorBackground))
            }
        }
        root.addView(text("Скачать", 20f, bold = true))
        root.addView(text(url, 13f, muted = true).apply {
            maxLines = 2
            ellipsize = TextUtils.TruncateAt.END
        })

        var defaultButton: Button? = null
        for (f in formats) {
            val b = button(f.label, primary = f == default) { start(f) }
            if (f == default) defaultButton = b
            root.addView(b)
        }
        setContentView(root)
        window.setLayout((resources.displayMetrics.widthPixels * 0.9).toInt(), android.view.ViewGroup.LayoutParams.WRAP_CONTENT)

        // Если ничего не нажать, через 8 секунд начнётся загрузка в формате по умолчанию.
        val tick = object : Runnable {
            override fun run() {
                if (secondsLeft == 0) return start(default)
                defaultButton?.text = "${default.label} · $secondsLeft"
                secondsLeft--
                handler.postDelayed(this, 1000)
            }
        }
        tick.run()
    }

    private fun start(format: Format) {
        handler.removeCallbacksAndMessages(null)
        if (isFinishing) return
        DownloadService.enqueue(this, url, format)
        // Сразу показываем приложение со списком загрузок и прогрессом.
        startActivity(Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP))
        finish()
    }

    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        super.onDestroy()
    }
}
