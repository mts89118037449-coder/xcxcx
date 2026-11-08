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
        // Каталоги сами ставят переделки (Piano, Remix…) выше оригинала — пересортировываем:
        // оригинал выше переделок, версия без цензуры выше «чистой», порядок каталога — при равенстве.
        val qw = Match.norm(q).split(' ').filter { it.length > 1 }
        fun coverage(t: Track): Double {
            if (qw.isEmpty()) return 1.0
            val hay = Match.norm(t.title + " " + t.artist)
            return qw.count { hay.contains(it) }.toDouble() / qw.size
        }
        // Главное — похожесть на запрос; дальше оригинал выше переделок, без цензуры — чуть выше.
        val ranked = (deezer + apple).withIndex().sortedByDescending { (i, t) ->
            3.0 * coverage(t) - 1.5 * Match.versionPenaltyWords(t.title, q).size +
                (if (t.explicit || Match.isUncensored(t.title)) 0.4 else 0.0) - i * 0.01
        }.map { it.value }
        // Без повторов, но версия без цензуры не теряется за «чистой» с тем же названием.
        val seen = HashSet<String>()
        return ranked.filter { seen.add(Match.base(it.title) + "|" + Match.norm(it.artist) + "|" + it.explicit) }.take(limit)
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
    private val searchPool = java.util.concurrent.Executors.newCachedThreadPool()

    private fun key(t: Track) = Match.base(t.title) + "|" + Match.norm(t.artist)

    /** Начать готовить поток заранее. */
    fun prefetch(t: Track) {
        val k = key(t)
        if (cached(k) != null || pending.containsKey(k)) return
        pending[k] = pool.submit<StreamInfo> {
            try { Ytdlp.inBackground { find(t) }.also { done[k] = System.currentTimeMillis() to it } } finally { pending.remove(k) }
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
        // Каждая площадка сразу и ищет, и берёт ссылку на звук — все одновременно.
        // Берём по старшинству (SoundCloud → YouTube Music → YouTube), но не ждём старшую дольше 4 с,
        // если младшая уже готова: полная версия включается за 1–2 секунды.
        val extra = searchPool.submit<List<WebResult>> { runCatching { WebSearch.extraCandidates(t) }.getOrDefault(emptyList()) }
        val jobs = sources.map { (name, query) ->
            searchPool.submit<StreamInfo?> {
                val candidates = runCatching { Match.ranked(t, Downloader.searchCandidates(query, name)) { Triple(it.title, it.author, it.duration) } }
                    .getOrDefault(emptyList())
                // Платные треки (DRM) не играют — пробуем следующий вариант.
                candidates.take(3).firstNotNullOfOrNull { c -> Downloader.streamOf(c.url, name, c.title) }
            }
        }
        val started = System.currentTimeMillis()
        while (true) {
            for ((i, f) in jobs.withIndex()) {
                if (!f.isDone) continue
                val s = runCatching { f.get() }.getOrNull() ?: continue
                val seniorsDone = jobs.take(i).all { it.isDone }
                if (seniorsDone || System.currentTimeMillis() - started > 4000) return s
            }
            if (jobs.all { it.isDone }) break
            Thread.sleep(40)
        }
        // Нет на SoundCloud/YouTube (удалили) — другие площадки: Яндекс, Rutube, Internet Archive…
        for (w in runCatching { extra.get() }.getOrDefault(emptyList()).take(4)) {
            val s = if (w.direct) StreamInfo(w.url, w.url, w.source, w.cover, w.title)
            else Downloader.streamOf(w.url, w.source, w.title)
            if (s != null) return s
        }
        throw UserError("Не нашёл «${t.label}» ни на одной площадке: SoundCloud, YouTube, Яндекс, Rutube, Internet Archive, Dailymotion, Audius.")
    }
}
