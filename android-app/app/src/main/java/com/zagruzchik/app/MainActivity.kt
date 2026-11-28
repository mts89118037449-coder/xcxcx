package com.zagruzchik.app

import android.Manifest
import android.content.ClipboardManager
import android.content.Intent
import android.content.pm.PackageManager
import android.content.res.ColorStateList
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.view.inputmethod.EditorInfo
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.isVisible
import androidx.core.widget.doAfterTextChanged
import androidx.recyclerview.widget.ItemTouchHelper
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.google.android.material.appbar.MaterialToolbar
import com.google.android.material.button.MaterialButton
import com.google.android.material.button.MaterialButtonToggleGroup
import com.google.android.material.card.MaterialCardView
import com.google.android.material.color.MaterialColors
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.google.android.material.progressindicator.LinearProgressIndicator
import com.google.android.material.snackbar.Snackbar
import com.google.android.material.textfield.TextInputEditText
import com.google.android.material.textfield.TextInputLayout
import com.yausername.youtubedl_android.YoutubeDL
import kotlin.concurrent.thread
import com.google.android.material.R as M

class MainActivity : AppCompatActivity() {

    private lateinit var toolbar: MaterialToolbar
    private lateinit var nav: PillNav
    private lateinit var pages: Map<Int, View>

    // Вкладка «Скачать»
    private lateinit var inputLayout: TextInputLayout
    private lateinit var input: TextInputEditText
    private lateinit var formats: MaterialButtonToggleGroup
    private lateinit var transferBtn: MaterialButton
    private lateinit var listenBtn: MaterialButton
    private lateinit var linkSection: View
    private lateinit var searchBox: View
    private lateinit var searchResults: LinearLayout
    private var searchSeq = 0
    private val searchRun = Runnable { runSearch() }
    private lateinit var activeCard: MaterialCardView
    private lateinit var activeTitle: TextView
    private lateinit var activeProgress: LinearProgressIndicator

    // Вкладка «Загрузки»
    private val adapter = JobsAdapter()
    private lateinit var jobsEmpty: View
    private lateinit var kinds: MaterialButtonToggleGroup
    private lateinit var siteChips: com.google.android.material.chip.ChipGroup
    private lateinit var playAll: MaterialButton
    private var kindFilter: Kind? = null
    private var siteFilter: String? = null

    // Мини-проигрыватель
    private lateinit var mini: View
    private var controller: androidx.media3.session.MediaController? = null
    private val miniTicker = object : Runnable {
        override fun run() {
            updateMiniProgress()
            mini.postDelayed(this, 500)
        }
    }
    private val playerListener = object : androidx.media3.common.Player.Listener {
        override fun onEvents(player: androidx.media3.common.Player, events: androidx.media3.common.Player.Events) = updateMini()
    }

    // Вкладка «Настройки»
    private lateinit var sites: LinearLayout

    private val prefs by lazy { getSharedPreferences("app", MODE_PRIVATE) }

    /** Действие из ярлыка на значке: выполняется, когда окно получит фокус (иначе буфер обмена не прочитать). */
    private var pendingClipAction: String? = null

    private val listener: (Job?) -> Unit = { job ->
        if (job == null) { refreshJobs(); refreshLibrary() } else adapter.update(job)
        refreshSummary()
    }

