package com.zagruzchik.app

import com.yausername.youtubedl_android.YoutubeDL
import com.yausername.youtubedl_android.YoutubeDLRequest
import com.yausername.youtubedl_android.YoutubeDLResponse
import java.util.concurrent.Semaphore

/**
 * Каждый запуск yt-dlp — отдельный Python на телефоне. Если запустить их десяток разом
 * (поиск + подготовка заранее + память прослушанного), телефон захлёбывается и всё
 * опаздывает. Поэтому одновременно — не больше 4; то, что нажал человек, идёт без очереди,
 * а фоновая подготовка — только когда есть свободные места.
 */
object Ytdlp {
    private const val SLOTS = 4
    private val gate = Semaphore(SLOTS, true)
    private val background = ThreadLocal<Boolean>()

    /** Выполнить [block] как фоновую работу (подготовка заранее, память прослушанного). */
    fun <T> inBackground(block: () -> T): T {
        val was = background.get()
        background.set(true)
        try { return block() } finally { background.set(was) }
    }

    fun execute(r: YoutubeDLRequest, processId: String? = null): YoutubeDLResponse {
        if (background.get() == true) {
            // Фон ждёт, пока освободятся хотя бы 2 места — чтобы не мешать тому, что нажали.
            while (true) {
                if (gate.availablePermits() >= 2 && gate.tryAcquire()) break
                Thread.sleep(300)
            }
        } else {
            gate.acquire()
        }
        try {
            return YoutubeDL.getInstance().execute(r, processId = processId, redirectErrorStream = false, callback = null)
        } finally {
            gate.release()
        }
    }

    fun cancel(processId: String) = runCatching { YoutubeDL.getInstance().destroyProcessById(processId) }
}
