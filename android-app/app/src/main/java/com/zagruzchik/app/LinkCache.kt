package com.zagruzchik.app

import android.os.Handler
import android.os.Looper
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors

/**
 * Ссылки на песню во всех сервисах — готовятся заранее, как только песня заиграла.
 * Поэтому «Поделиться» в плеере срабатывает сразу, без ожидания.
 */
object LinkCache {
    class Entry(@Volatile var track: Track) {
        val links = ConcurrentHashMap<Service, Transfer.Link>()
        val listeners = mutableListOf<() -> Unit>()
        val ready get() = links.size >= Transfer.ORDER.size
    }

    private val entries = ConcurrentHashMap<String, Entry>()
    private val pool = Executors.newFixedThreadPool(4)
    private val main = Handler(Looper.getMainLooper())

    fun key(t: Track) = Match.base(t.title) + "|" + Match.norm(t.artist)

    fun get(t: Track): Entry? = entries[key(t)]

    /** Начать искать ссылки. [sourceUrl] — исходная ссылка (её сервис уже известен). */
    fun prefetch(t: Track, sourceUrl: String? = null): Entry {
        val k = key(t)
        entries[k]?.let { return it }
        val e = Entry(t)
        entries.putIfAbsent(k, e)?.let { return it }
        pool.execute {
            val rich = runCatching { Transfer.enrich(t) }.getOrDefault(t)
            e.track = rich
            val source = sourceUrl?.let { Service.of(it) }
            if (source != null && sourceUrl != null) e.links[source] = Transfer.Link(source, sourceUrl, true)
            notify(e)
            for (s in Transfer.ORDER) {
                if (e.links.containsKey(s)) continue
                pool.execute {
                    // Ссылки для «Поделиться» — фоновая работа: не мешает тому, что играет и ищется.
                    runCatching { Ytdlp.inBackground { Transfer.find(s, rich, Downloader::youtubeId) } }
                        .onSuccess {
                            e.links[s] = it
                            notify(e)
                        }
                }
            }
        }
        return e
    }

    /** Все ссылки по порядку: найденные — как есть, ещё не найденные — поиск в сервисе (чтобы делиться сразу). */
    fun linksFor(e: Entry): List<Transfer.Link> =
        Transfer.ORDER.map { s -> e.links[s] ?: Transfer.Link(s, s.searchUrl(e.track.query), false) }

    fun listen(e: Entry, cb: () -> Unit) { synchronized(e.listeners) { e.listeners += cb } }
    fun unlisten(e: Entry, cb: () -> Unit) { synchronized(e.listeners) { e.listeners -= cb } }

    private fun notify(e: Entry) = main.post { synchronized(e.listeners) { e.listeners.toList() }.forEach { it() } }
}
