package com.zagruzchik.app

import android.os.Handler
import android.os.Looper
import android.os.SystemClock

/**
 * Сторож интерфейса: если главный поток занят дольше 0,4 с (экран «замер»), в журнал пишется «ЗАВИСАНИЕ ИНТЕРФЕЙСА» —
 * сколько длилось и где в коде он был занят. Чтобы ускорять по фактам, а не наугад.
 */
object UiWatchdog {
    @Volatile private var tick = 0L
    @Volatile private var started = false

    fun start() {
        if (started) return
        started = true
        val main = Handler(Looper.getMainLooper())
        val mainThread = Looper.getMainLooper().thread
        Thread({
            while (true) {
                val sent = SystemClock.uptimeMillis()
                tick = 0L
                main.post { tick = SystemClock.uptimeMillis() }
                Thread.sleep(400)
                if (tick != 0L) { Thread.sleep(600); continue }
                // Не ответил за 0,4 с — запоминаем, где он сейчас, и ждём, сколько ещё.
                val where = mainThread.stackTrace.filter { it.className.startsWith("com.zagruzchik") }.take(4)
                    .joinToString(" ← ") { "${it.className.substringAfterLast('.')}.${it.methodName}:${it.lineNumber}" }
                    .ifEmpty { mainThread.stackTrace.take(3).joinToString(" ← ") { "${it.className.substringAfterLast('.')}.${it.methodName}" } }
                while (tick == 0L && SystemClock.uptimeMillis() - sent < 10_000) Thread.sleep(50)
                val ms = (if (tick != 0L) tick else SystemClock.uptimeMillis()) - sent
                AppLog.add("ЗАВИСАНИЕ ИНТЕРФЕЙСА ${ms / 100 / 10.0} с: $where")
                Thread.sleep(1000)
            }
        }, "ui-watchdog").apply { isDaemon = true; priority = Thread.MIN_PRIORITY }.start()
    }
}