    private val pickCookies = registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri == null) return@registerForActivityResult
        val n = runCatching { contentResolver.openInputStream(uri)!!.bufferedReader().use { Cookies.import(this, it.readText()) } }.getOrDefault(0)
        snack(if (n > 0) "Вход сохранён" else "В файле нет данных для входа")
        refreshSites()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        VisiblePrefetch.install(this) // всё, что видно на экране, готовится к мгновенному старту
        setContentView(R.layout.activity_main)
        toolbar = findViewById(R.id.toolbar)
        nav = findViewById(R.id.bottomNav)
        pages = mapOf(
            R.id.nav_download to findViewById(R.id.pageDownload),
            R.id.nav_music to findViewById(R.id.pageMusic),
            R.id.nav_library to findViewById(R.id.pageLibrary),
            R.id.nav_jobs to findViewById(R.id.pageJobs),
            R.id.nav_settings to findViewById(R.id.pageSettings),
        )
        nav.setItems(navItems())
        nav.listener = { applyPage(it) }
        toolbar.setOnMenuItemClickListener {
            if (it.itemId == R.id.action_clear) Jobs.clearFinished()
            true
        }

        setupMiniPlayer()
        // Остальные вкладки достраиваются при первом открытии, а не все разом при запуске.
        val initial = savedInstanceState?.getInt("page") ?: R.id.nav_music
        ensurePage(initial)
        showPage(initial) // приложение открывается на музыке
        handleIntent(intent)
        if (savedInstanceState == null) askNotificationPermission()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        outState.putInt("page", nav.selectedItemId)
    }

    /** Вкладки строим по первому требованию: при запуске собирается только видимая. */
    private val builtPages = mutableSetOf<Int>()
    private fun ensurePage(id: Int) {
        if (!builtPages.add(id)) return
        when (id) {
            R.id.nav_music -> setupMusicPage()
            R.id.nav_download -> { setupDownloadPage(); refreshSummary(); pasteFromClipboard(force = false) }
            R.id.nav_jobs -> { setupJobsPage(); refreshJobs() }
            R.id.nav_settings -> { setupSettingsPage(); refreshSites() }
            R.id.nav_library -> { } // содержимое медиатеки строит LibraryPage (создаётся с «Музыкой»)
        }
    }

    override fun onStart() {
        super.onStart()
        installedCache = null // могли поставить/удалить приложение или сменить «мой сервис»
        Library.listen(libraryListener)
        History.listen(libraryListener)
        News.listen(newsListener)
        News.checkOnLaunch() // вернулись в приложение спустя время — тоже проверяем
        Jobs.listen(listener)
        refreshJobs()
        refreshLibrary()
        refreshSummary()
        if (::musicSearch.isInitialized) loadHome() // если в прошлый раз не было интернета
        Playback.controller(this) { c ->
            controller = c
            c.addListener(playerListener)
            updateMini()
        }
        mini.removeCallbacks(miniTicker)
        mini.post(miniTicker)
        refreshSites()
    }

    override fun onStop() {
        Library.unlisten(libraryListener)
        History.unlisten(libraryListener)
        News.unlisten(newsListener)
        Jobs.unlisten(listener)
        controller?.removeListener(playerListener)
        controller = null
        mini.removeCallbacks(miniTicker)
        super.onStop()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleIntent(intent)
    }

    private fun handleIntent(intent: Intent?) {
        // Вкладка нижнего меню, нажатая на другом экране (подборка, эквалайзер…).
        intent?.getIntExtra(EXTRA_PAGE, 0)?.takeIf { it != 0 && pages.containsKey(it) }?.let { showPage(it); intent.removeExtra(EXTRA_PAGE) }
        when (intent?.action) {
            ACTION_PASTE_DOWNLOAD, ACTION_PASTE_LINKS -> pendingClipAction = intent.action
        }
        intent?.getStringExtra(DownloadService.EXTRA_URL)?.let {
            ensurePage(R.id.nav_download)
            input.setText(it)
            showPage(R.id.nav_download)
        }
        if (intent?.getBooleanExtra(EXTRA_SHOW_JOBS, false) == true) showPage(R.id.nav_jobs)
    }

    /** Переключить вкладку из кода: нижняя панель сама вызовет [applyPage]. */
    private fun showPage(id: Int) {
        if (nav.selectedItemId != id) nav.selectedItemId = id else applyPage(id)
    }

    private var shownPage: Int? = null

    /** Сохраняем содержимое и позицию прокрутки при переключении вкладок. */
    private fun applyPage(id: Int) {
        val incoming = pages[id] ?: return
        val previous = shownPage
        if (previous == id) return
        val outgoing = previous?.let(pages::get)
        shownPage = id
        currentPage = id
        ensurePage(id)
        if (id == R.id.nav_library && libraryDirty) refreshLibrary()

        if (outgoing?.hasFocus() == true) nav.focusSelected()
        pages.values.forEach { page ->
            page.animate().withEndAction(null).cancel()
            page.importantForAccessibility = if (page === incoming) View.IMPORTANT_FOR_ACCESSIBILITY_AUTO
                else View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS
            page.isVisible = page === incoming || page === outgoing
            if (page !== incoming && page !== outgoing) page.alpha = 1f
        }
        incoming.bringToFront()
        val animate = outgoing != null && (android.os.Build.VERSION.SDK_INT < 26 ||
            android.animation.ValueAnimator.areAnimatorsEnabled())
        incoming.alpha = if (animate) 0f else 1f
        incoming.translationX = if (animate) dp(10).toFloat() else 0f
        if (animate && outgoing != null) {
            outgoing.animate().alpha(0f).setDuration(160L).withEndAction {
                if (shownPage != previous) outgoing.isVisible = false
            }.start()
            incoming.animate().alpha(1f).translationX(0f).setDuration(220L)
                .setInterpolator(android.view.animation.DecelerateInterpolator()).start()
        } else {
            outgoing?.isVisible = false
        }
        toolbar.title = when (id) {
            R.id.nav_music -> "Музыка"
            R.id.nav_library -> "Медиатека"
            R.id.nav_jobs -> "Загрузки"
            R.id.nav_settings -> "Настройки"
            R.id.nav_download -> "Скачать по ссылке"
            else -> "SoundAura"
        }
        toolbar.menu.clear()
        // На «Музыке» своя шапка с логотипом SoundAura — обычный заголовок не нужен.
        toolbar.isVisible = id != R.id.nav_music && id != R.id.nav_library
        // Медиатека: первые песни, которых нет на телефоне и в памяти, готовим заранее.
        // (в фоне: проверка «есть ли на телефоне» трогает диск — на всей медиатеке это давало паузу при переключении вкладки)
        if (id == R.id.nav_library && ::musicSearch.isInitialized) thread {
            val first = Library.favorites.take(40).filter { Library.localFor(it) == null && !MediaCache.has(it) && !HeadCache.has(it) }
            if (first.isNotEmpty()) Streams.prefetchMany(first, 3)
        }
        if (id == R.id.nav_jobs) toolbar.inflateMenu(R.menu.jobs)
        refreshSummary()
    }

    // ---------------- Скачать ----------------

    private fun setupDownloadPage() {
        inputLayout = findViewById(R.id.inputLayout)
        input = findViewById(R.id.input)
        formats = findViewById(R.id.formats)
        transferBtn = findViewById(R.id.transfer)
        listenBtn = findViewById(R.id.listen)
        linkSection = findViewById(R.id.linkSection)
        searchBox = findViewById(R.id.searchBox)
        searchResults = findViewById(R.id.searchResults)
        listenBtn.setOnClickListener {
            Links.extract(input.text.toString())?.let { Playback.playLink(this, it, input.text.toString()) }
        }
        activeCard = findViewById(R.id.activeCard)
        activeTitle = findViewById(R.id.activeTitle)
        activeProgress = findViewById(R.id.activeProgress)

        FormatPicker.setup(formats, null)
        input.doAfterTextChanged { onLinkChanged() }
        input.setOnEditorActionListener { _, action, _ ->
            if (action == EditorInfo.IME_ACTION_GO) {
                if (Links.extract(input.text.toString()) != null) download() else hideKeyboard()
            }
            true
        }
        // Крестик в поле: запоминаем ссылку, чтобы она не подставлялась из буфера снова.
        inputLayout.setEndIconOnClickListener {
            Links.extract(input.text.toString())?.let { prefs.edit().putString("dismissed", it).apply() }
            input.setText("")
        }
        findViewById<View>(R.id.paste).setOnClickListener { pasteFromClipboard(force = true) }
        findViewById<View>(R.id.download).setOnClickListener { download() }
        transferBtn.setOnClickListener {
            Links.extract(input.text.toString())?.let { TransferActivity.open(this, it, input.text.toString()) }
        }
        activeCard.setOnClickListener { showPage(R.id.nav_jobs) }
    }

    /**
     * Поле одно на всё: ссылка — показываем, что это, и кнопки «Скачать»/«Слушать»;
     * просто текст — ищем песни по названию.
     */
    private fun onLinkChanged() {
        val text = input.text?.toString().orEmpty()
        val url = Links.extract(text)
        inputLayout.error = null
        val searching = url == null && text.trim().length >= 2
        linkSection.isVisible = !searching
        searchBox.isVisible = searching
        input.removeCallbacks(searchRun)
        inputLayout.helperText = when {
            text.isBlank() -> "Вставьте ссылку или напишите, что найти"
            searching -> "Поиск песен · нажмите ▶, чтобы слушать сразу"
            url == null -> "Напишите хотя бы пару букв"
            else -> Describe.of(url)
        }
        if (searching) {
            findViewById<View>(R.id.searchProgress).isVisible = true
            input.postDelayed(searchRun, 450) // ждём, пока человек допечатает
            return
        }
        FormatPicker.setup(formats, url)
        val music = url != null && (Music.isMusic(url) || Service.of(url) == Service.YOUTUBE)
        transferBtn.isVisible = music
        listenBtn.isVisible = url != null && Music.isMusic(url)
        if (url != null && Music.isMusic(url)) Playback.prefetchLink(url, text) // к нажатию «Слушать» уже готово
    }

    private fun runSearch() {
        val q = input.text?.toString()?.trim().orEmpty()
        val seq = ++searchSeq
        thread {
            val found = runCatching { MusicSearch.search(q) }.getOrDefault(emptyList())
            runOnUiThread { if (seq == searchSeq) showResults(q, found) }
        }
    }

    private fun showResults(q: String, found: List<Track>) {
        findViewById<View>(R.id.searchProgress).isVisible = false
        val empty = findViewById<TextView>(R.id.searchEmpty)
        empty.isVisible = found.isEmpty()
        empty.text = "Ничего не нашлось по «$q». Попробуйте иначе или вставьте ссылку."
        searchResults.removeAllViews()
        // Первые три — начинаем готовить заранее, чтобы ▶ срабатывал быстро.
        Streams.prefetchMany(found, 3)
        found.forEach { t -> searchResults.addView(trackRow(searchResults, t)) }
    }

    // ---------------- Музыка: поиск и библиотека ----------------

    private lateinit var musicSearch: TextInputEditText
    private var musicSeq = 0
    private var library: LibraryPage? = null
    private val musicSearchRun = Runnable { runMusicSearch() }
    // Изменения сыплются пачками (перенос, обложки в фоне) — перерисовываем один раз, а не на каждое.
    private val libraryRefresh = Runnable { refreshLibrary() }
    private val libraryListener: () -> Unit = {
        window.decorView.removeCallbacks(libraryRefresh)
        window.decorView.postDelayed(libraryRefresh, 400)
    }

    private fun setupMusicPage() {
        musicSearch = findViewById(R.id.musicSearch)
        findViewById<TextView>(R.id.brandGreeting).text = Aura.greeting()
        // Поиск — по кнопке в шапке: поле выезжает, главная остаётся под ним.
        val searchBox = findViewById<View>(R.id.musicSearchLayout)
        fun openSearch(open: Boolean) {
            searchBox.isVisible = open
            if (open) {
                musicSearch.requestFocus()
                getSystemService(android.view.inputmethod.InputMethodManager::class.java)?.showSoftInput(musicSearch, 0)
            } else { musicSearch.setText(""); hideKeyboard() }
        }
        findViewById<View>(R.id.searchOpen).setOnClickListener { openSearch(!searchBox.isVisible) }
        onBackPressedDispatcher.addCallback(this, object : androidx.activity.OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (nav.selectedItemId == R.id.nav_music && searchBox.isVisible) openSearch(false)
                else { isEnabled = false; onBackPressedDispatcher.onBackPressed(); isEnabled = true }
            }
        })
        musicSearch.doAfterTextChanged {
            val q = it?.toString()?.trim().orEmpty()
            findViewById<View>(R.id.musicResults).isVisible = q.length >= 2
            findViewById<View>(R.id.homeSection).isVisible = q.length < 2
            musicSearch.removeCallbacks(musicSearchRun)
            musicSeq++ // Предыдущий ответ уже относится к другому тексту.
            if (q.length >= 2) {
                findViewById<View>(R.id.musicProgress).isVisible = true
                musicSearch.postDelayed(musicSearchRun, 300)
            }
        }
        musicSearch.setOnEditorActionListener { _, _, _ ->
            val input = musicSearch.text?.toString()?.trim().orEmpty()
            if (PublicTelegram.canonical(input) != null || Http.isDirectAudio(input)) {
                musicSearch.removeCallbacks(musicSearchRun)
                musicSeq++
                openSearch(false)
                Playback.playLink(this, input, null)
            }
            hideKeyboard()
            true
        }
        library = LibraryPage(this, ::snack) { parent, t, local, status, video, onPlay ->
            trackRow(parent, t, local = local, status = status, video = video, onPlay = onPlay)
        }
        loadHome()
    }

    private var homeLoaded = false
    private var homeLoading = false

    /** Главная как в стриминговом сервисе: чарт России, популярные альбомы и исполнители. */
    private fun loadHome() {
        if (homeLoaded || homeLoading) return
        homeLoading = true
        val home = findViewById<LinearLayout>(R.id.homeSection)
        if (home.childCount == 0) renderHome(home, emptyList(), emptyList(), emptyList(), emptyList(), last = false) // каркас сразу
        thread {
            // 1) Мгновенно — то, что сохранено с прошлого раза; 2) затем свежее из сети.
            for (offline in listOf(true, false)) {
                fun <T> load(f: () -> T) = pool { if (offline) Http.fromDisk(f) else f() }
                val chart = load { Catalog.chartRu() }
                val world = load { Catalog.chartWorld() }
                val albums = load { Catalog.topAlbums() }
                val artists = load { Catalog.topArtists() }
                val c = runCatching { chart.get() }.getOrDefault(emptyList())
                val w = runCatching { world.get() }.getOrDefault(emptyList())
                val al = runCatching { albums.get() }.getOrDefault(emptyList())
                val ar = runCatching { artists.get() }.getOrDefault(emptyList())
                if (offline && c.isEmpty() && w.isEmpty() && al.isEmpty() && ar.isEmpty()) continue
                val last = !offline
                runOnUiThread { renderHome(home, c, w, al, ar, last) }
            }
        }
    }

    // Последние данные главной — чтобы перерисовать её, когда пришли новинки.
    private var homeData: List<Any> = emptyList()
    private val newsListener: () -> Unit = { homeData.takeIf { it.size == 4 }?.let { renderHomeAgain() } }

    @Suppress("UNCHECKED_CAST")
    private fun renderHomeAgain() {
        val d = homeData
        renderHome(findViewById(R.id.homeSection), d[0] as List<Track>, d[1] as List<Track>, d[2] as List<Album>, d[3] as List<Artist>, last = false)
    }

    /** Полка карточек с заголовком раздела. */
    private fun shelf(home: LinearLayout, title: String, action: String? = null, onAction: (() -> Unit)? = null, fill: (LinearLayout) -> Unit) {
        home.addView(sectionHeader(title, action, onAction))
        val (scroll, inner) = Rows.shelf(this)
        fill(inner)
        home.addView(scroll)
    }

    /**
     * Главная SoundAura: «Аура дня», плитки разделов (чарт России, новинки, мировой чарт, радио),
     * недавно слушали, ваши исполнители, популярное.
     */
    private fun renderHome(home: LinearLayout, c: List<Track>, w: List<Track>, al: List<Album>, ar: List<Artist>, last: Boolean) {
        if (last) homeLoading = false
        if (isDestroyed) return
        homeData = listOf(c, w, al, ar)
        home.removeAllViews()
        val fav = Taste.favoriteArtistsFast(3) { if (!isDestroyed && homeData.size == 4) renderHomeAgain() }
        home.addView(HomeViews.hero(this,
            if (fav.isEmpty()) "Лучшее из чарта — в порядке под ваш вкус"
            else fav.joinToString(", ") + " и новое по вашим тегам" + Tags.topCached.takeIf { it.isNotEmpty() }?.joinToString(" · ", prefix = "\n")
                .orEmpty(),
        ) { HomeViews.playAura(this) })

        val releases = News.releases
        val fresh = releases.count { it.isNew }
        val chartTile = HomeViews.tile(this, "Чарт России", if (c.isEmpty()) "загружаю…" else "${c.size} песен · сегодня",
            c.take(3).map { it.cover }, null, c.firstOrNull()?.let { "1. ${it.title} — ${it.artist}" }, tall = true,
        ) { startActivity(CollectionActivity.list(this, CollectionActivity.LIST_RU)) }
        val newsTile = HomeViews.tile(this, "Новинки", if (releases.isEmpty()) "ставьте ♥ — тут появятся" else "ваших исполнителей",
            releases.take(3).map { it.album.cover }, if (fresh > 0) "$fresh новых" else null,
            releases.firstOrNull()?.let { "${it.album.artist} — «${it.album.title}»" }, tall = true,
        ) { startActivity(CollectionActivity.list(this, CollectionActivity.LIST_NEWS)) }
        val worldTile = HomeViews.tile(this, "Мировой чарт", w.take(2).joinToString(", ") { it.artist }.ifEmpty { "Deezer" },
            emptyList(), null, null, tall = false,
        ) { startActivity(CollectionActivity.list(this, CollectionActivity.LIST_WORLD)) }
        val radioTile = HomeViews.tile(this, "Радио", "похожее на последнюю песню", emptyList(), null, null, tall = false,
        ) { HomeViews.playRadio(this, ::snack) }
        home.addView(HomeViews.grid(this, listOf(chartTile to newsTile, worldTile to radioTile), listOf(168, 92)))

        // Вы недавно слушали — из истории, включаются мгновенно, если есть в памяти.
        val recent = History.all.filter { it.kind == Kind.MUSIC }.take(12)
        if (recent.isNotEmpty()) shelf(home, "Вы недавно слушали", "История", { showPage(R.id.nav_library) }) { inner ->
            recent.forEachIndexed { i, e ->
                inner.addView(Rows.card(this, inner, e.track.title, e.track.artist, e.track.cover, false) {
                    val items = recent.map { r -> Playback.QItem(r.track, r.local ?: Library.localFor(r.track), r.sourceUrl, r.pageUrl) }
                    Playback.playQueue(this, items, i)
                })
            }
        }

        // Ваши исполнители — по любимому и прослушанному; фото подгружаются фоном.
        val mine = Taste.favoriteArtistsFast(10)
        if (mine.isNotEmpty()) shelf(home, "Ваши исполнители") { inner ->
            mine.forEach { name ->
                val card = Rows.card(this, inner, name, null, null, true) { Rows.openArtist(this, name) }
                inner.addView(card)
                pool {
                    val a = runCatching { Catalog.artistByName(name) }.getOrNull()
                    a?.picture?.let { pic ->
                        runOnUiThread { if (!isDestroyed) Images.into(card.findViewById(R.id.cardImage), pic, R.drawable.ph_artist) }
                    }
                }
            }
        }

        if (al.isNotEmpty()) shelf(home, "Популярные альбомы") { inner -> al.forEach { inner.addView(Rows.albumCard(this, inner, it)) } }
        if (ar.isNotEmpty()) shelf(home, "Популярные исполнители") { inner -> ar.forEach { inner.addView(Rows.artistCard(this, inner, it)) } }
        if (last) {
            homeLoaded = c.isNotEmpty() || al.isNotEmpty()
            Streams.prefetchMany(c, 6) // первые песни чарта включатся сразу с начала
        }
    }

    private val homePool = java.util.concurrent.Executors.newCachedThreadPool()
    private fun <T> pool(f: () -> T) = homePool.submit<T> { f() }

    /** Заголовок раздела, справа — необязательная кнопка. */
    private fun sectionHeader(title: String, action: String? = null, onAction: (() -> Unit)? = null): View {
        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = android.view.Gravity.CENTER_VERTICAL
        }
        row.addView(TextView(this, null, 0, R.style.SectionTitle).apply {
            text = title
            layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply {
                topMargin = dp(22); bottomMargin = dp(10); marginStart = dp(2)
            }
        })
        if (action != null && onAction != null) {
            // «Слушать» — главная кнопка ауры; остальное («Все», «История») — тихая ссылка.
            val primary = action == "Слушать"
            row.addView(MaterialButton(this, null, if (primary) com.google.android.material.R.attr.materialButtonStyle else androidx.appcompat.R.attr.borderlessButtonStyle).apply {
                text = action
                if (primary) {
                    setIconResource(R.drawable.ic_play_arrow)
                    Aura.primaryButton(this)
                    setPadding(dp(14), 0, dp(16), 0)
                } else {
                    setTextColor(MaterialColors.getColor(this, M.attr.colorOnSurfaceVariant))
                    setPadding(dp(8), 0, dp(8), 0)
                }
                minHeight = dp(40); minimumHeight = dp(40)
                insetTop = 0; insetBottom = 0
                layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, dp(40)).apply { topMargin = dp(12) }
                setOnClickListener { onAction() }
            })
        }
        return row
    }

    /** Поиск: каталоги (быстро, с обложками) + SoundCloud и YouTube (дольше, но там есть всё). */
    private fun runMusicSearch() {
        val q = musicSearch.text?.toString()?.trim().orEmpty()
        val seq = ++musicSeq
        val catalog = findViewById<LinearLayout>(R.id.catalogList)
        val web = findViewById<LinearLayout>(R.id.webList)
        web.removeAllViews()
        webDrawn = emptyList()
        webQueue = emptyList()
        findViewById<View>(R.id.webProgress).isVisible = true
        val shelves = findViewById<LinearLayout>(R.id.searchShelves)
        shelves.removeAllViews()
        thread {
            // Исполнители и альбомы — как в стриминговом сервисе.
            val artists = runCatching { Catalog.searchArtists(q) }.getOrDefault(emptyList())
                .filter { WebSearch.relevance(q, WebResult("", it.name, it.name, 0, "")) >= 0.5 }.take(6)
            val albums = runCatching { Catalog.searchAlbums(q) }.getOrDefault(emptyList())
            runOnUiThread {
                if (seq != musicSeq) return@runOnUiThread
                shelves.removeAllViews()
                if (artists.isNotEmpty()) {
                    shelves.addView(sectionHeader("Исполнители"))
                    val (scroll, inner) = Rows.shelf(this)
                    artists.forEach { inner.addView(Rows.artistCard(this, inner, it)) }
                    shelves.addView(scroll)
                }
                if (albums.isNotEmpty()) {
                    shelves.addView(sectionHeader("Альбомы"))
                    val (scroll, inner) = Rows.shelf(this)
                    albums.forEach { inner.addView(Rows.albumCard(this, inner, it)) }
                    shelves.addView(scroll)
                }
            }
        }
        thread {
            val found = runCatching { MusicSearch.search(q) }.getOrDefault(emptyList())
            runOnUiThread {
                if (seq != musicSeq) return@runOnUiThread
                findViewById<View>(R.id.musicProgress).isVisible = false
                findViewById<View>(R.id.catalogEmpty).isVisible = found.isEmpty()
                Rows.cancelChunked(catalog)
                catalog.removeAllViews()
                // Результаты — это список: дальше играют следующие песни из него (и свайп по плееру).
                val items = found.map { Playback.QItem(it, Library.localFor(it), it.url) }
                Rows.fillChunked(catalog, found, firstChunk = 12, chunkSize = 12) { i, t ->
                    trackRow(catalog, t, onPlay = { Playback.playQueue(this, items, i) })
                }
                Streams.prefetchMany(found, 4) // к нажатию ▶ полная версия уже готова
            }
        }
        val collected = mutableListOf<Pair<WebResult, Double>>()
        val failed = mutableListOf<String>()
        var answered = 0
        WebSearch.searchAll(q, onResults = { src, results, err ->
            val scored = results.map { it to WebSearch.relevance(q, it) }.filter { it.second >= 0.34 }
            synchronized(collected) {
                collected += scored
                if (err != null) failed += "$src ($err)"
                answered++
                postWeb(seq, q, rankWeb(collected), answered, done = false, failed.toList())
            }
        }, onDone = {
            synchronized(collected) {
                postWeb(seq, q, rankWeb(collected), answered, done = true, failed.toList())
            }
        })
    }

    private class WebState(val seq: Int, val q: String, val shown: List<WebResult>, val answered: Int, val done: Boolean, val failed: List<String>)
    @Volatile private var webPending: WebState? = null
    private var webScheduled = false
    private var webLastDraw = 0L
    private var webDrawn: List<WebResult> = emptyList()
    private var webQueue: List<Playback.QItem> = emptyList()

    private fun postWeb(seq: Int, q: String, shown: List<WebResult>, answered: Int, done: Boolean, failed: List<String>) {
        runOnUiThread {
            if (seq != musicSeq) return@runOnUiThread
            webPending = WebState(seq, q, shown, answered, done, failed)
            if (webScheduled) return@runOnUiThread
            webScheduled = true
            val wait = (350 - (System.currentTimeMillis() - webLastDraw)).coerceAtLeast(0)
            musicSearch.postDelayed({
                webScheduled = false
                val st = webPending ?: return@postDelayed
                if (st.seq != musicSeq) return@postDelayed
                webLastDraw = System.currentTimeMillis()
                showWeb(st.q, st.shown, st.answered, st.done, st.failed)
            }, wait)
        }
    }

    /** Похожие на запрос — выше; совсем непохожие не показываем; повторы — один раз; сверху — разные площадки. */
    private fun rankWeb(all: List<Pair<WebResult, Double>>): List<WebResult> {
        val seen = HashSet<String>()
        return all
            .sortedByDescending { it.second }
            .map { it.first }
            .filter { seen.add(it.url) }
            .let { sorted ->
                val perSource = HashMap<String, Int>()
                val (head, tail) = sorted.partition { (perSource.merge(it.source, 1, Int::plus) ?: 0) <= 4 }
                head + tail
            }
            .take(40)
    }

    private fun showWeb(q: String, shown: List<WebResult>, answered: Int, done: Boolean, failed: List<String> = emptyList()) {
        val web = findViewById<LinearLayout>(R.id.webList)
        findViewById<View>(R.id.webProgress).isVisible = !done
        val sources = shown.map { it.source }.distinct()
        findViewById<TextView>(R.id.webHint).text = when {
            shown.isEmpty() && done -> "Нигде не нашлось. Проверьте написание или попробуйте только название."
            shown.isEmpty() -> "Ищу на ${WebSearch.sourceCount} площадках… ответили $answered"
            else -> "Нашлось на: ${sources.joinToString(", ")}" + if (done) "" else " · ищу дальше…"
        } + if (failed.isNotEmpty()) "\nНе ответили: ${failed.joinToString("; ")}" else ""
        if (shown == webDrawn) return
        val previous = webDrawn.mapIndexed { i, result -> result to web.getChildAt(i) }.toMap()
        val wanted = shown.toHashSet()
        previous.forEach { (result, row) -> if (result !in wanted) web.removeView(row) }
        webDrawn = shown
        webQueue = shown.map { w ->
            Playback.QItem(w.track(), null, null, if (w.direct) null else w.url, if (w.direct) w.url else null, w.source)
        }
        // Оставляем общий префикс на месте, затем выстраиваем хвост, сохраняя готовые строки и обложки.
        var moving = false
        shown.forEachIndexed { index, result ->
            val row = previous[result]
            if (row == null) {
                val item = webQueue[index]
                web.addView(trackRow(web, item.track, pageUrl = item.pageUrl, directUrl = item.directUrl,
                    directSource = result.source, subtitle = listOf(result.source, result.artist)
                        .filter { it.isNotBlank() }.joinToString(" · "),
                    onPlay = {
                        val position = webDrawn.indexOf(result)
                        if (position >= 0) Playback.playQueue(this, webQueue, position)
                    }))
            } else if (moving || web.getChildAt(index) !== row) {
                moving = true
                web.bringChildToFront(row)
            }
            if (row == null && index < web.childCount - 1) moving = true
        }
    }

    private fun statusOf(t: Track, local: SavedFile?) = Rows.statusOf(t, local)

    // Медиатека не на экране — не пересобираем её зря (тысячи песен), обновим при открытии вкладки.
    private var libraryDirty = true
    private var libraryStamp: String? = null
    private fun refreshLibrary() {
        if (pages[R.id.nav_library]?.isVisible != true) { libraryDirty = true; return }
        libraryDirty = false
        // Пересобираем, только если данные действительно изменились: раньше список строился заново при каждом входе во вкладку.
        val fav = Library.favorites
        val stamp = "${fav.size}|${fav.firstOrNull()?.let { it.title + it.artist + (it.cover ?: "") }}|${Jobs.version}|${History.all.size}|${Library.playlists.size}|${Library.albums.size}"
        if (stamp == libraryStamp) return
        libraryStamp = stamp
        library?.refresh()
    }

    /** Строка песни — общая с экранами исполнителя и альбома. */
    private fun trackRow(
        parent: ViewGroup, t: Track, pageUrl: String? = null, local: SavedFile? = null,
        subtitle: String? = null, onPlay: (() -> Unit)? = null,
        directUrl: String? = null, directSource: String? = null,
        status: String? = null, video: Boolean = false, number: Int? = null,
    ): View = Rows.track(this, parent, t, ::snack, pageUrl, local, subtitle, onPlay, directUrl, directSource, status, video, number,
        beforePlay = { hideKeyboard() })

    private fun hideKeyboard() {
        getSystemService(android.view.inputmethod.InputMethodManager::class.java)?.hideSoftInputFromWindow(window.decorView.windowToken, 0)
    }

    // Android разрешает читать буфер обмена, только когда окно в фокусе.
    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (!hasFocus) return
        pendingClipAction?.let { action ->
            pendingClipAction = null
            runClipAction(action)
            return
        }
        if (::input.isInitialized && input.text.isNullOrBlank()) pasteFromClipboard(force = false)
    }

    private fun runClipAction(action: String) {
        val clip = getSystemService(ClipboardManager::class.java).primaryClip
        val text = clip?.takeIf { it.itemCount > 0 }?.getItemAt(0)?.coerceToText(this)?.toString()
        val url = Links.extract(text)
        if (url == null) {
            showPage(R.id.nav_download)
            snack("В буфере обмена нет ссылки — скопируйте её и попробуйте снова")
            return
        }
        if (action == ACTION_PASTE_LINKS) {
            TransferActivity.open(this, url, text)
        } else {
            DownloadService.enqueue(this, url, Links.defaultFormat(url), text)
            showPage(R.id.nav_jobs)
        }
    }

    /** Сам подставляет только новые ссылки: уже скачанные и стёртые крестиком — нет. */
    private fun pasteFromClipboard(force: Boolean) {
        if (!::input.isInitialized) return
        val clip = runCatching { getSystemService(ClipboardManager::class.java).primaryClip }.getOrNull()
        val text = clip?.takeIf { it.itemCount > 0 }?.getItemAt(0)?.coerceToText(this)?.toString()
        val url = Links.extract(text)
        if (url == null) {
            if (force) snack("В буфере обмена нет ссылки")
            return
        }
        if (!force && (url == prefs.getString("dismissed", null) || Jobs.all.any { it.url == url })) return
        input.setText(url)
        input.setSelection(url.length)
    }

    private fun download() {
        val url = Links.extract(input.text.toString())
        if (url == null) {
            inputLayout.error = "Вставьте ссылку или выберите песню из поиска"
            return
        }
        DownloadService.enqueue(this, url, FormatPicker.selected(formats), input.text.toString())
        input.setText("")
        showPage(R.id.nav_jobs)
    }

    private fun refreshSummary() {
        val all = Jobs.all
        val active = all.filter { it.active }
        nav.setBadge(R.id.nav_jobs, active.size)
        if (::activeCard.isInitialized) {
            activeCard.isVisible = active.isNotEmpty()
            if (active.isNotEmpty()) {
                val running = active.firstOrNull { it.status == Status.RUNNING }
                activeTitle.text = when {
                    running == null -> "В очереди: ${active.size}"
                    active.size == 1 -> "Скачиваю: ${running.title}"
                    else -> "Скачиваю ${active.size}: ${running.title}"
                }
                val p = running?.progress ?: 0f
                if (activeProgress.isIndeterminate != (p <= 0f)) {
                    activeProgress.isVisible = false
                    activeProgress.isIndeterminate = p <= 0f
                    activeProgress.isVisible = true
                }
                if (p > 0f) activeProgress.setProgressCompat((p * 10).toInt(), true)
            }
        }
        toolbar.menu.findItem(R.id.action_clear)?.isVisible = all.any { !it.active }
    }

    // ---------------- Загрузки ----------------

    private fun setupJobsPage() {
        jobsEmpty = findViewById(R.id.jobsEmpty)
        kinds = findViewById(R.id.kinds)
        siteChips = findViewById(R.id.siteChips)
        playAll = findViewById(R.id.playAll)
        kinds.check(R.id.kindAll)
        kinds.addOnButtonCheckedListener { _, id, checked ->
            if (!checked) return@addOnButtonCheckedListener
            kindFilter = when (id) {
                R.id.kindMusic -> Kind.MUSIC
                R.id.kindVideo -> Kind.VIDEO
                else -> null
            }
            siteFilter = null
            refreshJobs()
        }
        playAll.setOnClickListener {
            val queue = adapter.items.filter { it.status == Status.DONE && it.kind == Kind.MUSIC }
                .flatMap { j -> j.files.map { it to j.album } }
            Playback.play(this, queue, 0)
        }
        findViewById<android.widget.EditText>(R.id.jobsQuery).doAfterTextChanged { refreshJobs() }
        val list = findViewById<RecyclerView>(R.id.jobsList)
        list.layoutManager = LinearLayoutManager(this)
        list.adapter = adapter
        list.itemAnimator?.changeDuration = 0 // без мигания при обновлении прогресса

        // Смахнуть завершённую загрузку — убрать из списка (файл остаётся). С возможностью вернуть.
        ItemTouchHelper(object : ItemTouchHelper.SimpleCallback(0, ItemTouchHelper.LEFT or ItemTouchHelper.RIGHT) {
            override fun onMove(rv: RecyclerView, vh: RecyclerView.ViewHolder, t: RecyclerView.ViewHolder) = false
            override fun getSwipeDirs(rv: RecyclerView, vh: RecyclerView.ViewHolder): Int {
                val job = adapter.items.getOrNull(vh.bindingAdapterPosition) ?: return 0
                return if (job.active) 0 else super.getSwipeDirs(rv, vh)
            }
            override fun onSwiped(vh: RecyclerView.ViewHolder, direction: Int) {
                val job = adapter.items.getOrNull(vh.bindingAdapterPosition) ?: return
                val pos = Jobs.all.indexOfFirst { it.id == job.id }
                Jobs.remove(job.id)
                Snackbar.make(nav, "Убрано из списка", Snackbar.LENGTH_LONG)
                    .setAnchorView(nav)
                    .setAction("Вернуть") { Jobs.restore(job, pos) }
                    .show()
            }
        }).attachToRecyclerView(list)
    }

    /** Пересобрать список с учётом фильтров «Музыка/Видео» и сервиса. */
    private fun refreshJobs() {
        if (!::jobsEmpty.isInitialized) return
        val all = Jobs.all
        val byKind = all.filter { kindFilter == null || it.kind == kindFilter }
        // Чипы сервисов — только те, что есть в текущей вкладке, с количеством.
        val counts = byKind.groupingBy { it.site }.eachCount().toList().sortedByDescending { it.second }
        if (siteFilter != null && counts.none { it.first == siteFilter }) siteFilter = null
        siteChips.setOnCheckedStateChangeListener(null)
        siteChips.removeAllViews()
        fun chip(label: String, value: String?) = com.google.android.material.chip.Chip(this).apply {
            text = label
            isCheckable = true
            isCheckedIconVisible = false
            isChecked = value == siteFilter
            tag = value
            siteChips.addView(this)
        }
        chip("Все сервисы · ${byKind.size}", null)
        counts.forEach { (site, n) -> chip("$site · $n", site) }
        siteChips.setOnCheckedStateChangeListener { group, ids ->
            siteFilter = ids.firstOrNull()?.let { group.findViewById<View>(it)?.tag as String? }
            refreshJobs()
        }
        (siteChips.parent as View).isVisible = counts.size > 1

        val query = findViewById<android.widget.EditText>(R.id.jobsQuery).text.toString().trim()
        val shown = byKind.filter { j ->
            (siteFilter == null || j.site == siteFilter) && (query.isEmpty() || j.title.contains(query, true) ||
                j.album.orEmpty().contains(query, true) || j.files.any { it.name.contains(query, true) })
        }
        adapter.submit(shown)
        playAll.isVisible = kindFilter == Kind.MUSIC && shown.any { it.status == Status.DONE }
        jobsEmpty.isVisible = shown.isEmpty()
        findViewById<TextView>(R.id.emptyTitle).text = when {
            query.isNotEmpty() -> "Ничего не найдено"
            all.isEmpty() -> "Пока ничего не скачано"
            kindFilter == Kind.MUSIC -> "Музыки пока нет"
            kindFilter == Kind.VIDEO -> "Видео пока нет"
            else -> "Ничего не найдено"
        }
        findViewById<ImageView>(R.id.emptyIcon).setImageResource(
            when (kindFilter) { Kind.MUSIC -> R.drawable.ic_library_music; Kind.VIDEO -> R.drawable.ic_video_library; else -> R.drawable.ic_download }
        )
    }

    inner class JobsAdapter : RecyclerView.Adapter<JobHolder>() {
        var items: List<Job> = emptyList()
            private set

        @android.annotation.SuppressLint("NotifyDataSetChanged")
        fun submit(list: List<Job>) {
            items = list
            notifyDataSetChanged()
        }

        fun update(job: Job) {
            val i = items.indexOfFirst { it.id == job.id }
            if (i >= 0) notifyItemChanged(i) else refreshJobs()
        }

        override fun getItemCount() = items.size
        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int) =
            JobHolder(LayoutInflater.from(parent.context).inflate(R.layout.item_job, parent, false))
        override fun onBindViewHolder(holder: JobHolder, position: Int) = holder.bind(items[position])
    }

    inner class JobHolder(v: View) : RecyclerView.ViewHolder(v) {
        private val card: MaterialCardView = v.findViewById(R.id.card)
        private val iconBox: View = v.findViewById(R.id.iconBox)
        private val icon: ImageView = v.findViewById(R.id.icon)
        private val cover: ImageView = v.findViewById(R.id.cover)
        private val coverBadge: ImageView = v.findViewById(R.id.coverBadge)
        private val title: TextView = v.findViewById(R.id.title)
        private val subtitle: TextView = v.findViewById(R.id.subtitle)
        private val progress: LinearProgressIndicator = v.findViewById(R.id.progress)
        private val btnOpen: View = v.findViewById(R.id.btnOpen)
        private val btnRetry: View = v.findViewById(R.id.btnRetry)
        private val btnCancel: View = v.findViewById(R.id.btnCancel)
        private val btnShare: View = v.findViewById(R.id.btnShare)
        private val btnDelete: View = v.findViewById(R.id.btnDelete)
        private val btnRemove: View = v.findViewById(R.id.btnRemove)
        private val btnExternal: View = v.findViewById(R.id.btnExternal)
        // ChipGroup переносит «таблетки» на следующую строку, если не влезают.
        private val servicesRow: ViewGroup = v.findViewById(R.id.servicesRow)

        fun bind(job: Job) {
            title.text = job.title
            val media = if (job.format == Format.MP3) R.drawable.ic_music_note else R.drawable.ic_movie
            val (iconRes, bg, fg) = when (job.status) {
                Status.FAILED -> Triple(R.drawable.ic_error_outline, M.attr.colorErrorContainer, M.attr.colorOnErrorContainer)
                Status.CANCELLED -> Triple(R.drawable.ic_close, M.attr.colorSurfaceContainerHighest, M.attr.colorOnSurfaceVariant)
                Status.DONE -> Triple(media, M.attr.colorPrimary, M.attr.colorOnPrimary)
                Status.QUEUED -> Triple(R.drawable.ic_schedule, M.attr.colorSecondaryContainer, M.attr.colorOnSecondaryContainer)
                Status.RUNNING -> Triple(media, M.attr.colorPrimaryContainer, M.attr.colorOnPrimaryContainer)
            }
            icon.setImageResource(iconRes)
            iconBox.backgroundTintList = ColorStateList.valueOf(MaterialColors.getColor(iconBox, bg))
            icon.imageTintList = ColorStateList.valueOf(MaterialColors.getColor(icon, fg))

            // Обложка: из файла или превью источника. Пока грузится — значок.
            val pos = bindingAdapterPosition
            val bmp = Covers.get(this@MainActivity, job) { if (pos != RecyclerView.NO_POSITION) adapter.notifyItemChanged(pos) }
            cover.isVisible = bmp != null
            icon.isVisible = bmp == null
            if (bmp != null) cover.setImageBitmap(bmp)
            // На обложке — маленький значок состояния (ошибка, отмена, очередь).
            val badge = when (job.status) {
                Status.FAILED -> Triple(R.drawable.ic_error_outline, M.attr.colorErrorContainer, M.attr.colorOnErrorContainer)
                Status.CANCELLED -> Triple(R.drawable.ic_close, M.attr.colorSurfaceContainerHighest, M.attr.colorOnSurfaceVariant)
                Status.QUEUED -> Triple(R.drawable.ic_schedule, M.attr.colorSecondaryContainer, M.attr.colorOnSecondaryContainer)
                else -> null
            }
            coverBadge.isVisible = bmp != null && badge != null
            if (badge != null) {
                coverBadge.setImageResource(badge.first)
                coverBadge.backgroundTintList = ColorStateList.valueOf(MaterialColors.getColor(coverBadge, badge.second))
                coverBadge.imageTintList = ColorStateList.valueOf(MaterialColors.getColor(coverBadge, badge.third))
            }

            subtitle.text = when (job.status) {
                Status.QUEUED -> "${job.format.label} · в очереди"
                Status.RUNNING -> listOf(if (job.progress > 0) "${job.progress.toInt()}%" else "", job.detail)
                    .filter { it.isNotEmpty() }.joinToString(" · ").ifEmpty { "Подключаюсь…" }
                Status.DONE -> job.detail.ifEmpty { "Готово" }
                Status.FAILED -> job.error
                Status.CANCELLED -> "Отменено"
            }
            subtitle.setTextColor(MaterialColors.getColor(subtitle, if (job.status == Status.FAILED) M.attr.colorError else M.attr.colorOnSurfaceVariant))

            progress.isVisible = job.active
            if (job.active) {
                val indeterminate = job.status == Status.QUEUED || job.progress <= 0f
                if (progress.isIndeterminate != indeterminate) {
                    progress.isVisible = false // индикатор меняет режим только скрытым
                    progress.isIndeterminate = indeterminate
                    progress.isVisible = true
                }
                if (!indeterminate) progress.setProgressCompat((job.progress * 10).toInt(), true)
            }

            bindServices(job)

            val finished = job.status == Status.FAILED || job.status == Status.CANCELLED
            btnCancel.isVisible = job.active
            // Слушать/смотреть можно уже во время загрузки: по ссылке на поток или готовые треки альбома.
            val canPlayNow = job.status == Status.RUNNING && job.playable
            btnOpen.isVisible = job.status == Status.DONE || canPlayNow
            btnExternal.isVisible = job.status == Status.DONE
            (btnOpen as MaterialButton).text = when {
                canPlayNow && job.kind == Kind.MUSIC -> if (job.files.isNotEmpty()) "Слушать готовое" else "Слушать сейчас"
                canPlayNow -> "Смотреть сейчас"
                job.kind == Kind.MUSIC -> "Слушать"
                else -> "Смотреть"
            }
            btnShare.isVisible = job.status == Status.DONE
            btnDelete.isVisible = job.status == Status.DONE
            btnRetry.isVisible = finished
            btnRemove.isVisible = finished

            btnCancel.setOnClickListener { Jobs.cancel(job.id) }
            btnOpen.setOnClickListener { play(job) }
            btnExternal.setOnClickListener { open(job) }
            btnShare.setOnClickListener { share(job) }
            btnDelete.setOnClickListener { confirmDelete(job) }
            btnRetry.setOnClickListener {
                Jobs.remove(job.id)
                DownloadService.enqueue(this@MainActivity, job.url, job.format, job.hint)
            }
            btnRemove.setOnClickListener { Jobs.remove(job.id) }
            card.setOnClickListener { if (job.status == Status.DONE || canPlayNow) play(job) }
        }

        /**
         * «Слушать в:» для скачанной музыки. Установленные приложения — первыми и выделены цветом,
         * дальше «Все сервисы» — полный экран «Где послушать».
         */
        private fun bindServices(job: Job) {
            val show = job.status == Status.DONE && job.kind == Kind.MUSIC
            servicesRow.isVisible = show
            servicesRow.removeAllViews()
            if (!show) return
            servicesRow.addView(TextView(this@MainActivity).apply {
                text = "Слушать в:"
                setTextAppearance(com.google.android.material.R.style.TextAppearance_Material3_LabelMedium)
                setTextColor(MaterialColors.getColor(this, M.attr.colorOnSurfaceVariant))
                setPadding(0, dp(9), dp(2), 0)
            })
            installedOrder().take(4).forEach { s ->
                servicesRow.addView(servicePill(s.short, s, highlighted = true) { openIn(job, s) })
            }
            servicesRow.addView(servicePill("Ещё", null, highlighted = false) {
                if (job.files.size > 1) TransferActivity.open(this@MainActivity, job.url, job.hint)
                else TransferActivity.openTrack(this@MainActivity, job.track(), job.url.takeIf { Music.isMusic(it) || Service.of(it) != null })
            })
        }
    }

    /** Мой сервис первым, потом остальные установленные. Считаем один раз при открытии экрана. */
    private var installedCache: List<Service>? = null
    private fun installedOrder(): List<Service> = installedCache ?: run {
        val mine = Installed.preferred(this)
        Installed.all(this).filter { it in Transfer.ORDER }.sortedBy { if (it == mine) 0 else Transfer.ORDER.indexOf(it) + 1 }
    }.also { installedCache = it }

    /** Кнопка-«таблетка» сервиса: кружок с буквой и название. Установленные — с заливкой. */
    private fun servicePill(label: String, service: Service?, highlighted: Boolean, onClick: () -> Unit): View {
        val pill = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = android.view.Gravity.CENTER_VERTICAL
            setPadding(dp(if (service != null) 4 else 12), dp(4), dp(12), dp(4))
            background = android.graphics.drawable.GradientDrawable().apply {
                cornerRadius = dp(18).toFloat()
                if (highlighted) setColor(MaterialColors.getColor(this@MainActivity, M.attr.colorSecondaryContainer, 0))
                else setStroke(dp(1), MaterialColors.getColor(this@MainActivity, M.attr.colorOutline, 0))
            }
            layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, dp(36))
            isClickable = true
            foreground = getDrawable(android.R.drawable.list_selector_background)
            setOnClickListener { onClick() }
        }
        if (service != null) {
            pill.addView(TextView(this).apply {
                layoutParams = LinearLayout.LayoutParams(dp(28), dp(28)).apply { marginEnd = dp(6) }
                gravity = android.view.Gravity.CENTER
                textSize = 11f
                setTypeface(typeface, android.graphics.Typeface.BOLD)
                setBackgroundResource(R.drawable.bg_circle)
                showBadge(service.badge)
            })
        }
        pill.addView(TextView(this).apply {
            text = label
            setTextAppearance(com.google.android.material.R.style.TextAppearance_Material3_LabelLarge)
            setTextColor(MaterialColors.getColor(this, if (highlighted) M.attr.colorOnSecondaryContainer else M.attr.colorOnSurface))
        })
        return pill
    }

    /**
     * Открыть песню из загрузок в сервисе. Ссылку ищем один раз (точную, если сервис позволяет)
     * и запоминаем в загрузке, второй раз открывается сразу.
     */
    private fun openIn(job: Job, s: Service) {
        job.links[s.name]?.let { Installed.open(this, s, it); return }
        if (job.files.size > 1) { // альбом — открываем поиск альбома в сервисе
            Installed.open(this, s, s.searchUrl(job.album ?: job.title))
            return
        }
        if (Service.of(job.url) == s) { // скачано из этого же сервиса — исходная ссылка
            Installed.open(this, s, job.url)
            return
        }
        snack("Ищу в ${s.inTitle}…")
        thread {
            val t = runCatching { Transfer.enrich(job.track()) }.getOrDefault(job.track())
            val link = Transfer.find(s, t, Downloader::youtubeId)
            runOnUiThread {
                Jobs.update(job.id, save = true) { links = links + (s.name to link.url) }
                if (!isDestroyed) Installed.open(this, s, link.url)
            }
        }
    }

    /**
     * Играть в приложении. Музыка: очередь — вся готовая музыка в текущем списке, начиная с этой.
     * Видео: только это видео, сразу на весь экран.
     */
    private fun play(job: Job) {
        if (job.status == Status.RUNNING) {
            // Альбом: играем уже скачанные треки. Одиночный трек/видео: поток из интернета.
            if (job.files.isNotEmpty()) Playback.play(this, job.files.map { it to job.album }, 0)
            else Playback.playStream(this, job)
            return
        }
        if (job.kind == Kind.VIDEO) {
            Playback.play(this, job.files.map { it to null }, 0)
            return
        }
        val music = adapter.items.filter { it.status == Status.DONE && it.kind == Kind.MUSIC }
        val queue = music.flatMap { j -> j.files.map { it to j.album } }
        val start = music.takeWhile { it.id != job.id }.sumOf { it.files.size }
        Playback.play(this, queue, start)
    }

    // ---------------- Мини-проигрыватель ----------------

    private fun setupMiniPlayer() {
        mini = findViewById(R.id.miniPlayer)
        mini.clipToOutline = true
        findViewById<RingProgressView>(R.id.miniRing).apply {
            stroke = dp(2).toFloat(); knob = false; seekable = false
            trackColor(androidx.core.content.ContextCompat.getColor(this@MainActivity, R.color.line))
        }
        mini.setOnClickListener { startActivity(Intent(this, NowPlayingActivity::class.java)) }
        findViewById<View>(R.id.miniPlay).setOnClickListener {
            controller?.let { if (it.isPlaying) it.pause() else it.play() }
        }
        findViewById<View>(R.id.miniNext).setOnClickListener { Playback.next(this) }
        // Свайп вправо по мини-плееру — следующая песня списка, влево — предыдущая.
        Swipe.attach(mini, onRight = { Playback.next(this) }, onLeft = { Playback.previous(this) })
    }

    private fun updateMini() {
        val c = controller
        val has = c != null && c.mediaItemCount > 0 && c.playbackState != androidx.media3.common.Player.STATE_IDLE
        mini.isVisible = has
        if (!has || c == null) return
        val m = c.mediaMetadata
        findViewById<TextView>(R.id.miniTitle).text = m.title ?: "Без названия"
        findViewById<TextView>(R.id.miniArtist).text = listOfNotNull(m.artist, m.albumTitle).joinToString(" · ")
        findViewById<MaterialButton>(R.id.miniPlay).apply {
            setIconResource(if (c.isPlaying) R.drawable.ic_pause else R.drawable.ic_play_arrow)
            contentDescription = if (c.isPlaying) "Пауза" else "Играть"
        }
        findViewById<View>(R.id.miniNext).isVisible = Playback.hasNext(c)
        val cover = findViewById<com.google.android.material.imageview.ShapeableImageView>(R.id.miniCover)
        val art = m.artworkData?.let { android.graphics.BitmapFactory.decodeByteArray(it, 0, it.size) }
        val url = m.artworkUri?.toString()
        when {
            art != null -> { cover.setImageBitmap(art); miniGlow(art) }
            url != null && url != miniCoverUrl -> {
                miniCoverUrl = url
                Images.into(cover, url, R.drawable.ph_cover)
                Images.load(url) { b -> if (miniCoverUrl == url) miniGlow(b) }
            }
            url == null -> { cover.setImageResource(R.drawable.ph_cover); miniCoverUrl = null; miniGlow(null) }
        }
        updateMiniProgress()
    }

    private var miniCoverUrl: String? = null

    /** Слева в мини-плеере — мягкое свечение в цвет обложки. */
    private fun miniGlow(b: android.graphics.Bitmap?) {
        val glow = findViewById<View>(R.id.miniGlow)
        if (b == null) { glow.background = null; return }
        val c = androidx.core.graphics.ColorUtils.setAlphaComponent(Images.dominant(b), 0x80)
        glow.background = android.graphics.drawable.GradientDrawable().apply {
            gradientType = android.graphics.drawable.GradientDrawable.RADIAL_GRADIENT
            gradientRadius = dp(110).toFloat()
            setGradientCenter(0.15f, 0.5f)
            colors = intArrayOf(c, android.graphics.Color.TRANSPARENT)
        }
    }

    private fun updateMiniProgress() {
        val c = controller ?: return
        val d = Playback.duration(c)
        val p = if (d > 0) Playback.position(c).toFloat() / d else 0f
        findViewById<RingProgressView>(R.id.miniRing).progress = p
        findViewById<AuraProgressLine>(R.id.miniProgressLine).progress = p
    }

    private fun open(job: Job) {
        val f = job.files.firstOrNull() ?: return
        try {
            startActivity(Intent(Intent.ACTION_VIEW).setDataAndType(Uri.parse(f.uri), f.mime).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION))
        } catch (e: Exception) {
            snack("Нет приложения, чтобы открыть этот файл")
        }
    }

    private fun share(job: Job) {
        val uris = ArrayList(job.files.map { Uri.parse(it.uri) })
        if (uris.isEmpty()) return
        val mime = job.files.map { it.mime }.distinct().singleOrNull() ?: "*/*"
        val send = if (uris.size == 1) {
            Intent(Intent.ACTION_SEND).putExtra(Intent.EXTRA_STREAM, uris.first())
        } else {
            Intent(Intent.ACTION_SEND_MULTIPLE).putParcelableArrayListExtra(Intent.EXTRA_STREAM, uris)
        }
        send.setType(mime).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        startActivity(Intent.createChooser(send, "Поделиться"))
    }

    private fun confirmDelete(job: Job) {
        val what = if (job.files.size == 1) "«${job.files.first().name}»" else "${job.files.size} файл(ов)"
        MaterialAlertDialogBuilder(this)
            .setTitle("Удалить с телефона?")
            .setMessage("Файл $what будет удалён из «Загрузок».")
            .setIcon(R.drawable.ic_delete_outline)
            .setPositiveButton("Удалить") { _, _ ->
                val n = Jobs.deleteFiles(this, job)
                snack(if (n < job.files.size) "Часть файлов уже удалена или недоступна" else "Удалено")
            }
            .setNegativeButton("Отмена", null)
            .show()
    }

    // ---------------- Настройки ----------------

    private fun engineVersion() = runCatching { YoutubeDL.getInstance().versionName(this) }.getOrNull() ?: "встроенная версия"

    private fun setupSettingsPage() {
        sites = findViewById(R.id.sites)
        refreshMusicSettings()
        findViewById<View>(R.id.importCookies).setOnClickListener { cookiesHelp() }
        findViewById<View>(R.id.logoutAll).setOnClickListener {
            MaterialAlertDialogBuilder(this)
                .setTitle("Выйти из всех аккаунтов?")
                .setMessage("Сохранённые входы будут удалены с этого телефона.")
                .setPositiveButton("Выйти") { _, _ -> Cookies.clear(this); refreshSites() }
                .setNegativeButton("Отмена", null)
                .show()
        }
        findViewById<TextView>(R.id.folderText).text = "Загрузки / ${Storage.FOLDER}\nАльбомы — в отдельных папках"
        val info = packageManager.getPackageInfo(packageName, 0)
        findViewById<TextView>(R.id.versionText).text = "SoundAura ${info.versionName}"
        val engine = findViewById<TextView>(R.id.engineText)
        engine.text = "Движок yt-dlp: ${engineVersion()}. Обновляется сам раз в неделю."
        findViewById<MaterialButton>(R.id.checkSources).setOnClickListener { runDiagnostics() }
        findViewById<MaterialButton>(R.id.updateEngine).setOnClickListener { btn ->
            btn.isEnabled = false
            snack("Обновляю движок…")
            thread {
                val result = runCatching {
                    App.awaitReady()
                    YoutubeDL.getInstance().updateYoutubeDL(this, YoutubeDL.UpdateChannel.STABLE)
                        .also { YtdlpDaemon.restart() }
                }
                runOnUiThread {
                    btn.isEnabled = true
                    snack(
                        when {
                            result.isFailure -> "Не удалось обновить: проверьте интернет"
                            result.getOrNull() == YoutubeDL.UpdateStatus.ALREADY_UP_TO_DATE -> "Уже последняя версия"
                            else -> "Движок обновлён"
                        }
                    )
                    engine.text = "Движок yt-dlp: ${engineVersion()}. Обновляется сам раз в неделю."
                }
            }
        }
    }

    private fun refreshMusicSettings() {
        val appearance = findViewById<LinearLayout>(R.id.appearanceSettings)
        appearance.removeAllViews()
        val theme = Settings.theme(this)
        settingRow(appearance, R.drawable.ic_upload_file, "Перенести медиатеку", "Spotify, Яндекс, Apple…",
            "Плейлисты и любимое из других сервисов — по ссылке или файлом") { ImportActivity.open(this) }
        settingRow(appearance, R.drawable.ic_equalizer, "Эквалайзер",
            if (AudioFx.enabled(this)) "Включён · ${AudioFx.preset(this)}" else "Выключен",
            "Пресеты, своя кривая, усиление баса и объём") { startActivity(Intent(this, EqualizerActivity::class.java)) }
        val smoke = Settings.coverSmoke(this)
        settingRow(appearance, R.drawable.ic_headphones, "Дым вокруг обложки", if (smoke) "Включён" else "Выключен",
            "В плеере вокруг обложки плывёт цветной дым её же цветов, пока играет музыка") { Settings.setCoverSmoke(this, !smoke); refreshMusicSettings() }
        val ly = Settings.lyricsInPlayer(this)
        settingRow(appearance, R.drawable.ic_lyrics, "Текст песни в плеере", if (ly) "Показывать" else "Скрыт",
            "Строки идут вместе с музыкой; нажмите — весь текст") { Settings.setLyricsInPlayer(this, !ly); refreshMusicSettings() }
        settingRow(appearance, R.drawable.ic_send, "Музыка из Telegram", when {
            !Telegram.hasKeys(this) -> "Не подключён"
            Telegram.ready -> "Подключён" + (Telegram.me.takeIf { it.isNotBlank() }?.let { " · $it" } ?: "")
            else -> "Нужно закончить вход"
        }, "Свой аккаунт Telegram как источник: встроенный поиск музыки, часто 320 kbps") { TelegramActivity.open(this) }
        settingRow(appearance, R.drawable.ic_play_arrow, "Музыка из ВК", when {
            !VkSource.loggedIn -> "Не подключён"
            VkSource.available -> "Подключён"
            else -> "Пауза — ВК просил подождать"
        }, "Свой аккаунт ВКонтакте как источник: почти вся русская музыка, вход через встроенный браузер") { VkLoginActivity.open(this) }
        settingRow(appearance, R.drawable.ic_upload_file, "Скопировать журнал", "Что искали и почему не включилось",
            "Ответы площадок и ошибки плеера — в буфер обмена; вставьте в чат, если песня не заиграла") { AppLog.copy(this) }
        val sm = Settings.startMode(this)
        settingRow(appearance, R.drawable.ic_play_arrow, "Начало песни", sm.label, sm.hint) {
            choose("Начало песни", Settings.StartMode.entries.map { "${it.label} — ${it.hint}" }, sm.ordinal) {
                Settings.setStartMode(this, Settings.StartMode.entries[it]); refreshMusicSettings()
            }
        }
        val wm = Settings.warm(this)
        settingRow(appearance, R.drawable.ic_download, "Мгновенный старт",
            wm.label + " · готово ${HeadCache.count}" + (Warm.left.takeIf { it > 0 }?.let { ", осталось $it" } ?: ""), wm.hint) {
            choose("Мгновенный старт", Settings.Warm.entries.map { "${it.label} — ${it.hint}" }, wm.ordinal) {
                Settings.setWarm(this, Settings.Warm.entries[it]); Warm.start(this); refreshMusicSettings()
            }
        }
        val jm = Settings.joinMode(this)
        settingRow(appearance, R.drawable.ic_skip_next, "Переход на полную версию", jm.label, jm.hint) {
            choose("Переход с фрагмента на полную", Settings.JoinMode.entries.map { "${it.label} — ${it.hint}" }, jm.ordinal) {
                Settings.setJoinMode(this, Settings.JoinMode.entries[it]); refreshMusicSettings()
            }
        }
        val ps = Settings.playerStyle(this)
        settingRow(appearance, R.drawable.ic_headphones, "Вид плеера", ps.label, ps.hint) {
            choose("Вид плеера", Settings.PlayerStyle.entries.map { "${it.label} — ${it.hint}" }, ps.ordinal) {
                Settings.setPlayerStyle(this, Settings.PlayerStyle.entries[it]); refreshMusicSettings()
            }
        }
        settingRow(appearance, R.drawable.ic_settings, "Тема", theme.label, "Тёмная бережёт глаза и батарею на AMOLED-экранах") {
            choose("Тема", Settings.Theme.entries.map { it.label }, theme.ordinal) {
                Settings.setTheme(this, Settings.Theme.entries[it])
            }
        }

        val box = findViewById<LinearLayout>(R.id.musicSettings)
        box.removeAllViews()
        fun row(icon: Int, title: String, value: String, hint: String, onClick: () -> Unit) = settingRow(box, icon, title, value, hint, onClick)
        val installed = Installed.all(this).toSet()
        val mine = Settings.myService(this)
        val auto = Installed.preferred(this)
        row(
            R.drawable.ic_music_note, "Мой сервис",
            mine?.title ?: auto?.let { "Авто: ${it.title}" } ?: "Авто",
            "Его ссылка — первой, с кнопкой «Открыть в …»",
        ) { chooseMyService(installed) }
        val q = Settings.quality(this)
        row(R.drawable.ic_download, "Качество музыки", q.label, q.hint) {
            choose("Качество музыки", Settings.Quality.entries.map { "${it.label} — ${it.hint}" }, q.ordinal) {
                Settings.setQuality(this, Settings.Quality.entries[it]); refreshMusicSettings()
            }
        }
        val saveLiked = Settings.saveLiked(this)
        row(R.drawable.ic_favorite, "Сохранять любимое на телефон", if (saveLiked) "Да" else "Нет",
            "♥ — песня скачивается и играет без интернета") {
            Settings.setSaveLiked(this, !saveLiked); refreshMusicSettings()
        }
        val radio = Settings.radio(this)
        row(R.drawable.ic_queue_music, "Радио после очереди", if (radio) "Да" else "Нет",
            "Когда песни закончились — дальше играет похожая музыка") {
            Settings.setRadio(this, !radio); refreshMusicSettings()
        }
        LibrarySync.countAsync()
        row(R.drawable.ic_download, "Медиатека на телефоне", LibrarySync.status(this),
            "Любимые песни скачиваются целиком и играют с телефона: сразу, без сети и без пауз") { syncDialog() }
        val cacheMb = Settings.cacheLimitMb(this)
        val used = MediaCache.sizeBytes / 1024 / 1024
        row(R.drawable.ic_schedule, "Память прослушанного",
            if (cacheMb == 0) "Выключена" else "До ${if (cacheMb >= 1024) "${cacheMb / 1024} ГБ" else "$cacheMb МБ"} · занято $used МБ",
            "Прослушанное включается снова мгновенно и без интернета") {
            val labels = Settings.CACHE_OPTIONS.map { if (it == 0) "Не запоминать" else if (it >= 1024) "${it / 1024} ГБ" else "$it МБ" } + "Очистить память сейчас"
            choose("Память прослушанного", labels, Settings.CACHE_OPTIONS.indexOf(cacheMb).coerceAtLeast(0)) { i ->
                if (i == Settings.CACHE_OPTIONS.size) { MediaCache.clear(); snack("Память очищена") }
                else Settings.setCacheLimitMb(this, Settings.CACHE_OPTIONS[i])
                refreshMusicSettings()
            }
        }
        val src = Settings.sourceOrder(this)
        row(R.drawable.ic_link, "Приоритет источников", src.label, src.hint) {
            choose("Приоритет источников", Settings.SourceOrder.entries.map { "${it.label} — ${it.hint}" }, src.ordinal) {
                Settings.setSourceOrder(this, Settings.SourceOrder.entries[it]); refreshMusicSettings()
            }
        }
    }

    private fun settingRow(box: LinearLayout, icon: Int, title: String, value: String, hint: String, onClick: () -> Unit) {
        val v = layoutInflater.inflate(R.layout.item_setting, box, false)
        v.findViewById<ImageView>(R.id.icon).setImageResource(icon)
        v.findViewById<TextView>(R.id.title).text = title
        v.findViewById<TextView>(R.id.value).text = value
        v.findViewById<TextView>(R.id.hint).text = hint
        v.setOnClickListener { onClick() }
        box.addView(v)
    }

    private fun chooseMyService(installed: Set<Service>) {
        // Установленные — первыми и с пометкой.
        val options = listOf<Service?>(null) + Transfer.ORDER.sortedBy { if (it in installed) 0 else 1 }
        val labels = options.map { s ->
            when {
                s == null -> "Авто — первый установленный"
                s in installed -> "${s.title} · установлен"
                else -> s.title
            }
        }
        choose("Мой музыкальный сервис", labels, options.indexOf(Settings.myService(this)).coerceAtLeast(0)) {
            Settings.setMyService(this, options[it]); refreshMusicSettings()
        }
    }

    private fun choose(title: String, items: List<String>, checked: Int, onPick: (Int) -> Unit) {
        MaterialAlertDialogBuilder(this)
            .setTitle(title)
            .setSingleChoiceItems(items.toTypedArray(), checked) { d, which -> onPick(which); d.dismiss() }
            .setNegativeButton("Отмена", null)
            .show()
    }

    private fun runDiagnostics() {
        val text = TextView(this).apply {
            setPadding(dp(24), dp(12), dp(24), dp(8))
            setTextIsSelectable(true)
            text = "Проверяю на этом телефоне каждое звено: сеть, поиск, ссылку и сам звук… (1–3 минуты)"
        }
        MaterialAlertDialogBuilder(this)
            .setTitle("Проверка и журнал")
            .setView(android.widget.ScrollView(this).apply { addView(text) })
            .setPositiveButton("Закрыть", null)
            .setNeutralButton("Скопировать журнал") { _, _ -> AppLog.copy(this) }
            .show()
        val lines = mutableListOf<String>()
        thread {
            Diagnostics.run(this) { l -> runOnUiThread { lines += l; text.text = lines.joinToString("\n") } }
        }
    }

    /** «Медиатека на телефоне»: включить/выключить, сеть, место. */
    fun syncDialog() {
        val sy = Settings.sync(this)
        val fav = Library.favorites.size
        val needGb = "%.0f".format(fav * 6 / 1024.0 + 0.5)
        choose("Медиатека на телефоне · ${LibrarySync.status(this)}",
            Settings.Sync.entries.map { "${it.label} — ${it.hint}" }, sy.ordinal) { i ->
            val m = Settings.Sync.entries[i]
            Settings.setSync(this, m)
            if (m != Settings.Sync.OFF) {
                // Места должно хватать на всю медиатеку: поднимаем лимит памяти, если он меньше нужного.
                val needMb = fav * 7
                val limit = Settings.CACHE_OPTIONS.firstOrNull { it >= needMb } ?: Settings.CACHE_OPTIONS.last()
                if (Settings.cacheLimitMb(this) < limit) Settings.setCacheLimitMb(this, limit)
                LibrarySync.start(this)
                snack("Скачиваю медиатеку: $fav песен, примерно $needGb ГБ. Идёт, пока приложение открыто или играет музыка.")
            }
            refreshMusicSettings()
        }
    }

    private fun refreshSites() {
        if (!::sites.isInitialized) return
        pool {
            val logged = runCatching { Cookies.loggedInSites(this).toSet() }.getOrDefault(emptySet())
            runOnUiThread {
                if (isDestroyed || !::sites.isInitialized) return@runOnUiThread
                sites.removeAllViews()
                Cookies.SITES.forEachIndexed { i, site ->
                    val row = layoutInflater.inflate(R.layout.item_site, sites, false)
                    row.findViewById<TextView>(R.id.badge).showBadge(siteBadge(site.name))
                    row.findViewById<TextView>(R.id.name).text = site.name
                    val ok = site.name in logged
                    row.findViewById<TextView>(R.id.state).text = if (ok) "Вход выполнен" else "Нажмите, чтобы войти"
                    row.findViewById<ImageView>(R.id.stateIcon).apply {
                        setImageResource(if (ok) R.drawable.ic_check_circle else R.drawable.ic_person_outline)
                        imageTintList = ColorStateList.valueOf(MaterialColors.getColor(this, if (ok) M.attr.colorPrimary else M.attr.colorOnSurfaceVariant))
                    }
                    row.setOnClickListener {
                        startActivity(Intent(this, LoginActivity::class.java).putExtra(LoginActivity.EXTRA_SITE, i))
                    }
                    sites.addView(row)
                }
            }
        }
    }

    private fun cookiesHelp() {
        MaterialAlertDialogBuilder(this)
            .setTitle("Файл cookies.txt")
            .setIcon(R.drawable.ic_upload_file)
            .setMessage(
                "Если Google не пускает во встроенном окне входа:\n\n" +
                    "1. Установите Firefox и дополнение «Get cookies.txt LOCALLY».\n" +
                    "2. Войдите на сайт в Firefox (можно через Google).\n" +
                    "3. Нажмите значок дополнения → Export.\n" +
                    "4. Выберите сохранённый файл.\n\n" +
                    "Потом удалите файл из «Загрузок»: по нему можно войти в ваш аккаунт."
            )
            .setPositiveButton("Выбрать файл") { _, _ -> pickCookies.launch(arrayOf("text/*")) }
            .setNegativeButton("Отмена", null)
            .show()
    }

    // ---------------- Общее ----------------

    private fun snack(text: String) {
        Snackbar.make(nav, text, Snackbar.LENGTH_SHORT).setAnchorView(nav).show()
    }

    private fun askNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1)
        }
    }

    companion object {
        /** Нижнее меню — одно на всё приложение (оно же показывается на других экранах, см. MiniBar). */
        fun navItems() = listOf(
            PillNav.Item(R.id.nav_music, "Музыка", R.drawable.ic_headphones),
            PillNav.Item(R.id.nav_library, "Медиатека", R.drawable.ic_library_music),
            PillNav.Item(R.id.nav_download, "Ссылка", R.drawable.ic_download),
            PillNav.Item(R.id.nav_jobs, "Загрузки", R.drawable.ic_folder_open),
            PillNav.Item(R.id.nav_settings, "Настройки", R.drawable.ic_settings),
        )
        const val EXTRA_PAGE = "page_tab"
        /** Вкладка, открытая на главном экране сейчас. */
        @Volatile var currentPage = R.id.nav_music

        const val EXTRA_SHOW_JOBS = "showJobs"
        const val ACTION_PASTE_DOWNLOAD = "com.zagruzchik.app.PASTE_DOWNLOAD"
        const val ACTION_PASTE_LINKS = "com.zagruzchik.app.PASTE_LINKS"
    }
}
