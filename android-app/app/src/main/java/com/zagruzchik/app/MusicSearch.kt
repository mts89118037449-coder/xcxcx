package com.zagruzchik.app

import org.json.JSONObject

/**
 * Поиск песен по названию через открытые API (Deezer, Apple/iTunes) — без ключей, быстро.
 * Возвращает треки с обложкой и длительностью; дальше их можно сразу слушать или скачать.
 */
object MusicSearch {
    fun search(query: String, limit: Int = 20): List<Track> {
        val q = query.trim()
        if (q.length < 2) return emptyList()
        val deezer = runCatching { deezer(q, limit) }.getOrDefault(emptyList())
        val apple = if (deezer.size < 8) runCatching { apple(q, limit) }.getOrDefault(emptyList()) else emptyList()
        // Без повторов: одна и та же песня из двух каталогов показывается один раз.
        val seen = HashSet<String>()
        return (deezer + apple).filter { seen.add(Match.base(it.title) + "|" + Match.norm(it.artist)) }.take(limit)
    }

    private fun deezer(q: String, limit: Int): List<Track> {
        val data = Http.json("https://api.deezer.com/search?limit=$limit&q=" + Http.enc(q)).optJSONArray("data") ?: return emptyList()
        return (0 until data.length()).map { DeezerSource.track(data.getJSONObject(it)) }
    }

    private fun apple(q: String, limit: Int): List<Track> {
        val r = Http.json("https://itunes.apple.com/search?entity=song&country=us&limit=$limit&term=" + Http.enc(q)).getJSONArray("results")
        return (0 until r.length()).map { AppleSource.track(r.getJSONObject(it)) }
    }
}

/** Готовый к проигрыванию поток: прямая ссылка, страница источника (для скачивания) и откуда он. */
data class StreamInfo(val url: String, val pageUrl: String, val source: String, val cover: String?, val title: String)

/**
 * Поток для «Слушать» без скачивания.
 * Шаг 1 — быстрый поиск (без разбора каждого результата), выбор лучшего варианта сами;
 * шаг 2 — прямая ссылка только для него. Сначала SoundCloud, потом YouTube Music и YouTube.
 * prefetch() начинает это заранее (когда открыли панель «Поделиться» или показали результаты поиска),
 * поэтому к нажатию «Слушать» поток часто уже готов.
 */
object Streams {
    private const val TTL_MS = 50 * 60 * 1000L // ссылки на поток живут около часа
    private val done = java.util.concurrent.ConcurrentHashMap<String, Pair<Long, StreamInfo>>()
    private val pending = java.util.concurrent.ConcurrentHashMap<String, java.util.concurrent.Future<StreamInfo>>()
    private val pool = java.util.concurrent.Executors.newFixedThreadPool(3)

    private fun key(t: Track) = Match.base(t.title) + "|" + Match.norm(t.artist)

    /** Начать готовить поток заранее. */
    fun prefetch(t: Track) {
        val k = key(t)
        if (cached(k) != null || pending.containsKey(k)) return
        pending[k] = pool.submit<StreamInfo> {
            try { find(t).also { done[k] = System.currentTimeMillis() to it } } finally { pending.remove(k) }
        }
    }

    /** Готовый поток (ждёт, если он уже готовится). Вызывать не из главного потока. */
    fun resolve(t: Track): StreamInfo {
        val k = key(t)
        cached(k)?.let { return it }
        pending[k]?.let { f ->
            try { return f.get() } catch (e: java.util.concurrent.ExecutionException) { throw e.cause ?: e }
        }
        return find(t).also { done[k] = System.currentTimeMillis() to it }
    }

    /** Готовый поток, если уже нашли (тогда фрагмент не нужен — сразу полная версия). */
    fun cachedFor(t: Track): StreamInfo? = cached(key(t))

    private fun cached(k: String) = done[k]?.let { (time, s) -> s.takeIf { System.currentTimeMillis() - time < TTL_MS } }

    private fun find(t: Track): StreamInfo {
        App.awaitReady()
        val sources = listOf(
            "SoundCloud" to "scsearch8:${t.query}",
            "YouTube Music" to "https://music.youtube.com/search?q=" + Http.enc(t.query) + "#songs",
            "YouTube" to "ytsearch6:${t.query}",
        )
        for ((name, query) in sources) {
            val candidates = Match.ranked(t, Downloader.searchCandidates(query, name)) { Triple(it.title, it.author, it.duration) }
            // Платные треки (DRM) не играют — пробуем следующий вариант.
            for (c in candidates.take(3)) {
                val s = Downloader.streamOf(c.url, name, c.title) ?: continue
                return s
            }
        }
        throw UserError("Не нашёл «${t.label}» для прослушивания. Попробуйте «Скачать» — там больше источников.")
    }
}
