package com.zagruzchik.app

import org.json.JSONObject

/**
 * Поиск песен по названию через открытые API (Deezer, Apple/iTunes) — без ключей, быстро.
 * Возвращает треки с обложкой и длительностью; дальше их можно сразу слушать или скачать.
 */
object MusicSearch {
    private const val SEARCH_TTL_MS = 10 * 60_000L
    private val searchCache = object : LinkedHashMap<String, Pair<Long, List<Track>>>(64, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, Pair<Long, List<Track>>>) = size > 50
    }

    fun search(query: String, limit: Int = 20): List<Track> {
        val q = query.trim()
        if (q.length < 2) return emptyList()
        val cacheKey = "${q.lowercase()}|$limit"
        val now = System.currentTimeMillis()
        synchronized(searchCache) {
            searchCache[cacheKey]?.let { (ts, list) -> if (now - ts < SEARCH_TTL_MS) return list }
        }
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
        val result = ranked.filter { seen.add(Match.base(it.title) + "|" + Match.norm(it.artist) + "|" + it.explicit) }.take(limit)
        if (result.isNotEmpty()) synchronized(searchCache) { searchCache[cacheKey] = System.currentTimeMillis() to result }
        return result
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
    /** Платные (DRM) записи SoundCloud на этот сеанс: одна и та же запись пробовалась 3 раза подряд по 2–5 с (журнал 24.11) — больше не тратим. */
    private val drmSeen = java.util.concurrent.ConcurrentHashMap.newKeySet<String>()
    private const val BLACKLIST_TTL_MS = 180_000L // 3 минуты: упавшая ссылка/источник пропускаются при авто-восстановлении
    private val blacklisted = java.util.concurrent.ConcurrentHashMap<String, Long>()

    fun blacklist(vararg urlsOrKeys: String?) {
        val until = System.currentTimeMillis() + BLACKLIST_TTL_MS
        for (raw in urlsOrKeys) {
            val k = raw?.trim()?.takeIf { it.isNotEmpty() } ?: continue
            blacklisted[k] = until
            if (k.startsWith("direct:")) blacklisted[k.removePrefix("direct:")] = until
        }
    }

    internal fun isBlacklisted(vararg urlsOrKeys: String?): Boolean {
        val now = System.currentTimeMillis()
        for (raw in urlsOrKeys) {
            val k = raw?.trim()?.takeIf { it.isNotEmpty() } ?: continue
            val until = blacklisted[k] ?: continue
            if (now < until) return true
            blacklisted.remove(k, until)
        }
        return false
    }
    private val pending = java.util.concurrent.ConcurrentHashMap<String, java.util.concurrent.Future<StreamInfo>>()
    // Подготовка заранее: 3 одновременно, свежие экраны — первыми (очередь «последним пришёл — первым готовим»).
    private val pool = java.util.concurrent.ThreadPoolExecutor(2, 2, 30, java.util.concurrent.TimeUnit.SECONDS,
        object : java.util.concurrent.LinkedBlockingDeque<Runnable>() {
            override fun offer(e: Runnable) = offerFirst(e) // LIFO
        })
    private val searchPool = java.util.concurrent.Executors.newCachedThreadPool()
    /** Подготовка, начатая списком (экраном): при новом экране ещё не начатые — отменяем. */
    private val batch = java.util.Collections.synchronizedList(mutableListOf<Pair<String, java.util.concurrent.Future<StreamInfo>>>())

    private fun key(t: Track) = Match.base(t.title) + "|" + Match.norm(t.artist)

    /** Начать готовить поток заранее. */
    fun prefetch(t: Track, full: Boolean = false): java.util.concurrent.Future<StreamInfo>? {
        if (t.title.isBlank() || t.title.equals(t.artist, true)) return null // мусор от переноса («Поиск в плейлисте — Поиск в плейлисте»)
        val k = key(t)
        if (cached(k) != null) return null
        pending[k]?.takeIf { !it.isCancelled }?.let { return it }
        val f = pool.submit<StreamInfo> {
            try {
                // Сначала быстрые источники без Python (Zaycev, YouTube Music) — секунда-две; не нашлось — полный поиск.
                // Фоновая подготовка — только быстрые источники (Zaycev, YouTube Music) и только пока ничего не ищется по нажатию:
                // иначе она отбирает сеть у песни, которую человек ждёт.
                waitForeground(quiet = false) // следующие песни очереди нужны скоро — ждём только идущий поиск
                // [full] — следующие песни очереди: ищем везде, включая SoundCloud (через телефон это дёшево). Раньше только быстрые
                // источники — песня, которая есть лишь на SoundCloud, не готовилась, и свайп «дальше» показывал загрузку.
                bgOne { Ytdlp.inBackground { find(t, light = !full) } }
                    .also { done[k] = System.currentTimeMillis() to it; HeadCache.storeAsync(t, it) }
            } finally { pending.remove(k) }
        }
        pending[k] = f
        return f
    }

    /**
     * Песни очереди, которые зазвучат следующими: готовим заранее (ближайшая — первой),
     * чтобы слушать подряд без ожидания. Экранная подготовка их не отменяет.
     */
    fun prefetchAhead(tracks: List<Track>) {
        tracks.asReversed().forEach { prefetch(it, full = true) } // очередь подготовки «последним пришёл — первым», поэтому с конца
    }

    /** Палец коснулся песни — начинаем искать сразу, без очереди: к отпусканию часть работы уже сделана. */
    fun touch(t: Track) {
        val k = key(t)
        if (cached(k) != null) return
        pending[k]?.let { f -> if (!f.cancel(false)) return; pending.remove(k, f) }
        pending[k] = searchPool.submit<StreamInfo> {
            fgStart()
            try { find(t).also { done[k] = System.currentTimeMillis() to it; HeadCache.storeAsync(t, it) } } finally { pending.remove(k); fgEnd() }
        }
    }

    /**
     * Готовим первые песни экрана (чарт, альбом, результаты поиска), чтобы по нажатию
     * полная версия включалась сразу с начала. Не начатое от прошлого экрана — отменяем.
     */
    fun prefetchMany(tracks: List<Track>, n: Int = 6) {
        synchronized(batch) {
            batch.forEach { (k, f) -> if (f.cancel(true)) pending.remove(k, f) }
            batch.clear()
        }
        // В обратном порядке: очередь LIFO, так первая песня экрана готовится первой.
        tracks.take(n).reversed().forEach { t -> prefetch(t)?.let { batch += key(t) to it } }
    }

    /** Готовый поток (ждёт, если он уже готовится). Вызывать не из главного потока.
     * [force] — человек нажал сам: недавняя неудача не в счёт, ищем заново (площадки флапают —
     * журнал 24.11: Zaycev дал 320 kbps через 5 секунд после таймаута, а антикэш не пускал). */
    fun resolve(t: Track, force: Boolean = false): StreamInfo {
        val k = key(t)
        cached(k)?.let { return it }
        // Отменяем устаревшие фоновые заготовки других песен, чтобы не забивали пул при быстром переключении.
        synchronized(batch) {
            val it = batch.iterator()
            while (it.hasNext()) {
                val (bk, bf) = it.next()
                if (bk != k) { if (bf.cancel(true)) pending.remove(bk, bf); it.remove() }
            }
        }
        // Недавно искали и не нашли (платная, удалена) — не ищем те же пару минут заново (авто-переходы в очереди).
        if (force) failed.remove(k)
        else failed[k]?.let { (time, e) -> if (System.currentTimeMillis() - time < FAIL_TTL_MS) throw e else failed.remove(k) }
        pending[k]?.let { f ->
            // Ещё в очереди подготовки — не ждём её, ищем сами сразу; уже ищется — ждём (так быстрее).
            if (f.cancel(false)) pending.remove(k, f)
            // Подготовка была лёгкой (без SoundCloud и YouTube): её неудача — не приговор, ищем полностью.
            else try { return f.get() } catch (_: java.util.concurrent.ExecutionException) {} catch (_: java.util.concurrent.CancellationException) {}
        }
        fgStart()
        return try { find(t).also { done[k] = System.currentTimeMillis() to it } }
        catch (e: UserError) { failed[k] = System.currentTimeMillis() to e; throw e }
        finally { fgEnd() }
    }

    /** Сколько поисков идёт по нажатию: пока они есть, фоновая подготовка ждёт. */
    private val foreground = java.util.concurrent.atomic.AtomicInteger()
    /**
     * Фоновая работа (подготовка, «Медиатека на телефоне») ждёт, пока идёт нажатое, и ещё 20 с после: журнал 17.11 — фон
     * забивал yt-dlp («площадка не ответила за 8 с» у всех), и нажатая песня и окно источников ничего не получали.
     */
    @Volatile private var quietUntil = 0L
    fun busy() { quietUntil = System.currentTimeMillis() + 20_000 }
    fun waitForeground(quiet: Boolean = true) { var n = 0; while ((foreground.get() > 0 || quiet && System.currentTimeMillis() < quietUntil) && n++ < 900) Thread.sleep(200) }
    /**
     * Фоновые поиски — строго по одному. Каждый поиск — это десяток соединений сразу (все площадки); после нескольких
     * переключений подряд в фоне шли 3–4 таких поиска одновременно, и через VPN связь падала у всех площадок разом
     * (журнал 20.11, 22:30:44: «failed to connect» у Zaycev, SoundCloud и YouTube одновременно). Нажатое ждать не должно — оно мимо очереди.
     */
    private val bgGate = java.util.concurrent.Semaphore(1, true)
    private fun <T> bgOne(block: () -> T): T { bgGate.acquire(); try { return block() } finally { bgGate.release() } }

    private fun fgStart() { foreground.incrementAndGet(); busy() }
    private fun fgEnd() { foreground.decrementAndGet(); busy() }

    // Площадка не отвечает с этого телефона (YouTube и SoundCloud так бывает из России без VPN) — после двух отказов подряд
    // не ждём её 3 минуты: каждая попытка стоила 6–15 секунд ожидания.
    // Предохранители пропускают площадку только для работы в фоне. Нажатую песню ищем везде: журнал 17.11 — «Кальций»
    // «не нашлась», потому что YouTube был пропущен после пары сбоев сети, хотя мог бы ответить.
    internal class Breaker { val fails = java.util.concurrent.atomic.AtomicInteger(); @Volatile var until = 0L
        val open get() = System.currentTimeMillis() < until
        fun ok() { fails.set(0) }
        fun fail() { if (fails.incrementAndGet() >= 2) { until = System.currentTimeMillis() + 3 * 60_000L; fails.set(0) } }
        fun trip(ms: Long = 5 * 60_000L) { until = System.currentTimeMillis() + ms; fails.set(0) } }
    private val ytBreaker = Breaker()
    private val ytmBreaker = Breaker()
    private val ytPhoneBreaker = Breaker()
    private val scPhoneBreaker = Breaker()
    private val yandexBreaker = Breaker()

    private const val FAIL_TTL_MS = 3 * 60 * 1000L // авто-переходы не долбят одну и ту же недоступную песню, но 3 минуты — не 20
    private val failed = java.util.concurrent.ConcurrentHashMap<String, Pair<Long, UserError>>()
    /**
     * Только Zaycev: быстро (доли секунды) и почти без трафика — этим путём начала песен готовятся на любой сети.
     * null — на Zaycev песни нет (ничего не запоминаем: позже её найдёт обычный поиск).
     */
    fun zaycevOnly(t: Track): StreamInfo? {
        val k = key(t)
        if (pinned(t) != null) return null // источник выбран человеком — Zaycev сам не подставляем
        cached(k)?.let { return it }
        waitForeground()
        val ok = Match.ranked(t, ZaycevSource.search(t.query)) { Triple(it.title, it.artist, it.durationSec) }
        // Заранее готовим только то, что точно без цензуры: помеченное так на Zaycev или песню, которая и в каталоге «чистая».
        val c = ok.take(3).filter { it.explicit || !t.explicit }.maxByOrNull { it.bitrate } ?: return null
        val u = ZaycevSource.streamUrl(c.id) ?: return null
        if (isBlacklisted(u, "zaycev:${c.id}:${c.bitrate}")) return null
        remember(k, "zaycev:${c.id}:${c.bitrate}")
        return StreamInfo(u, u, "Zaycev · MP3 ${c.bitrate}", t.cover ?: c.cover, c.title).also { done[k] = System.currentTimeMillis() to it }
    }

    /** Для «Медиатеки на телефоне»: полный поиск в фоне (уступает нажатому). null — нигде не нашлась или сеть не дала. */
    fun forSync(t: Track): StreamInfo? {
        val k = key(t)
        cached(k)?.let { return it }
        waitForeground()
        return runCatching { bgOne { Ytdlp.inBackground { find(t) } }.also { done[k] = System.currentTimeMillis() to it } }.getOrNull()
    }

    /** Найденная ссылка не заиграла — забываем её и запомненный источник: следующий раз ищем с нуля. */
    fun forget(t: Track) { val k = key(t); done.remove(k); remember(k, null) }

    /** Подключили новый источник (Telegram) — то, что раньше «не нашлось», стоит поискать снова. */
    fun forgetFailures() { failed.clear() }
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

    // Ссылки Zaycev живут меньше часа (привязаны к текущему часу) — держим их 10 минут.
    private fun cached(k: String) = done[k]?.let { (time, s) ->
        s.takeIf { System.currentTimeMillis() - time < (if (s.source.startsWith("Zaycev")) 10 * 60 * 1000L else TTL_MS) && !isBlacklisted(it.url, it.pageUrl) }
    }

    // ---- Своя ссылка для песни: если поиск не находит, человек указывает страницу сам — запоминаем навсегда. ----
    private val pins by lazy { App.instance.getSharedPreferences("pins", 0) }
    fun pinned(t: Track): String? = pins.getString(key(t), null)
    fun pin(t: Track, url: String?, option: Option? = null) {
        val k = key(t)
        pins.edit().apply { if (url.isNullOrBlank()) remove(k) else putString(k, url.trim()) }.apply()
        failed.remove(k); done.remove(k)
        option?.ready?.takeIf { option.where == url && System.currentTimeMillis() - option.created < 120_000 }?.let {
            detours.remove(k)
            done[k] = System.currentTimeMillis() to it
        }
    }

    /** Что ответила каждая площадка в последнем поиске этой песни — чтобы понять, почему не нашлась. */
    private val reports = java.util.concurrent.ConcurrentHashMap<String, String>()
    private val live = java.util.concurrent.ConcurrentHashMap<String, java.util.Queue<String>>()
    private val waitingOn = java.util.concurrent.ConcurrentHashMap<String, MutableSet<String>>()
    /** Что происходит прямо сейчас, пока песня ищется (для экрана плеера): последние ответы площадок. */
    fun progress(t: Track): String? {
        val k = key(t)
        val done = live[k]?.toList()?.takeLast(3)?.joinToString("\n") { it.lineSequence().first().replace(Regex("""\s*\[[^\]]*]"""), "").take(150) }.orEmpty()
        val wait = waitingOn[k]?.toList()?.takeIf { it.isNotEmpty() }?.let { "Ещё ищут: " + it.joinToString(", ") }.orEmpty()
        return listOf(done, wait).filter { it.isNotBlank() }.joinToString("\n").takeIf { it.isNotBlank() }
    }

    /** Причина сбоя — коротко, для отчёта и экрана плеера (раньше ошибки терялись, и было видно только «результатов 0»). */
    private fun why(e: Throwable?, where: String = ""): String = if (e == null) "" else
        " · ошибка${if (where.isEmpty()) "" else " ($where)"}: ${e.javaClass.simpleName} ${(e.cause?.message ?: e.message).orEmpty().take(90)}"
    /** Когда YouTube последний раз потребовал «вы не робот» (0 — не требовал). */
    @Volatile var youtubeBlockedAt = 0L
    fun report(t: Track): String? = reports[key(t)]

    // ---- Где лежит песня: запоминаем после первого поиска. Дальше поиск не нужен — сразу берём звук (секунда вместо нескольких). ----
    private val sourcesPrefs by lazy {
        App.instance.getSharedPreferences("sources", 0).also { p ->
            // 8.5: раньше Zaycev запоминался без оглядки на цензуру — один раз забываем такие записи, пусть найдутся заново по новым правилам.
            if (!p.getBoolean("#uncensored_v1", false)) {
                val e = p.edit()
                p.all.forEach { (k, v) -> if ((v as? String)?.startsWith("zaycev:") == true) e.remove(k) }
                e.putBoolean("#uncensored_v1", true).apply()
                runCatching { HeadCache.dropWhere { it.startsWith("zaycev:") } }
            }
        }
    }
    private fun knownRaw(k: String): String? = runCatching { sourcesPrefs.getString(k, null) }.getOrNull()
    /** Источник этой песни уже известен (включится быстро, без поиска). */
    fun known(t: Track): Boolean = pinned(t) != null || knownRaw(key(t))?.startsWith("none:") == false
    private fun remember(k: String, where: String?) {
        sourcesPrefs.edit().apply { if (where == null) remove(k) else putString(k, where) }.apply()
    }

    private fun isYoutube(url: String) = Service.of(url).let { it == Service.YOUTUBE || it == Service.YOUTUBE_MUSIC }

    /** Где лежит песня (своя ссылка или запомненный источник). null — неизвестно. */
    fun whereOf(t: Track): String? = pinned(t) ?: knownRaw(key(t))?.takeIf { !it.startsWith("none:") }

    /** Звук из известного источника; [wantTotal] — нужна запись именно такого размера (продолжение уже сохранённого начала). */
    fun streamFrom(t: Track, where: String, wantTotal: Long? = null): StreamInfo? = runCatching { fromKnown(t, where, wantTotal) }.getOrNull()

    private fun fromKnown(t: Track, where: String, wantTotal: Long? = null): StreamInfo? {
        if (isBlacklisted(where)) return null
        if (where.startsWith("direct:https://")) {
            val url = where.removePrefix("direct:")
            if (isBlacklisted(url)) return null
            return StreamInfo(url, url, Describe.site(url), t.cover, t.title)
        }
        if (where.startsWith("zaycev:")) {
            val p = where.split(':')
            val id = p.getOrNull(1)?.toLongOrNull() ?: return null
            val u = runCatching { ZaycevSource.streamUrl(id) }.getOrNull() ?: return null
            return StreamInfo(u, u, "Zaycev · MP3 ${p.getOrNull(2) ?: ""}".trim(), t.cover, t.title)
        }
        if (where.startsWith("tg:")) {
            // Файл Telegram: играет, только пока аккаунт подключён.
            if (!Telegram.ready) throw UserError("Telegram не подключён")
            val id = where.removePrefix("tg:").substringBefore('|')
            val u = Telegram.streamUrl(id)
            return StreamInfo(u, u, where.substringAfter('|', "Telegram"), t.cover, t.title)
        }
        if (where.startsWith("vk:")) {
            // Ссылка ВК недолговечна — каждый раз берём свежую (как сайт при нажатии «играть»).
            if (!VkSource.available) throw UserError("ВК не подключён")
            return VkSource.streamOf(t, where) ?: throw UserError("ВК не отдал ссылку")
        }
        if (!isYoutube(where) && Service.of(where) != Service.SOUNDCLOUD) App.awaitReady() // YouTube и SoundCloud — средствами телефона, движок не ждём
        return Downloader.streamOf(where, Describe.site(where), t.title, wantTotal = wantTotal)
    }

    /**
     * Подготовка медиатеки: узнать (и запомнить) источник песни и вернуть ссылку на звук — по ней сохраняется начало.
     * null — не нашлась (повторяем не чаще раза в неделю) или не получилось.
     */
    fun warm(t: Track): StreamInfo? {
        val k = key(t)
        cached(k)?.let { return it }
        knownRaw(k)?.let { w ->
            if (w.startsWith("none:") && System.currentTimeMillis() / 86_400_000L - (w.substringAfter(':').toLongOrNull() ?: 0) < 7) return null
        }
        // Только быстрые источники без Python (Zaycev, YouTube Music): так медиатека готовится в несколько потоков.
        waitForeground()
        return try { find(t, light = true).also { done[k] = System.currentTimeMillis() to it } }
        catch (_: UserError) { remember(k, "none:" + System.currentTimeMillis() / 86_400_000L); null }
        catch (_: Exception) { null }
    }

    // Выбранный источник сейчас не ответил, и песня взята из другого места: такое не сохраняем на телефон,
    // иначе «не та» запись осталась бы в памяти и играла бы вместо выбранной.
    private val detours = java.util.concurrent.ConcurrentHashMap.newKeySet<String>()
    fun detoured(t: Track): Boolean = key(t) in detours

    private fun find(t: Track, light: Boolean = false): StreamInfo {
        // Пока искали, человек мог выбрать другой источник — тогда найденное уже не годится, берём заново.
        repeat(2) {
            val pin = pinned(t)
            val s = findOnce(t, light, pin)
            if (pinned(t) == pin) return s
        }
        return findOnce(t, light, pinned(t))
    }

    private fun findOnce(t: Track, light: Boolean, pin: String?): StreamInfo {
        val k = key(t)
        // Источник, выбранный человеком для этой песни (или своя ссылка), — всегда первым.
        if (pin != null) {
            var err: Throwable? = null
            runCatching { fromKnown(t, pin) }.onFailure { err = it }.getOrNull()?.let { detours.remove(k); return it }
            detours += k
            AppLog.add("ВЫБРАННЫЙ ИСТОЧНИК не ответил для «${t.label}» (${nameOf(pin)})${why(err)} — играю из другого места, выбор остаётся")
        } else detours.remove(k)
        val known = knownRaw(k)?.takeUnless { it.startsWith("none:") || it == pin }
        val bg = Ytdlp.isBackground
        val remembered = known?.let { where ->
            searchPool.submit<StreamInfo?> { Ytdlp.withBackground(bg) { fromKnown(t, where) } }
        }
        if (remembered != null) {
            // Дать быстрой сохранённой ссылке фору, затем искать параллельно.
            runCatching { remembered.get(300, java.util.concurrent.TimeUnit.MILLISECONDS) }.getOrNull()?.let { return it }
        }
        val log = java.util.concurrent.ConcurrentLinkedQueue<String>()
        live[k] = log
        val picked = java.util.concurrent.ConcurrentHashMap<String, String>()
        try {
            return search(t, log, picked, light, remembered = remembered).also { s ->
                val where = picked[s.source.substringBefore(" ·")] ?: s.pageUrl.takeIf { it != s.url && it.startsWith("http") }
                if (where != null) remember(k, where)
            }
        } finally {
            live.remove(k); waitingOn.remove(k)
            AppLog.add("ПОИСК «${t.label}» (${t.durationSec} с)\n" + log.sorted().joinToString("\n"))
            reports[key(t)] = "Искал: «${t.query}»" + (if (t.durationSec > 0) " (${t.durationSec} с)" else "") + "\n\n" + log.sorted().joinToString("\n\n")
        }
    }

    /** Один найденный вариант песни: площадка, название записи и «где лежит» (для запоминания выбора). */
    class Option(val label: String, val title: String, val where: String, val ready: StreamInfo? = null) { val created = System.currentTimeMillis() }

    /**
     * Живой список источников песни: пополняется по мере ответа площадок. Первым в нём сразу стоит источник,
     * откуда песня играет сейчас. [done] — опрос закончен.
     */
    class Live(val urgent: Boolean = false) {
        val list = java.util.concurrent.CopyOnWriteArrayList<Option>()
        @Volatile var done = false
        val since = System.currentTimeMillis()
        val listeners = java.util.concurrent.CopyOnWriteArraySet<() -> Unit>()
        internal fun add(o: Option) {
            val i = list.indexOfFirst { it.where == o.where }
            if (i < 0) list += o else if (list[i].ready == null && o.ready != null) list[i] = o else return
            listeners.forEach { it() }
        }
        internal fun finish() { done = true; listeners.forEach { it() } }
    }

    private val lives = java.util.concurrent.ConcurrentHashMap<String, Live>()
    private val optionPool = java.util.concurrent.Executors.newFixedThreadPool(2)

    /**
     * Источники этой песни. Опрос запускается один раз (в фоне, не мешая музыке) и живёт полчаса; повторный вызов
     * возвращает тот же список — уже с тем, что успело найтись. [urgent] — человек открыл окно: опрос идёт вне очереди.
     */
    fun live(t: Track, urgent: Boolean = false, fresh: Boolean = false): Live {
        val k = key(t)
        // Готовый список берём, только если в нём что-то есть: пустой мог получиться, когда фоновый опрос уступил сеть
        // самой песне (журнал 17.11: песня находилась, а окно писало «нигде не нашлась»).
        // Окно открыто человеком — это главный приоритет: фоновый опрос (низкий приоритет, YouTube мог быть пропущен после
        // сбоев) не подхватываем, а ищем заново сразу и вне очереди. Готовый непустой список — показываем сразу.
        lives[k]?.takeIf { !fresh && System.currentTimeMillis() - it.since < 30 * 60_000L &&
            (if (it.done) it.list.isNotEmpty() else (it.urgent || !urgent)) }?.let { return it }
        val live = Live(urgent)
        lives[k] = live
        // То, откуда песня играет сейчас, известно сразу.
        whereOf(t)?.let { w -> live.add(Option(nameOf(w), t.title, w)) }
        // Окно, открытое человеком, — в своём потоке и сразу: раньше оно стояло в очереди за фоновыми опросами (они ждут,
        // пока человек что-то включает, — до 3 минут) и за запуском yt-dlp, хотя большинство площадок без него.
        val exec: (Runnable) -> Unit = if (urgent) { r -> Thread(r, "sources-now").start() } else optionPool::execute
        exec(Runnable {
            try {
                if (!urgent) App.awaitReadyOrNull()
                val log = java.util.concurrent.ConcurrentLinkedQueue<String>()
                val run = {
                    runCatching { search(t, log, java.util.concurrent.ConcurrentHashMap(), collect = live::add) }
                    // В журнал — как и обычный поиск: раньше окно источников искало «молча», и по журналу было не понять, почему пусто.
                    AppLog.add("ИСТОЧНИКИ «${t.label}»${if (urgent) " (окно открыто)" else ""}: найдено ${live.list.size}" +
                        live.list.joinToString("") { "\n  ✓ ${it.label} · ${it.title.take(50)}" } + "\n" + log.sorted().joinToString("\n"))
                }
                if (urgent) { fgStart(); try { run() } finally { fgEnd() } }
                else { waitForeground(); bgOne { Ytdlp.inBackground { run() } } }
            } finally {
                if (live.list.isEmpty()) lives.remove(k, live) // пусто — в следующий раз опросить заново
                live.finish()
            }
        })
        return live
    }

    /** Название площадки по «где лежит». */
    private fun nameOf(where: String) = when {
        where.startsWith("zaycev:") -> "Zaycev · MP3 ${where.split(':').getOrNull(2).orEmpty()}".trim()
        where.startsWith("tg:") -> where.substringAfter('|', "Telegram")
        where.startsWith("vk:") -> "VK Музыка · MP3"
        else -> Describe.site(where.removePrefix("direct:"))
    }

    /** Какой источник сейчас закреплён за песней (выбран человеком). null — выбирается автоматически. */
    fun chosen(t: Track): String? = pinned(t)

    private fun search(t: Track, log: java.util.Queue<String>, picked: MutableMap<String, String>, light: Boolean = false,
                       collect: ((Option) -> Unit)? = null, remembered: java.util.concurrent.Future<StreamInfo?>? = null): StreamInfo {
        val sources = listOf(
            "SoundCloud" to "scsearch8:${t.query}",
            "YouTube" to "ytsearch8:${t.query}",
            // Перезаливы часто названы иначе («Не вспоминать МАЯК Х») — ищем и по одному названию;
            // чужие песни с таким же названием отсеивает проверка исполнителя.
            "SoundCloud" to "scsearch10:${Match.base(t.title).ifEmpty { t.title }}",
        )
        // Основные площадки ищут и проверяют поток параллельно.
        // SoundCloud получает небольшую фору, затем берём доступный источник.
        val bg = Ytdlp.isBackground // подготовка заранее не мешает нажатому
        val problems = java.util.concurrent.ConcurrentLinkedQueue<String>()
        val foundOn = java.util.concurrent.ConcurrentLinkedQueue<String>()
        val waiting = java.util.concurrent.ConcurrentHashMap.newKeySet<String>().also { waitingOn[key(t)] = it }
        // Zaycev — MP3 до 320 kbps, отвечает быстро: первым по старшинству.
        val yandexName = Service.YANDEX.title
        fun startYandex() = if (light) null else run {
            if (bg && yandexBreaker.open) { log += "$yandexName: пропущен — не отвечает без сессии (проверю снова через пару минут)"; return@run null }
            waiting += yandexName
            searchPool.submit<StreamInfo?> {
                try {
                    Ytdlp.withBackground(bg) {
                        val exact = t.url?.takeIf { Service.of(it) == Service.YANDEX && "/album/" in it && "/track/" in it }
                        val pages = exact?.let { listOf(it) } ?: WebSearch.rankCandidates(t, WebSearch.yandex(t.query))
                            .map { it.url }.filter { "/album/" in it }.distinct().take(2)
                        log += "$yandexName: подходящих страниц ${pages.size}"
                        if (pages.isNotEmpty()) App.awaitReady()
                        val res = pages.filter { !isBlacklisted(it) }.firstNotNullOfOrNull { page ->
                            Downloader.streamOf(page, yandexName, t.title, problems)?.takeUnless { isBlacklisted(it.url, it.pageUrl) }?.also { picked[yandexName] = page }
                        }
                        if (res != null) yandexBreaker.ok()
                        else if (problems.any { it.contains("yandexmusic", ignoreCase = true) || it.contains("NoneType", ignoreCase = true) }) yandexBreaker.trip(5 * 60_000L)
                        res
                    }
                } catch (e: Exception) {
                    if (e.message?.let { it.contains("yandexmusic", ignoreCase = true) || it.contains("NoneType", ignoreCase = true) } == true) yandexBreaker.trip(5 * 60_000L)
                    log += yandexName + why(e)
                    null
                } finally {
                    waiting -= yandexName
                }
            }
        }
        val zaycev = searchPool.submit<StreamInfo?> {
            val t0 = System.currentTimeMillis()
            val got = runCatching { ZaycevSource.search(t.query) }
            val raw = got.getOrDefault(emptyList())
            val ok = Match.ranked(t, raw) { Triple(it.title, it.artist, it.durationSec) }
            log += "Zaycev [${t.query.take(40)}]: результатов ${raw.size}, подошло ${ok.size}" + why(got.exceptionOrNull()) +
                // Не нашёл — Zaycev отдаёт свои популярные песни; их в журнал не пишем, чтобы он оставался коротким.
                if (ok.isEmpty() && raw.all { Match.reason(t, it.title, it.artist, it.durationSec) == "другое название" }) (if (raw.isEmpty()) "" else " · ничего похожего") else
                raw.take(5).joinToString("") { c -> "\n  ${if (c in ok) "✓" else "✗ " + Match.reason(t, c.title, c.artist, c.durationSec)} · ${c.title.take(50)} | ${c.artist.take(26)} | ${c.durationSec} с | ${c.bitrate} kbps" }
            if (ok.isNotEmpty()) foundOn += "Zaycev"
            // Из подходящих — лучший по качеству среди первых трёх.
            // Из подходящих — сначала помеченные «без цензуры», затем лучший битрейт (среди первых трёх).
            ok.take(3).sortedWith(compareByDescending<ZaycevSource.Found> { it.explicit }.thenByDescending { it.bitrate }).firstNotNullOfOrNull { c ->
                runCatching { ZaycevSource.streamUrl(c.id) }.getOrNull()?.let { u ->
                    if (isBlacklisted(u, "zaycev:${c.id}:${c.bitrate}")) return@let null
                    picked["Zaycev"] = "zaycev:${c.id}:${c.bitrate}"
                    StreamInfo(u, u, "Zaycev · MP3 ${c.bitrate}", t.cover ?: c.cover, c.title)
                }
            }.also { log += "Zaycev звук: ${if (it != null) "готов" else "нет"} за ${(System.currentTimeMillis() - t0) / 100 / 10.0} с" }
        }
        val hitmotop = searchPool.submit<StreamInfo?> {
            val t0 = System.currentTimeMillis()
            val got = runCatching { HitmotopSource.search(t.query) }
            val raw = got.getOrDefault(emptyList())
            val ok = Match.ranked(t, raw) { Triple(it.title, it.artist, it.durationSec) }
            log += "Hitmotop [${t.query.take(40)}]: результатов ${raw.size}, подошло ${ok.size}" + why(got.exceptionOrNull())
            if (ok.isNotEmpty()) foundOn += "Hitmotop"
            ok.take(2).firstOrNull { !isBlacklisted(it.url) && Http.canReadAudio(it.url, "https://rus.hitmotop.com/") }?.let { c ->
                picked["Hitmotop"] = "direct:${c.url}"
                StreamInfo(c.url, c.url, "Hitmotop · MP3", t.cover ?: c.cover, c.title)
            }.also { log += "Hitmotop звук: ${if (it != null) "готов" else "нет"} за ${(System.currentTimeMillis() - t0) / 100 / 10.0} с" }
        }
        val hearthis = searchPool.submit<StreamInfo?> {
            val t0 = System.currentTimeMillis()
            val got = runCatching { HearthisSource.search(t.query) }
            val raw = got.getOrDefault(emptyList()).filter { it.durationSec <= 900 }
            val ok = Match.ranked(t, raw) { Triple(it.title, it.artist, it.durationSec) }
            log += "Hearthis [${t.query.take(40)}]: результатов ${raw.size}, подошло ${ok.size}" + why(got.exceptionOrNull())
            if (ok.isNotEmpty()) foundOn += "Hearthis"
            ok.firstOrNull { !isBlacklisted(it.url) }?.let { c ->
                picked["Hearthis"] = "direct:${c.url}"
                StreamInfo(c.url, c.url, "Hearthis · MP3", t.cover ?: c.cover, c.title)
            }.also { log += "Hearthis звук: ${if (it != null) "готов" else "нет"} за ${(System.currentTimeMillis() - t0) / 100 / 10.0} с" }
        }
        // Telegram (свой аккаунт): встроенный поиск музыки, файлы обычно 320 kbps, бывает FLAC. Только по нажатию —
        // в фоновой подготовке не используем: Telegram ограничивает частые запросы.
        val telegram = searchPool.submit<StreamInfo?> {
            if (bg || !Telegram.available) return@submit null
            val t0 = System.currentTimeMillis()
            val raw = try { Telegram.search(t.query) } catch (e: Exception) { log += "Telegram: ${(e as? UserError)?.message ?: e.message}"; return@submit null }
            val ok = Match.ranked(t, raw) { Triple(it.title, it.artist, it.durationSec) }
            log += "Telegram [${t.query.take(40)}]: результатов ${raw.size}, подошло ${ok.size}" +
                raw.take(5).joinToString("") { c -> "\n  ${if (c in ok) "✓" else "✗"} ${c.title.take(60)} | ${c.artist.take(30)} | ${c.durationSec} с | ${c.format} ${c.kbps}" } +
                "\n  за ${(System.currentTimeMillis() - t0) / 100 / 10.0} с"
            // Из подходящих — без потерь, затем лучший битрейт (среди первых трёх).
            val best = ok.take(3).sortedWith(compareByDescending<Telegram.Found> { it.format == "FLAC" }.thenByDescending { it.kbps })
                .firstOrNull { !isBlacklisted("tg:${it.remoteId}|${it.label}") } ?: return@submit null
            foundOn += "Telegram"
            picked["Telegram"] = "tg:${best.remoteId}|${best.label}"
            val u = Telegram.streamUrl(best.remoteId)
            if (isBlacklisted(u)) return@submit null
            StreamInfo(u, u, best.label, t.cover, best.title)
        }
        // ВКонтакте (свой аккаунт, веб-сессия как у сайта): почти вся русская музыка. Только по нажатию —
        // в фоновой подготовке не используем: ВК ограничивает частые запросы.
        val vk = searchPool.submit<StreamInfo?> {
            if (bg || !VkSource.available) return@submit null
            val t0 = System.currentTimeMillis()
            val raw = try { VkSource.search(t.query) } catch (e: Exception) { log += "ВК: ${(e as? UserError)?.message ?: e.message}"; return@submit null }
            val ok = Match.ranked(t, raw) { Triple(it.title, it.artist, it.durationSec) }
            log += "ВК [${t.query.take(40)}]: результатов ${raw.size}, подошло ${ok.size}" +
                raw.take(5).joinToString("") { c -> "\n  ${if (c in ok) "✓" else "✗"} ${c.title.take(60)} | ${c.artist.take(30)} | ${c.durationSec} с" } +
                "\n  за ${(System.currentTimeMillis() - t0) / 100 / 10.0} с"
            if (ok.isEmpty()) return@submit null
            // Ссылки ВК недолговечны: для лучших вариантов берём свежие одним запросом, первый играющий — в дело.
            val best = runCatching { VkSource.streamOf(t, ok.take(5)) }.getOrNull() ?: return@submit null
            if (isBlacklisted(best.second.url, best.second.pageUrl)) return@submit null
            foundOn += "ВК"
            picked["VK"] = best.first
            best.second
        }
        // YouTube Music, вкладка «Песни»: с исполнителем и длительностью — находит и официальные авто-треки («Исполнитель – Topic»),
        // которых нет в обычном поиске YouTube. Ищем на самом телефоне, без Python; не вышло — через открытые зеркала.
        val ytm = searchPool.submit<StreamInfo?> {
            if (bg && ytmBreaker.open) { log += "YouTube Music: пропущен — YouTube не отвечает с этого телефона (проверю снова через пару минут)"; return@submit null }
            val t0 = System.currentTimeMillis()
            var via = ""
            val raw = runCatching { NewPipeSource.searchSongs(t.query) { via = it } }.getOrDefault(emptyList())
            if (raw.isEmpty() && via.contains("не ответил")) ytmBreaker.fail() else if (raw.isNotEmpty()) ytmBreaker.ok()
            val ok = Match.ranked(t, raw) { Triple(it.title, it.artist, it.durationSec) }
            log += "YouTube Music [${t.query.take(40)}]: результатов ${raw.size}, подошло ${ok.size} · $via" +
                raw.take(5).joinToString("") { c -> "\n  ${if (c in ok) "✓" else "✗ " + Match.reason(t, c.title, c.artist, c.durationSec)} · ${c.title.take(50)} | ${c.artist.take(26)} | ${c.durationSec} с" } +
                "\n  поиск за ${(System.currentTimeMillis() - t0) / 100 / 10.0} с"
            if (ok.isNotEmpty()) foundOn += "YouTube Music"
            ok.take(3).filter { !isBlacklisted(it.url) }.firstNotNullOfOrNull { c ->
                val t1 = System.currentTimeMillis()
                val errs = java.util.concurrent.ConcurrentLinkedQueue<String>()
                Ytdlp.withBackground(bg) { Downloader.streamOf(c.url, "YouTube Music", c.title, errs) }
                    ?.takeUnless { isBlacklisted(it.url, it.pageUrl) }
                    .also { problems += errs; log += "YouTube Music звук «${c.title.take(40)}»: ${if (it != null) "готов" else "не играет — " + errs.joinToString("; ").ifBlank { "без объяснения" }.take(200)} за ${(System.currentTimeMillis() - t1) / 100 / 10.0} с" }
            }
        }
        // Каждая площадка ищется двумя путями сразу — средствами телефона и через yt-dlp. Это отдельные участники гонки:
        // раньше второй путь ждал, пока сдастся первый, и медленный отказ одного задерживал всё.
        fun lines(raw: List<Downloader.Candidate>, ok: List<Downloader.Candidate>) =
            if (ok.isEmpty() && raw.isNotEmpty() && raw.all { Match.reason(t, it.title, it.author, it.duration) == "другое название" }) " · ничего похожего" else
            raw.take(5).joinToString("") { c ->
            "\n  ${if (c in ok) "✓" else "✗ " + Match.reason(t, c.title, c.author, c.duration)} · ${c.title.take(50)} | ${c.author.take(26)} | ${c.duration} с"
        }
        fun sounds(name: String, candidates: List<Downloader.Candidate>): StreamInfo? {
            // Ссылки берём по две одновременно (лучший вариант может оказаться платным — DRM), до 4 вариантов.
            val fresh = candidates.filter { it.url !in drmSeen && !isBlacklisted(it.url) }
            if (fresh.size < candidates.size) log += "$name: платных (DRM) знаем заранее — ${candidates.size - fresh.size} пропущено, не тратя время"
            return fresh.take(4).chunked(2).firstNotNullOfOrNull { pair ->
                val tasks = pair.map { c -> searchPool.submit<StreamInfo?> { Ytdlp.withBackground(bg) {
                    val t0 = System.currentTimeMillis()
                    if (Service.of(c.url).let { it != Service.YOUTUBE && it != Service.YOUTUBE_MUSIC && it != Service.SOUNDCLOUD }) App.awaitReady() // YouTube и SoundCloud берёт и телефон — движок не ждём
                    val errs = java.util.concurrent.ConcurrentLinkedQueue<String>()
                    Downloader.streamOf(c.url, name.substringBefore(" ("), c.title, errs)?.takeUnless { isBlacklisted(it.url, it.pageUrl) }.also {
                        problems += errs
                        // Платная запись повторной попыткой не оживает — запоминаем на сеанс.
                        if (it == null && errs.any { e -> e.contains("DRM") || e.contains("платн", ignoreCase = true) }) drmSeen += c.url
                        log += "$name звук «${c.title.take(40)}»: ${if (it != null) "готов" else "не играет — " + (errs.joinToString("; ").ifBlank { "без объяснения" }).take(400)} за ${(System.currentTimeMillis() - t0) / 100 / 10.0} с"
                    }
                } } }
                try {
                    tasks.firstNotNullOfOrNull { runCatching { it.get() }.getOrNull() }
                } finally {
                    tasks.forEach { if (!it.isDone) it.cancel(true) }
                }
            }
        }
        val onPhone = (if (light) emptyList() else sources.take(2)).map { (site, query) ->
            val name = "$site (на телефоне)"
            waiting += name
            searchPool.submit<StreamInfo?> { try {
                val breaker = if (site == "SoundCloud") scPhoneBreaker else ytPhoneBreaker
                if (bg && breaker.open) { log += "$name: пропущен — не отвечает с этого телефона"; return@submit null }
                val got = runCatching { NewPipeSource.search(site == "SoundCloud", query.substringAfter(':')) }
                if (got.isFailure) breaker.fail() else breaker.ok()
                val raw = got.getOrNull().orEmpty().take(10).map {
                    Downloader.Candidate(it.url, it.title, listOf(it.artist, it.title.substringBefore(" - ", "")).filter { x -> x.isNotBlank() }.joinToString(" | "), it.durationSec, site, 0)
                }
                val ok = Match.ranked(t, raw) { Triple(it.title, it.author, it.duration) }
                log += "$name: результатов ${raw.size}, подошло ${ok.size}" + why(got.exceptionOrNull()) + lines(raw, ok)
                if (ok.isNotEmpty()) foundOn += site
                sounds(name, ok)
            } finally { waiting -= name } }
        }
        fun startViaYtdlp() = (if (light) emptyList() else sources).map { (site, query) ->
            val name = if (query.startsWith("scsearch10")) "$site по названию" else "$site (yt-dlp)"
            waiting += name
            searchPool.submit<StreamInfo?> { try { Ytdlp.withBackground(bg) {
                if (bg && site == "YouTube" && ytBreaker.open) { log += "$name: пропущен — YouTube не отвечает с этого телефона"; return@withBackground null }
                App.awaitReady()
                val got = runCatching { Downloader.searchOrThrow(query, site) }
                if (site == "YouTube") { if (got.isFailure) ytBreaker.fail() else ytBreaker.ok() }
                val raw = got.getOrNull().orEmpty()
                val ok = Match.ranked(t, raw) { Triple(it.title, it.author, it.duration) }
                log += "$name: результатов ${raw.size}, подошло ${ok.size}" + why(got.exceptionOrNull()) + lines(raw, ok)
                if (ok.isNotEmpty()) foundOn += site
                sounds(name, ok)
            } } finally { waiting -= name } }
        }
        fun startSpare() = if (light) emptyList() else WebSearch.playbackSources.map { lookup ->
            searchPool.submit<StreamInfo?> { Ytdlp.withBackground(bg) {
                val matches = WebSearch.rankCandidates(t, lookup(t.query))
                matches.filter { !isBlacklisted(it.url) }.take(2).firstNotNullOfOrNull { w ->
                    if (w.direct) StreamInfo(w.url, w.url, w.source, w.cover, w.title)
                    else { App.awaitReady(); Downloader.streamOf(w.url, w.source, w.title, problems)?.takeUnless { isBlacklisted(it.url, it.pageUrl) } }
                }
            } }
        }
        val started = System.currentTimeMillis()
        if (collect != null) {
            val yandex = startYandex()
            val viaYtdlp = startViaYtdlp()
            val spare = startSpare()
            val soundcloud = listOfNotNull(viaYtdlp.getOrNull(0), onPhone.getOrNull(0), viaYtdlp.getOrNull(2))
            val jobs = listOfNotNull(remembered, zaycev, hitmotop, hearthis, yandex) + soundcloud + listOf(telegram, vk, ytm) + listOfNotNull(onPhone.getOrNull(1), viaYtdlp.getOrNull(1)) + spare
            // Режим «показать все источники»: отдаём каждый найденный вариант сразу, как только площадка ответила.
            val told = HashSet<Any>()
            while (true) {
                for (f in jobs) {
                    if (!f.isDone || !told.add(f)) continue
                    val s = runCatching { f.get() }.getOrNull() ?: continue
                    val where = picked[s.source.substringBefore(" ·")] ?: s.pageUrl.takeIf { it != s.url && it.startsWith("http") } ?: s.url.takeIf { f in spare && it.startsWith("https://") }?.let { "direct:$it" } ?: continue
                    collect(Option(s.source, s.title, where, s))
                }
                if (jobs.all { it.isDone } || System.currentTimeMillis() - started > 25_000) break
                Thread.sleep(50)
            }
            jobs.forEach { if (!it.isDone) it.cancel(true) }
            throw UserError("источники собраны")
        }
        val preferSoundCloud = Settings.sourceOrder(App.instance) == Settings.SourceOrder.SOUNDCLOUD
        val fastPriority = listOfNotNull(remembered, onPhone.getOrNull(0))
        val fallback = listOfNotNull(hitmotop, onPhone.getOrNull(1), ytm, zaycev, hearthis, telegram, vk)
        val graceMs = if (preferSoundCloud) 1600L else 800L
        awaitStream(
            started = started,
            graceMs = graceMs,
            fastPriority = fastPriority,
            fallback = fallback,
            startSlow = if (light) null else ({
                val yandex = startYandex()
                val viaYtdlp = startViaYtdlp()
                val spare = startSpare()
                val soundcloud = listOfNotNull(viaYtdlp.getOrNull(0), onPhone.getOrNull(0), viaYtdlp.getOrNull(2))
                listOfNotNull(remembered) + soundcloud + listOfNotNull(viaYtdlp.getOrNull(1), yandex) + spare
            }),
            onTimeout = { log += "Ждал площадки 25 с — не дождался" },
        )?.let { return it }
        if (light) throw UserError("В быстрых источниках не нашлась")
        if (problems.isNotEmpty()) log += "Ошибки:\n  " + problems.distinct().joinToString("\n  ") { it.take(160) }
        // Честно: где песня есть и почему не играет (чаще всего — платная на SoundCloud).
        val drm = problems.filter { it.contains("DRM") || it.contains("платн", ignoreCase = true) }.map { it.substringBefore(":") }.distinct()
        val missing = listOf("SoundCloud", "YouTube").filter { it !in foundOn }
        throw UserError(buildString {
            if (problems.any { it.contains(Downloader.YT_BLOCKED) }) append("Песня есть на YouTube, но ${Downloader.YT_BLOCKED}. " +
                "Помогает одно из двух: войти в YouTube (Настройки → Вход на сайты → YouTube) или исключить SoundAura из VPN.")
            else if (drm.isNotEmpty()) append("На ${drm.joinToString(" и ")} песня есть, но платная (DRM) — бесплатно её не включить.")
            else if (problems.isNotEmpty()) append("Нашёл, но не играет: ${problems.first()}.")
            else append("Не нашёл «${t.label}».")
            if (missing.isNotEmpty()) append(" На ${missing.joinToString(" и ")} её нет.")
            append(" Искал: Zaycev, Hitmotop, Hearthis," + (if (Telegram.ready) " Telegram," else "") + (if (VkSource.loggedIn) " ВК," else "") + " SoundCloud, YouTube, YouTube Music, Яндекс, Bandcamp, Rutube, Internet Archive, Dailymotion, Audius.")
            append(" Нажмите на это сообщение — можно указать ссылку на песню вручную.")
        })
    }

    internal fun awaitStream(
        started: Long,
        graceMs: Long,
        totalMs: Long = 25_000L,
        fastPriority: List<java.util.concurrent.Future<StreamInfo?>>,
        fallback: List<java.util.concurrent.Future<StreamInfo?>>,
        startSlow: (() -> List<java.util.concurrent.Future<StreamInfo?>>)? = null,
        onTimeout: () -> Unit = {},
    ): StreamInfo? {
        var slowStarted = startSlow == null
        var priority = fastPriority
        var fallbackStream: StreamInfo? = null
        while (true) {
            val elapsed = System.currentTimeMillis() - started
            if (!slowStarted && (elapsed >= 1200 || priority.all { it.isDone })) {
                slowStarted = true
                priority = startSlow!!.invoke()
            }
            for (f in priority) {
                if (!f.isDone) continue
                val stream = runCatching { f.get() }.getOrNull() ?: continue
                (priority + fallback).forEach { if (!it.isDone) it.cancel(true) }
                return stream
            }
            if (fallback.isNotEmpty()) {
                for (f in fallback) {
                    if (!f.isDone) continue
                    val stream = runCatching { f.get() }.getOrNull()
                    if (stream != null) { fallbackStream = stream; break }
                }
            }
            if (fallbackStream != null && ((slowStarted && priority.all { it.isDone }) || elapsed >= graceMs)) {
                (priority + fallback).forEach { if (!it.isDone) it.cancel(true) }
                return fallbackStream
            }
            if (slowStarted && priority.all { it.isDone } && fallback.all { it.isDone }) break
            if (elapsed > totalMs) {
                onTimeout()
                break
            }
            Thread.sleep(40)
        }
        (priority + fallback).forEach { if (!it.isDone) it.cancel(true) }
        return fallbackStream
    }
}

