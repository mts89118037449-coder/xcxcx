package com.zagruzchik.app

import com.yausername.youtubedl_android.YoutubeDL
import com.yausername.youtubedl_android.YoutubeDLException
import com.yausername.youtubedl_android.YoutubeDLRequest
import com.yausername.youtubedl_android.YoutubeDLResponse
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.Semaphore
import java.util.concurrent.TimeUnit
import java.util.concurrent.TimeoutException

/**
 * Каждый запуск yt-dlp — отдельный Python на телефоне. Правила, чтобы ничего не зависало:
 * - одновременно не больше 4 (нажатое — без очереди, фон — когда есть свободные места);
 * - у каждого запуска есть предел времени: не ответил — останавливаем и говорим об этом;
 * - остановка процессов — в фоне, не на экране.
 */
object Ytdlp {
    private const val SLOTS = 4
    private val gate = Semaphore(SLOTS, true)
    private val background = ThreadLocal<Boolean>()
    private val runner = Executors.newCachedThreadPool()
    private val killer = Executors.newSingleThreadExecutor()

    /** Выполнить [block] как фоновую работу (подготовка заранее, память прослушанного). */
    fun <T> inBackground(block: () -> T): T {
        val was = background.get()
        background.set(true)
        try { return block() } finally { background.set(was) }
    }

    /** Монопольно (замена движка): ждём, пока все запуски закончатся, но не дольше [maxSec]. */
    fun exclusive(maxSec: Long, block: () -> Unit) {
        val got = gate.tryAcquire(SLOTS, maxSec, TimeUnit.SECONDS)
        if (!got) return
        try { block() } finally { gate.release(SLOTS) }
    }

    /**
     * Запуск yt-dlp. [timeoutSec] — сколько ждать ответа; по истечении процесс останавливается
     * и выбрасывается понятная ошибка, а не вечная крутилка.
     */
    fun execute(r: YoutubeDLRequest, processId: String? = null, timeoutSec: Long = 45): YoutubeDLResponse {
        val bg = background.get() == true
        if (bg) {
            val deadline = System.currentTimeMillis() + 120_000
            while (true) {
                if (gate.availablePermits() >= 2 && gate.tryAcquire()) break
                if (System.currentTimeMillis() > deadline) throw UserError("Занято — попробую позже")
                Thread.sleep(300)
            }
        } else if (!gate.tryAcquire(60, TimeUnit.SECONDS)) {
            throw UserError("Слишком много задач сразу — попробуйте ещё раз")
        }
        val id = processId ?: ("y-" + UUID.randomUUID())
        try {
            val f = runner.submit<YoutubeDLResponse> {
                YoutubeDL.getInstance().execute(r, processId = id, redirectErrorStream = false, callback = null)
            }
            return try {
                f.get(timeoutSec, TimeUnit.SECONDS)
            } catch (e: TimeoutException) {
                cancel(id)
                f.cancel(true)
                throw UserError("Площадка не ответила за $timeoutSec с")
            } catch (e: java.util.concurrent.ExecutionException) {
                throw (e.cause as? YoutubeDLException) ?: (e.cause as? Exception) ?: e
            }
        } finally {
            gate.release()
        }
    }

    /** Остановить запуск — в фоне (библиотека при этом запускает внешнюю команду и ждёт её). */
    fun cancel(processId: String) {
        killer.execute { runCatching { YoutubeDL.getInstance().destroyProcessById(processId) } }
    }
}
