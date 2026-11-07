package com.zagruzchik.app

import android.Manifest
import android.app.Activity
import android.app.AlertDialog
import android.content.ClipboardManager
import android.content.Intent
import android.content.pm.PackageManager
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.text.InputType
import android.text.TextUtils
import android.view.Gravity
import android.view.View
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast

class MainActivity : Activity() {

    private lateinit var input: EditText
    private lateinit var accounts: TextView
    private lateinit var jobsBox: LinearLayout
    private lateinit var clearFinished: TextView
    private lateinit var empty: TextView
    private val views = mutableMapOf<String, JobView>()
    private val prefs by lazy { getSharedPreferences("app", MODE_PRIVATE) }

    private val listener: (Job?) -> Unit = { job ->
        if (job == null) rebuildJobs() else views[job.id]?.bind(job) ?: rebuildJobs()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        title = "Загрузчик"

        input = EditText(this).apply {
            hint = "Вставьте ссылку"
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI
            setSingleLine(true)
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }
        val inputRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            addView(input)
            addView(action("✕", "Очистить поле") { clearInput() })
            addView(action("Вставить") { pasteFromClipboard(force = true) })
        }

        accounts = text("", 14f, muted = true)
        jobsBox = column(0)
        empty = text("Здесь появятся ваши загрузки.", 14f, muted = true)
        clearFinished = action("Очистить готовые") { Jobs.clearFinished() }
        val jobsHeader = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            addView(text("Загрузки", 20f, bold = true).apply {
                layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            })
            addView(clearFinished)
        }

        val root = column().apply {
            addView(text("Скачать по ссылке", 22f, bold = true))
            addView(text("В любом приложении нажмите «Поделиться» → «Загрузчик». Или вставьте ссылку сюда:", 15f, muted = true))
            addView(inputRow)
            Format.entries.forEach { f -> addView(button(f.label, primary = f == Format.BEST) { download(f) }) }
            addView(button("🔗 Ссылки в других сервисах", primary = false) { transfer() })
            addView(text("Файлы сохраняются в «Загрузки/${Storage.FOLDER}».", 13f, muted = true))

            addView(spacer(24))
            addView(jobsHeader)
            addView(empty)
            addView(jobsBox)

            addView(spacer(28))
            addView(text("Аккаунты", 20f, bold = true))
            addView(text("Нужно для Instagram, видео 18+ и приватных публикаций.", 14f, muted = true))
            addView(accounts)
            addView(button("Войти в аккаунт", primary = false) { chooseSite() })
            addView(button("Загрузить файл cookies.txt", primary = false) { pickCookiesFile() })
            addView(button("Выйти из всех аккаунтов", primary = false) { logoutAll() })

            addView(spacer(28))
            addView(text("Видео: YouTube, TikTok, VK, X, Instagram, Snapchat, Яндекс, Дзен, Rutube, файлы Discord. Музыка: Spotify, Яндекс Музыка, Apple Music, Deezer, SoundCloud, VK. И ещё ~1800 сайтов.", 13f, muted = true))
        }
        setContentView(ScrollView(this).apply { addView(root) })

        handleIntent(intent)
        askNotificationPermission()
    }

    override fun onStart() {
        super.onStart()
        Jobs.listen(listener)
        rebuildJobs()
    }

    override fun onStop() {
        Jobs.unlisten(listener)
        super.onStop()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleIntent(intent)
    }

    override fun onResume() {
        super.onResume()
        val sites = Cookies.loggedInSites(this)
        accounts.text = if (sites.isEmpty()) "Вход не выполнен." else "Выполнен вход: ${sites.joinToString(", ")}"
    }

    // Android разрешает читать буфер обмена, только когда окно в фокусе.
    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus && input.text.isBlank()) pasteFromClipboard(force = false)
    }

    private fun clipboardUrl(): String? {
        val clip = getSystemService(ClipboardManager::class.java).primaryClip
        val text = clip?.takeIf { it.itemCount > 0 }?.getItemAt(0)?.coerceToText(this)?.toString()
        return Links.extract(text)
    }

    /** Сам подставляет только новые ссылки: уже скачанные и стёртые крестиком — не подставляет. */
    private fun pasteFromClipboard(force: Boolean) {
        val url = clipboardUrl()
        if (url == null) {
            if (force) Toast.makeText(this, "В буфере обмена нет ссылки", Toast.LENGTH_SHORT).show()
            return
        }
        if (!force && (url == prefs.getString("dismissed", null) || Jobs.all.any { it.url == url })) return
        input.setText(url)
        input.setSelection(url.length)
    }

    private fun clearInput() {
        Links.extract(input.text.toString())?.let { prefs.edit().putString("dismissed", it).apply() }
        input.setText("")
    }

    private fun handleIntent(intent: Intent?) {
        intent?.getStringExtra(DownloadService.EXTRA_URL)?.let { input.setText(it) }
    }

    private fun download(format: Format) {
        val url = Links.extract(input.text.toString())
        if (url == null) {
            Toast.makeText(this, "Вставьте ссылку", Toast.LENGTH_SHORT).show()
            return
        }
        DownloadService.enqueue(this, url, format)
        input.setText("")
    }

    private fun transfer() {
        val url = Links.extract(input.text.toString())
        when {
            url == null -> Toast.makeText(this, "Вставьте ссылку на песню", Toast.LENGTH_SHORT).show()
            !Music.isMusic(url) && Service.of(url) != Service.YOUTUBE ->
                Toast.makeText(this, "Нужна ссылка на песню: Spotify, Яндекс Музыка, Apple Music, YouTube, VK, Deezer, SoundCloud", Toast.LENGTH_LONG).show()
            else -> TransferActivity.open(this, url, input.text.toString())
        }
    }

    // ---------- Список загрузок ----------

    private fun rebuildJobs() {
        val jobs = Jobs.all
        jobsBox.removeAllViews()
        views.clear()
        for (job in jobs) {
            val v = JobView()
            v.bind(job)
            views[job.id] = v
            jobsBox.addView(v.root)
        }
        empty.visibility = if (jobs.isEmpty()) View.VISIBLE else View.GONE
        clearFinished.visibility = if (jobs.any { !it.active }) View.VISIBLE else View.GONE
    }

    /** Карточка одной загрузки: название, статус, прогресс и кнопки. */
    private inner class JobView {
        val title = text("", 16f, bold = true).apply {
            maxLines = 2
            ellipsize = TextUtils.TruncateAt.END
        }
        val status = text("", 13f, muted = true).apply {
            maxLines = 3
            ellipsize = TextUtils.TruncateAt.END
        }
        val bar = ProgressBar(this@MainActivity, null, android.R.attr.progressBarStyleHorizontal).apply {
            max = 1000
            progressTintList = ColorStateList.valueOf(ACCENT)
            indeterminateTintList = ColorStateList.valueOf(ACCENT)
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(8)).apply { topMargin = dp(6) }
        }
        val actions = LinearLayout(this@MainActivity).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.END
        }
        val root = column(14).apply {
            background = GradientDrawable().apply {
                cornerRadius = dp(16).toFloat()
                setStroke(dp(1), Color.argb(60, 128, 128, 128))
            }
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
                .apply { topMargin = dp(10) }
            addView(title)
            addView(status)
            addView(bar)
            addView(actions)
        }
        private var shownStatus: Status? = null

        fun bind(job: Job) {
            title.text = job.title
            val pct = "${job.progress.toInt()}%"
            status.text = when (job.status) {
                Status.QUEUED -> "${job.format.label} · в очереди"
                Status.RUNNING -> listOf(if (job.progress > 0) pct else "", job.detail).filter { it.isNotEmpty() }.joinToString(" · ").ifEmpty { "Начинаю…" }
                Status.DONE -> "Готово · ${job.detail.ifEmpty { job.format.label }}"
                Status.FAILED -> "Ошибка: ${job.error}"
                Status.CANCELLED -> "Отменено"
            }
            status.setTextColor(if (job.status == Status.FAILED) errorText() else themeColor(android.R.attr.textColorPrimary))
            status.alpha = if (job.status == Status.FAILED) 1f else 0.7f

            bar.visibility = if (job.active) View.VISIBLE else View.GONE
            bar.isIndeterminate = job.status == Status.QUEUED || job.progress <= 0f
            if (!bar.isIndeterminate) bar.setProgress((job.progress * 10).toInt(), true)

            if (shownStatus != job.status) {
                shownStatus = job.status
                actions.removeAllViews()
                when (job.status) {
                    Status.QUEUED, Status.RUNNING -> actions.addView(action("Отменить") { Jobs.cancel(job.id) })
                    Status.DONE -> {
                        actions.addView(action("Открыть") { open(job) })
                        actions.addView(action("Поделиться") { share(job) })
                        actions.addView(action("Удалить файл") { confirmDelete(job) })
                        actions.addView(action("✕", "Убрать из списка") { Jobs.remove(job.id) })
                    }
                    Status.FAILED, Status.CANCELLED -> {
                        actions.addView(action("Повторить") {
                            Jobs.remove(job.id)
                            DownloadService.enqueue(this@MainActivity, job.url, job.format, job.hint)
                        })
                        actions.addView(action("✕", "Убрать из списка") { Jobs.remove(job.id) })
                    }
                }
            }
        }
    }

    private fun open(job: Job) {
        val f = job.files.firstOrNull() ?: return
        try {
            startActivity(Intent(Intent.ACTION_VIEW).setDataAndType(Uri.parse(f.uri), f.mime).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION))
        } catch (e: Exception) {
            Toast.makeText(this, "Нет приложения, чтобы открыть этот файл", Toast.LENGTH_SHORT).show()
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
        val what = if (job.files.size == 1) "файл «${job.files.first().name}»" else "${job.files.size} файл(ов)"
        AlertDialog.Builder(this)
            .setMessage("Удалить $what с телефона?")
            .setPositiveButton("Удалить") { _, _ ->
                val n = Jobs.deleteFiles(this, job)
                if (n < job.files.size) Toast.makeText(this, "Часть файлов уже удалена или недоступна", Toast.LENGTH_SHORT).show()
            }
            .setNegativeButton("Отмена", null)
            .show()
    }

    /** Небольшая текстовая кнопка цвета акцента. */
    private fun action(label: String, description: String? = null, onClick: () -> Unit) = TextView(this).apply {
        text = label
        textSize = 14f
        setTextColor(accentText())
        setTypeface(typeface, android.graphics.Typeface.BOLD)
        setPadding(dp(10), dp(10), dp(10), dp(10))
        contentDescription = description ?: label
        isClickable = true
        isFocusable = true
        background = getDrawable(android.R.drawable.list_selector_background) // UseCompatLoadingForDrawables: minSdk 29, не нужно
        setOnClickListener { onClick() }
    }

    // ---------- Аккаунты ----------

    private fun chooseSite() {
        AlertDialog.Builder(this)
            .setTitle("Куда войти?")
            .setItems(Cookies.SITES.map { it.name }.toTypedArray()) { _, i ->
                startActivity(Intent(this, LoginActivity::class.java).putExtra(LoginActivity.EXTRA_SITE, i))
            }
            .setNegativeButton("Отмена", null)
            .show()
    }

    private fun pickCookiesFile() {
        AlertDialog.Builder(this)
            .setTitle("Файл cookies.txt")
            .setMessage(
                "Если Google не пускает во встроенном окне входа:\n\n" +
                    "1. Установите Firefox и дополнение «Get cookies.txt LOCALLY».\n" +
                    "2. Войдите на сайт в Firefox (можно через Google).\n" +
                    "3. Нажмите значок дополнения → Export.\n" +
                    "4. Выберите сохранённый файл здесь.\n\n" +
                    "После загрузки удалите файл из «Загрузок»: по нему можно войти в ваш аккаунт."
            )
            .setPositiveButton("Выбрать файл") { _, _ ->
                startActivityForResult(
                    Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("text/*"),
                    REQ_COOKIES,
                )
            }
            .setNegativeButton("Отмена", null)
            .show()
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != REQ_COOKIES || resultCode != RESULT_OK) return
        val uri = data?.data ?: return
        val n = try {
            contentResolver.openInputStream(uri)!!.bufferedReader().use { Cookies.import(this, it.readText()) }
        } catch (e: Exception) {
            0
        }
        Toast.makeText(this, if (n > 0) "Вход сохранён" else "В файле нет данных для входа", Toast.LENGTH_LONG).show()
        onResume()
    }

    private fun logoutAll() {
        AlertDialog.Builder(this)
            .setMessage("Удалить все сохранённые входы в аккаунты?")
            .setPositiveButton("Удалить") { _, _ ->
                Cookies.clear(this)
                onResume()
            }
            .setNegativeButton("Отмена", null)
            .show()
    }

    private fun askNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1)
        }
    }

    companion object {
        private const val REQ_COOKIES = 10
    }
}
