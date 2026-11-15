package com.zagruzchik.app

import android.content.Context
import android.content.Intent
import androidx.core.content.FileProvider
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Журнал работы: что искали, что ответила каждая площадка, почему не взялся звук, какие ошибки дал проигрыватель.
 * Хранится в приложении (последние ~400 КБ); «Отправить журнал» — файлом в любой мессенджер.
 */
object AppLog {
    private const val MAX = 400 * 1024L
    private val fmt = SimpleDateFormat("dd.MM HH:mm:ss.SSS", Locale.US)
    private val file: File? get() = runCatching { File(App.instance.filesDir, "journal.txt") }.getOrNull()

    @Synchronized fun add(text: String) {
        val f = file ?: return
        runCatching {
            if (f.length() > MAX) { val tail = f.readText().takeLast((MAX / 2).toInt()); f.writeText(tail) }
            f.appendText(fmt.format(Date()) + "  " + text.trimEnd() + "\n")
        }
    }

    fun error(where: String, e: Throwable?) {
        var x = e; val parts = mutableListOf<String>()
        while (x != null && parts.size < 4) { parts += "${x.javaClass.simpleName}: ${x.message.orEmpty().take(200)}"; x = x.cause }
        add("ОШИБКА $where — " + parts.joinToString(" ← "))
    }

    fun share(ctx: Context) {
        val src = file?.takeIf { it.exists() } ?: return
        val dir = File(ctx.cacheDir, "share").apply { mkdirs() }
        val out = File(dir, "soundaura-journal.txt")
        val head = "SoundAura ${runCatching { ctx.packageManager.getPackageInfo(ctx.packageName, 0).versionName }.getOrNull()} · " +
            "Android ${android.os.Build.VERSION.RELEASE} · ${android.os.Build.MODEL} · VPN: ${Net.vpnActive()} · VPN на телефоне есть, но приложение мимо него: ${Net.vpnBypassed()} · YouTube напрямую: ${Net.youtubeDirect}\n\n"
        out.writeText(head + src.readText())
        val uri = FileProvider.getUriForFile(ctx, ctx.packageName + ".files", out)
        ctx.startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_STREAM, uri)
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION), "Отправить журнал").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
}
