package com.zagruzchik.app

import android.content.Context
import android.net.ConnectivityManager
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicInteger

/**
 * «Медиатека на телефоне»: в фоне находит и скачивает каждую любимую песню целиком. Скачанная песня играет с телефона —
 * сразу, без сети, без пауз и без «не нашлась». Это и есть способ получить поведение «как в большом сервисе» без своего каталога:
 * всё, что можно найти, находится один раз и заранее, а не в момент нажатия.
 */
object LibrarySync {
    // Одна загрузка за раз, с низким приоритетом: журнал 17.11 — две параллельные загрузки через Python душили телефон.
    private const val THREADS = 1
    private val pool = Executors.newFixedThreadPool(THREADS + 1) { r ->
        Thread({ android.os.Process.setThreadPriority(android.os.Process.THREAD_PRIORITY_BACKGROUND); r.run() }, "library-sync")
    }
    @Volatile var running = false; private set
    /** Сколько любимых песен уже на телефоне и сколько всего (для экрана). */
    @Volatile var onPhone = 0; private set
    @Volatile var total = 0; private set
    /** Сколько не нашлось нигде за этот проход. */
    @Volatile var missing = 0; private set
    @Volatile var note = ""; private set
    private val listeners = java.util.concurrent.CopyOnWriteArraySet<() -> Unit>()
    fun listen(l: () -> Unit) { listeners += l }
    fun unlisten(l: () -> Unit) { listeners -= l }
    private val main = android.os.Handler(android.os.Looper.getMainLooper())
    private fun changed() { main.post { listeners.forEach { it() } } }

    /** Пересчитать в фоне (проверка файлов трогает диск — в потоке интерфейса это давало бы паузу). */
    fun countAsync() { pool.execute { runCatching { count() } } }

    private fun count() {
        val fav = Library.favorites
        total = fav.size
        onPhone = fav.count { Library.localFor(it) != null || MediaCache.has(it) }
        changed()
    }

    fun start(ctx: Context) {
        val app = ctx.applicationContext
        if (running || Settings.sync(app) == Settings.Sync.OFF) return
        running = true
        pool.execute {
            try {
                count()
                // Мусор от переноса (надписи с экрана, «Поиск в плейлисте — Поиск в плейлисте») не ищем: журнал 17.11.
                val list = Library.favorites.filter { Library.localFor(it) == null && !MediaCache.has(it) &&
                    !it.title.equals(it.artist, ignoreCase = true) && it.title.isNotBlank() }
                AppLog.add("МЕДИАТЕКА НА ТЕЛЕФОНЕ: старт, осталось скачать ${list.size} из $total")
                missing = 0
                val next = AtomicInteger(0)
                val miss = AtomicInteger(0)
                val streamed = AtomicInteger(0)
                (1..THREADS).map {
                    pool.submit {
                        while (true) {
                            val i = next.getAndIncrement()
                            if (i >= list.size) break
                            if (!allowed(app)) { note = "Жду Wi‑Fi"; changed(); break }
                            if (!MediaCache.hasRoom(app)) { note = "Память заполнена — увеличьте «Память прослушанного»"; changed(); break }
                            note = ""
                            val t = list[i]
                            Streams.waitForeground() // человек что-то включает или выбирает источник — фон молчит
                            val s = Streams.forSync(t)
                            if (s != null) Streams.waitForeground()
                            val ok = s != null && runCatching { MediaCache.storeNow(app, t, s, keep = true) }.getOrDefault(false)
                            // Нашлась, но потоком по кусочкам (SoundCloud, HLS) — играет из сети, на телефон её не кладём; это не «не нашлась».
                            val streamOnly = s != null && s.url.contains(".m3u8")
                            if (ok) { onPhone++; HeadCache.drop(t) } else if (streamOnly) streamed.incrementAndGet() else missing = miss.incrementAndGet()
                            if ((i + 1) % 10 == 0) AppLog.add("МЕДИАТЕКА НА ТЕЛЕФОНЕ: на телефоне $onPhone из $total, не нашлось $missing, только из сети (SoundCloud) ${streamed.get()}")
                            changed()
                            Thread.sleep(300)
                        }
                    }
                }.forEach { runCatching { it.get() } }
                AppLog.add("МЕДИАТЕКА НА ТЕЛЕФОНЕ: проход закончен — на телефоне $onPhone из $total, не нашлось $missing${if (note.isNotEmpty()) " ($note)" else ""}")
            } finally { running = false; changed() }
        }
    }

    private fun allowed(ctx: Context): Boolean = when (Settings.sync(ctx)) {
        Settings.Sync.OFF -> false
        Settings.Sync.ALWAYS -> true
        Settings.Sync.WIFI -> runCatching { !ctx.getSystemService(ConnectivityManager::class.java).isActiveNetworkMetered }.getOrDefault(false)
    }

    /** Короткая строка состояния для экрана. */
    fun status(ctx: Context): String {
        val mode = Settings.sync(ctx)
        val base = "на телефоне $onPhone из $total"
        return when {
            mode == Settings.Sync.OFF -> "Выключено · $base"
            note.isNotEmpty() -> "$base · $note"
            running -> "$base · скачиваю…" + if (missing > 0) " (не нашлось $missing)" else ""
            else -> base + if (missing > 0) " · не нашлось $missing" else ""
        }
    }
}
