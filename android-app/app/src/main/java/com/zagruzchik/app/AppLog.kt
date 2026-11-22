package com.zagruzchik.app

import android.content.Context
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Журнал работы: что искали, что ответила каждая площадка, почему не взялся звук, какие ошибки дал проигрыватель.
 * Хранится в приложении (последние ~400 КБ); «Скопировать журнал» — текстом в буфер обмена (новое сверху).
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

    private const val START = "=== ЗАПУСК "
    private val slowStart = Regex("""· (\d+(?:\.\d+)?) с$""")

    /**
     * Новый запуск приложения: прошлые запуски без сбоев из журнала убираются, со сбоями — остаются (не больше пяти последних).
     * Так журнал не копит мусор, а то, что нужно для разбора, не теряется.
     */
    @Synchronized fun startSession(version: String?) {
        val f = file ?: return
        runCatching {
            if (f.exists()) {
                // Журнал делится на запуски по строке-метке; то, что было до первой метки (старые сборки), — тоже один «запуск».
                val parts = mutableListOf(StringBuilder())
                f.forEachLine { l ->
                    if (START in l && parts.last().isNotEmpty()) parts += StringBuilder()
                    parts.last().append(l).append('\n')
                }
                val keep = parts.map { it.toString() }.filter { it.isNotBlank() && hasTrouble(it) }.takeLast(5)
                f.writeText(keep.joinToString(""))
            }
            f.appendText(fmt.format(Date()) + "  " + START + "SoundAura $version ===\n")
        }
    }

    /** Был ли в этом запуске сбой: ошибка, песня не нашлась или не пошла, пауза не по кнопке, долгий старт (больше 5 с). */
    private fun hasTrouble(part: String): Boolean = part.lineSequence().any { l ->
        "ОШИБКА" in l || "НЕ НАШЛАСЬ" in l || "ЗАВИСАНИЕ ИНТЕРФЕЙСА" in l || "ОЧЕРЕДЬ ПРОИГРЫВАТЕЛЯ КОНЧИЛАСЬ" in l || "ВЫБРАННЫЙ ИСТОЧНИК не ответил" in l ||
            "РАДИО: продолжение не нашлось" in l ||
            ("ПАУЗА" in l && "причина:" in l && "кнопка" !in l && "отключились наушники" !in l) ||
            ("ЗВУК ПОШЁЛ" in l && (slowStart.find(l.trimEnd())?.groupValues?.get(1)?.toDoubleOrNull() ?: 0.0) > 5)
    }

    fun error(where: String, e: Throwable?) {
        var x = e; val parts = mutableListOf<String>()
        while (x != null && parts.size < 4) { parts += "${x.javaClass.simpleName}: ${x.message.orEmpty().take(200)}"; x = x.cause }
        add("ОШИБКА $where — " + parts.joinToString(" ← "))
    }

    /**
     * Журнал — в буфер обмена (новое сверху), чтобы вставить в чат одним нажатием. Не больше ~60 тысяч знаков: длинный
     * текст чат всё равно обрежет, а так обрезается старое, а не свежее.
     */
    fun copy(ctx: Context) {
        val src = file?.takeIf { it.exists() }
        val head = "SoundAura ${runCatching { ctx.packageManager.getPackageInfo(ctx.packageName, 0).versionName }.getOrNull()} · " +
            "Android ${android.os.Build.VERSION.RELEASE} · ${android.os.Build.MODEL} · VPN: ${Net.vpnActive()} · VPN на телефоне есть, но приложение мимо него: ${Net.vpnBypassed()} · YouTube напрямую: ${Net.youtubeDirect} · yt-dlp ${YtdlpDaemon.version}\n\n(новые записи — сверху)\n\n"
        val entries = mutableListOf(StringBuilder())
        val stamp = Regex("^\\d\\d\\.\\d\\d \\d\\d:\\d\\d")
        src?.forEachLine { l ->
            if (stamp.containsMatchIn(l) && entries.last().isNotEmpty()) entries += StringBuilder()
            entries.last().append(l).append('\n')
        }
        val out = StringBuilder(head)
        for (e in entries.asReversed()) { if (out.length + e.length > LIMIT) break; out.append(e) }
        val cm = ctx.getSystemService(android.content.ClipboardManager::class.java)
        cm?.setPrimaryClip(android.content.ClipData.newPlainText("Журнал SoundAura", out.toString()))
        android.widget.Toast.makeText(ctx, "Журнал скопирован — вставьте его в чат", android.widget.Toast.LENGTH_SHORT).show()
    }
    private const val LIMIT = 60_000

}
