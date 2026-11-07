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
import com.google.android.material.bottomnavigation.BottomNavigationView
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
    private lateinit var nav: BottomNavigationView
    private lateinit var pages: Map<Int, View>

    // Вкладка «Скачать»
    private lateinit var inputLayout: TextInputLayout
    private lateinit var input: TextInputEditText
    private lateinit var formats: MaterialButtonToggleGroup
    private lateinit var transferBtn: MaterialButton
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
    private lateinit var mini: MaterialCardView
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
        if (job == null) refreshJobs() else adapter.update(job)
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
        setContentView(R.layout.activity_main)
        toolbar = findViewById(R.id.toolbar)
        nav = findViewById(R.id.bottomNav)
        pages = mapOf(
            R.id.nav_download to findViewById(R.id.pageDownload),
            R.id.nav_jobs to findViewById(R.id.pageJobs),
            R.id.nav_settings to findViewById(R.id.pageSettings),
        )
        nav.setOnItemSelectedListener { applyPage(it.itemId); true }
        toolbar.setOnMenuItemClickListener {
            if (it.itemId == R.id.action_clear) Jobs.clearFinished()
            true
        }

        setupDownloadPage()
        setupJobsPage()
        setupSettingsPage()
        setupMiniPlayer()

        showPage(savedInstanceState?.getInt("page") ?: R.id.nav_download)
        handleIntent(intent)
        if (savedInstanceState == null) askNotificationPermission()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        outState.putInt("page", nav.selectedItemId)
    }

    override fun onStart() {
        super.onStart()
        installedCache = null // могли поставить/удалить приложение или сменить «мой сервис»
        Jobs.listen(listener)
        refreshJobs()
        refreshSummary()
        Playback.controller(this) { c ->
            controller = c
            c.addListener(playerListener)
            updateMini()
        }
        mini.post(miniTicker)
        refreshSites()
    }

    override fun onStop() {
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
        when (intent?.action) {
            ACTION_PASTE_DOWNLOAD, ACTION_PASTE_LINKS -> pendingClipAction = intent.action
        }
        intent?.getStringExtra(DownloadService.EXTRA_URL)?.let {
            input.setText(it)
            showPage(R.id.nav_download)
        }
        if (intent?.getBooleanExtra(EXTRA_SHOW_JOBS, false) == true) showPage(R.id.nav_jobs)
    }

    /** Переключить вкладку из кода: нижняя панель сама вызовет [applyPage]. */
    private fun showPage(id: Int) {
        if (nav.selectedItemId != id) nav.selectedItemId = id else applyPage(id)
    }

    /** Показать содержимое вкладки. Вызывается нижней панелью при выборе вкладки. */
    private fun applyPage(id: Int) {
        pages.forEach { (k, v) -> v.isVisible = k == id }
        toolbar.title = when (id) {
            R.id.nav_jobs -> "Загрузки"
            R.id.nav_settings -> "Настройки"
            else -> "Загрузчик"
        }
        toolbar.menu.clear()
        if (id == R.id.nav_jobs) toolbar.inflateMenu(R.menu.jobs)
        refreshSummary()
    }

    // ---------------- Скачать ----------------

    private fun setupDownloadPage() {
        inputLayout = findViewById(R.id.inputLayout)
        input = findViewById(R.id.input)
        formats = findViewById(R.id.formats)
        transferBtn = findViewById(R.id.transfer)
        activeCard = findViewById(R.id.activeCard)
        activeTitle = findViewById(R.id.activeTitle)
        activeProgress = findViewById(R.id.activeProgress)

        FormatPicker.setup(formats, null)
        input.doAfterTextChanged { onLinkChanged() }
        input.setOnEditorActionListener { _, action, _ ->
            if (action == EditorInfo.IME_ACTION_GO) download()
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

    private fun onLinkChanged() {
        val url = Links.extract(input.text.toString())
        inputLayout.error = null
        inputLayout.helperText = when {
            input.text.isNullOrBlank() -> "Вставьте ссылку или нажмите «Поделиться» в любом приложении"
            url == null -> "Это не похоже на ссылку"
            else -> Describe.of(url)
        }
        FormatPicker.setup(formats, url)
        transferBtn.isVisible = url != null && (Music.isMusic(url) || Service.of(url) == Service.YOUTUBE)
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
        if (input.text.isNullOrBlank()) pasteFromClipboard(force = false)
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
        val clip = getSystemService(ClipboardManager::class.java).primaryClip
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
            inputLayout.error = "Вставьте ссылку"
            return
        }
        DownloadService.enqueue(this, url, FormatPicker.selected(formats), input.text.toString())
        input.setText("")
        showPage(R.id.nav_jobs)
    }

    private fun refreshSummary() {
        val all = Jobs.all
        val active = all.filter { it.active }
        nav.getOrCreateBadge(R.id.nav_jobs).apply {
            isVisible = active.isNotEmpty()
            number = active.size
        }
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

        val shown = byKind.filter { siteFilter == null || it.site == siteFilter }
        adapter.submit(shown)
        playAll.isVisible = kindFilter == Kind.MUSIC && shown.any { it.status == Status.DONE }
        jobsEmpty.isVisible = shown.isEmpty()
        findViewById<TextView>(R.id.emptyTitle).text = when {
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
        mini.setOnClickListener { startActivity(Intent(this, PlayerActivity::class.java)) }
        findViewById<View>(R.id.miniPlay).setOnClickListener {
            controller?.let { if (it.isPlaying) it.pause() else it.play() }
        }
        findViewById<View>(R.id.miniNext).setOnClickListener { controller?.seekToNextMediaItem() }
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
        findViewById<View>(R.id.miniNext).isVisible = c.hasNextMediaItem()
        val cover = findViewById<com.google.android.material.imageview.ShapeableImageView>(R.id.miniCover)
        val art = m.artworkData?.let { android.graphics.BitmapFactory.decodeByteArray(it, 0, it.size) }
        if (art != null) cover.setImageBitmap(art) else cover.setImageResource(R.drawable.ic_music_note)
        updateMiniProgress()
    }

    private fun updateMiniProgress() {
        val c = controller ?: return
        val d = c.duration
        val p = findViewById<LinearProgressIndicator>(R.id.miniProgress)
        if (d > 0) p.setProgressCompat((c.currentPosition * 1000 / d).toInt(), false) else p.progress = 0
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
        findViewById<TextView>(R.id.versionText).text = "Загрузчик ${info.versionName}"
        val engine = findViewById<TextView>(R.id.engineText)
        engine.text = "Движок yt-dlp: ${engineVersion()}. Обновляется сам раз в неделю."
        findViewById<MaterialButton>(R.id.updateEngine).setOnClickListener { btn ->
            btn.isEnabled = false
            snack("Обновляю движок…")
            thread {
                val result = runCatching {
                    App.awaitReady()
                    YoutubeDL.getInstance().updateYoutubeDL(this, YoutubeDL.UpdateChannel.STABLE)
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
        val box = findViewById<LinearLayout>(R.id.musicSettings)
        box.removeAllViews()
        fun row(icon: Int, title: String, value: String, hint: String, onClick: () -> Unit) {
            val v = layoutInflater.inflate(R.layout.item_setting, box, false)
            v.findViewById<ImageView>(R.id.icon).setImageResource(icon)
            v.findViewById<TextView>(R.id.title).text = title
            v.findViewById<TextView>(R.id.value).text = value
            v.findViewById<TextView>(R.id.hint).text = hint
            v.setOnClickListener { onClick() }
            box.addView(v)
        }
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
        val src = Settings.sourceOrder(this)
        row(R.drawable.ic_link, "Где искать песни", src.label, src.hint) {
            choose("Где искать песни", Settings.SourceOrder.entries.map { "${it.label} — ${it.hint}" }, src.ordinal) {
                Settings.setSourceOrder(this, Settings.SourceOrder.entries[it]); refreshMusicSettings()
            }
        }
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

    private fun refreshSites() {
        val logged = Cookies.loggedInSites(this).toSet()
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
        const val EXTRA_SHOW_JOBS = "showJobs"
        const val ACTION_PASTE_DOWNLOAD = "com.zagruzchik.app.PASTE_DOWNLOAD"
        const val ACTION_PASTE_LINKS = "com.zagruzchik.app.PASTE_LINKS"
    }
}