/**
 * Подготовка медиатеки заранее: в фоне, по одной песне, узнаём и запоминаем, где лежит каждая любимая.
 * После этого нажатие включает песню сразу, без поиска и без фрагмента.
 */
object Warm {
    private const val THREADS = 3
    private val pool = java.util.concurrent.Executors.newFixedThreadPool(THREADS + 1)
    @Volatile private var running = false
    @Volatile var left = 0; private set

    fun start(ctx: android.content.Context) {
        val app = ctx.applicationContext
        if (running || Settings.warm(app) == Settings.Warm.OFF) return
        running = true
        pool.execute {
            try {
                // Всё, что ещё не лежит на телефоне целиком и чьё начало не сохранено. Новые любимые — первыми.
                // SoundCloud отдаёт звук нарезкой — начало для него сохранить нельзя, такие песни не перебираем заново.
                val list = Library.favorites.filter {
                    Library.localFor(it) == null && !MediaCache.has(it) && !HeadCache.has(it) && Streams.whereOf(it)?.contains("soundcloud") != true
                }.take(15)
                val remaining = java.util.concurrent.atomic.AtomicInteger(list.size)
                left = list.size
                // 1) Zaycev — на любой сети, в том числе мобильной: ответ в килобайт и 256 КБ начала песни.
                //    Что там нашлось, включается мгновенно. Это основной путь для русскоязычной медиатеки.
                val missed = java.util.Collections.synchronizedList(mutableListOf<Track>())
                val next = java.util.concurrent.atomic.AtomicInteger(0)
                (1..THREADS).map {
                    pool.submit {
                        while (true) {
                            val i = next.getAndIncrement()
                            if (i >= list.size || Settings.warm(app) == Settings.Warm.OFF) break
                            val t = list[i]
                            val s = runCatching { Streams.zaycevOnly(t) }.getOrNull()
                            if (s != null && runCatching { HeadCache.store(t, s) }.getOrDefault(false)) left = remaining.decrementAndGet() else missed += t
                            Thread.sleep(150)
                        }
                    }
                }.forEach { runCatching { it.get() } }
                AppLog.add("ПОДГОТОВКА: Zaycev — готово ${list.size - missed.size} из ${list.size}, начал на телефоне ${HeadCache.count}")
                // 2) Остальное (YouTube Music) — тяжелее по трафику: только когда разрешено настройкой (по умолчанию Wi‑Fi).
                val next2 = java.util.concurrent.atomic.AtomicInteger(0)
                (1..THREADS).map {
                    pool.submit {
                        while (true) {
                            val i = next2.getAndIncrement()
                            if (i >= missed.size || !allowed(app)) break
                            val t = missed[i]
                            runCatching { Ytdlp.inBackground { Streams.warm(t) }?.let { s -> HeadCache.store(t, s) } }
                            left = remaining.decrementAndGet()
                            Thread.sleep(250)
                        }
                    }
                }.forEach { runCatching { it.get() } }
            } finally { running = false; left = 0 }
        }
    }

    private fun allowed(ctx: android.content.Context): Boolean = when (Settings.warm(ctx)) {
        Settings.Warm.OFF -> false
        Settings.Warm.ALWAYS -> true
        Settings.Warm.WIFI -> runCatching {
            !ctx.getSystemService(android.net.ConnectivityManager::class.java).isActiveNetworkMetered
        }.getOrDefault(false)
    }
}
