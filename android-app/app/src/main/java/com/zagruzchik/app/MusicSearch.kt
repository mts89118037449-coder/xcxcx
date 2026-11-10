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
    // Подготовка заранее: 3 одновременно, свежие экраны — первыми (очередь «последним пришёл — первым готовим»).
    private val pool = java.util.concurrent.ThreadPoolExecutor(3, 3, 30, java.util.concurrent.TimeUnit.SECONDS,
        java.util.concurrent.LinkedBlockingDeque<Runnable>().let { q ->
            object : java.util.concurrent.LinkedBlockingDeque<Runnable>() {
                override fun offer(e: Runnable) = offerFirst(e) // LIFO
            }
        })
    private val searchPool = java.util.concurrent.Executors.newCachedThreadPool()
    /** Подготовка, начатая списком (экраном): при новом экране ещё не начатые — отменяем. */
    private val batch = java.util.Collections.synchronizedList(mutableListOf<Pair<String, java.util.concurrent.Future<StreamInfo>>>())

    private fun key(t: Track) = Match.base(t.title) + "|" + Match.norm(t.artist)

    /** Начать готовить поток заранее. */
    fun prefetch(t: Track): java.util.concurrent.Future<StreamInfo>? {
        val k = key(t)
        if (cached(k) != null) return null
        pending[k]?.takeIf { !it.isCancelled }?.let { return it }
        val f = pool.submit<StreamInfo> {
            try { Ytdlp.inBackground { find(t) }.also { done[k] = System.currentTimeMillis() to it } } finally { pending.remove(k) }
        }
        pending[k] = f
        return f
    }

    /**
     * Песни очереди, которые зазвучат следующими: готовим заранее (ближайшая — первой),
     * чтобы слушать подряд без ожидания. Экранная подготовка их не отменяет.
     */
    fun prefetchAhead(tracks: List<Track>) {
        tracks.asReversed().forEach { prefetch(it) } // очередь подготовки «последним пришёл — первым», поэтому с конца
    }

    /** Палец коснулся песни — начинаем искать сразу, без очереди: к отпусканию часть работы уже сделана. */
    fun touch(t: Track) {
        val k = key(t)
        if (cached(k) != null) return
        pending[k]?.let { f -> if (!f.cancel(false)) return; pending.remove(k, f) }
        pending[k] = searchPool.submit<StreamInfo> {
            try { find(t).also { done[k] = System.currentTimeMillis() to it } } finally { pending.remove(k) }
        }
    }

    /**
     * Готовим первые песни экрана (чарт, альбом, результаты поиска), чтобы по нажатию
     * полная версия включалась сразу с начала. Не начатое от прошлого экрана — отменяем.
     */
    fun prefetchMany(tracks: List<Track>, n: Int = 6) {
        synchronized(batch) {
            batch.forEach { (k, f) -> if (f.cancel(false)) pending.remove(k, f) }
            batch.clear()
        }
        // В обратном порядке: очередь LIFO, так первая песня экрана готовится первой.
        tracks.take(n).reversed().forEach { t -> prefetch(t)?.let { batch += key(t) to it } }
    }

    /** Готовый поток (ждёт, если он уже готовится). Вызывать не из главного потока. */
    fun resolve(t: Track): StreamInfo {
        val k = key(t)
        cached(k)?.let { return it }
        // Недавно искали и не нашли (платная, удалена) — не ищем те же полминуты заново.
        failed[k]?.let { (time, e) -> if (System.currentTimeMillis() - time < FAIL_TTL_MS) throw e else failed.remove(k) }
        pending[k]?.let { f ->
            // Ещё в очереди подготовки — не ждём её, ищем сами сразу; уже ищется — ждём (так быстрее).
            if (f.cancel(false)) pending.remove(k, f)
            else try { return f.get() } catch (e: java.util.concurrent.ExecutionException) { throw e.cause ?: e } catch (_: java.util.concurrent.CancellationException) {}
        }
        return try { find(t).also { done[k] = System.currentTimeMillis() to it } }
        catch (e: UserError) { failed[k] = System.currentTimeMillis() to e; throw e }
    }

    private const val FAIL_TTL_MS = 20 * 60 * 1000L
    private val failed = java.util.concurrent.ConcurrentHashMap<String, Pair<Long, UserError>>()
    /** «Ещё раз» — искать заново, даже если недавно не нашли. */
    fun forgetFailure(t: Track) { failed.remove(key(t)) }

    // Конкретная страница (результат «Везде в интернете», история): ссылка на звук — тоже заранее.
    private val pages = java.util.concurrent.ConcurrentHashMap<String, java.util.concurrent.Future<StreamInfo?>>()
    private val pageTimes = java.util.concurrent.ConcurrentHashMap<String, Long>()

    fun prefetchPage(pageUrl: String, source: String, title: String): java.util.concurrent.Future<StreamInfo?> {
        val t = pageTimes[pageUrl]
        pages[pageUrl]?.takeIf { t != null && System.currentTimeMillis() - t < TTL_MS }?.let { return it }
        pageTimes[pageUrl] = System.currentTimeMillis()
        val bg = Ytdlp.isBackground
        return searchPool.submit<StreamInfo?> { Ytdlp.withBackground(bg) { Downloader.streamOf(pageUrl, source, title) } }.also { pages[pageUrl] = it }
    }

    /** Ссылка уже готова (подготовили заранее) — без ожидания. */
    fun pageIfReady(pageUrl: String): StreamInfo? = pages[pageUrl]?.takeIf { it.isDone }?.let { runCatching { it.get() }.getOrNull() }

    fun page(pageUrl: String, source: String, title: String): StreamInfo? =
        runCatching { prefetchPage(pageUrl, source, title).get() }.getOrNull().also { if (it == null) pages.remove(pageUrl) }

    /** Готовый поток, если уже нашли (тогда фрагмент не нужен — сразу полная версия). */
    fun cachedFor(t: Track): StreamInfo? = cached(key(t))

    private fun cached(k: String) = done[k]?.let { (time, s) -> s.takeIf { System.currentTimeMillis() - time < TTL_MS } }

    private fun find(t: Track): StreamInfo {
        App.awaitReady()
        val sources = listOf(
            "SoundCloud" to "scsearch8:${t.query}",
            "YouTube Music" to "https://music.youtube.com/search?q=" + Http.enc(t.query) + "#songs",
            "YouTube" to "ytsearch6:${t.query}",
            // Перезаливы часто названы иначе («Не вспоминать МАЯК Х») — ищем и по одному названию;
            // чужие песни с таким же названием отсеивает проверка исполнителя.
            "SoundCloud" to "scsearch10:${Match.base(t.title).ifEmpty { t.title }}",
        )
        // Каждая площадка сразу и ищет, и берёт ссылку на звук — все одновременно.
        // Берём по старшинству (SoundCloud → YouTube Music → YouTube), но не ждём старшую дольше 4 с,
        // если младшая уже готова: полная версия включается за 1–2 секунды.
        val bg = Ytdlp.isBackground // подготовка заранее не мешает нажатому
        val problems = java.util.concurrent.ConcurrentLinkedQueue<String>()
        val foundOn = java.util.concurrent.ConcurrentLinkedQueue<String>()
        val jobs = sources.map { (name, query) ->
            searchPool.submit<StreamInfo?> { Ytdlp.withBackground(bg) {
                val candidates = runCatching { Match.ranked(t, Downloader.searchCandidates(query, name)) { Triple(it.title, it.author, it.duration) } }
                    .getOrDefault(emptyList())
                // Ссылки для двух лучших берём одновременно (лучший может оказаться платным — DRM), третий — если оба не играют.
                if (candidates.isNotEmpty()) foundOn += name
                // Ссылки берём по две одновременно (лучший вариант может оказаться платным — DRM), до 4 вариантов.
                candidates.take(4).chunked(2).firstNotNullOfOrNull { pair ->
                    pair.map { c -> searchPool.submit<StreamInfo?> { Ytdlp.withBackground(bg) { Downloader.streamOf(c.url, name, c.title, problems) } } }
                        .firstNotNullOfOrNull { runCatching { it.get() }.getOrNull() }
                }
            } }
        }
        val started = System.currentTimeMillis()
        while (true) {
            for ((i, f) in jobs.withIndex()) {
                if (!f.isDone) continue
                val s = runCatching { f.get() }.getOrNull() ?: continue
                val seniorsDone = jobs.take(i).all { it.isDone }
                if (seniorsDone || System.currentTimeMillis() - started > 2500) return s
            }
            if (jobs.all { it.isDone }) break
            // Основные площадки отвечают дольше 25 с — не ждём их, идём к запасным.
            if (System.currentTimeMillis() - started > 25_000) break
            Thread.sleep(40)
        }
        // Нет на SoundCloud/YouTube (удалили) — другие площадки: Яндекс, Rutube, Internet Archive…
        // (их опрашиваем только теперь — не нагружаем сеть, когда песня и так нашлась).
        // Все разом, а не по очереди (раньше — до 40 с на каждую, итого минуты). Берём лучшую из ответивших за 20 с.
        val extras = runCatching { WebSearch.extraCandidates(t) }.getOrDefault(emptyList()).take(4).map { w ->
            searchPool.submit<StreamInfo?> {
                Ytdlp.withBackground(bg) {
                    if (w.direct) StreamInfo(w.url, w.url, w.source, w.cover, w.title)
                    else Downloader.streamOf(w.url, w.source, w.title, problems)
                }
            }
        }
        val extraDeadline = System.currentTimeMillis() + 10_000
        for (f in extras) {
            val left = extraDeadline - System.currentTimeMillis()
            val s = runCatching { f.get(maxOf(1, left), java.util.concurrent.TimeUnit.MILLISECONDS) }.getOrNull()
            if (s != null) return s
        }
        // Честно: где песня есть и почему не играет (чаще всего — платная на SoundCloud).
        val drm = problems.filter { it.contains("DRM") || it.contains("платн", ignoreCase = true) }.map { it.substringBefore(":") }.distinct()
        val missing = listOf("SoundCloud", "YouTube").filter { it !in foundOn }
        throw UserError(buildString {
            if (drm.isNotEmpty()) append("На ${drm.joinToString(" и ")} песня есть, но платная (DRM) — бесплатно её не включить.")
            else if (problems.isNotEmpty()) append("Нашёл, но не играет: ${problems.first()}.")
            else append("Не нашёл «${t.label}».")
            if (missing.isNotEmpty()) append(" На ${missing.joinToString(" и ")} её нет.")
            append(" Искал: SoundCloud, YouTube, YouTube Music, Яндекс, Rutube, Internet Archive, Dailymotion, Audius.")
            append(" Можно открыть в своём сервисе — кнопка «Сервисы».")
        })
    }
}
