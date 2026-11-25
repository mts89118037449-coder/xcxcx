package com.zagruzchik.app

import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.GridLayout
import android.widget.ImageButton
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.res.ResourcesCompat
import androidx.core.view.isVisible
import com.google.android.material.button.MaterialButton
import com.google.android.material.color.MaterialColors
import com.google.android.material.materialswitch.MaterialSwitch
import com.google.android.material.progressindicator.LinearProgressIndicator
import com.google.android.material.textfield.TextInputEditText
import com.google.android.material.textfield.TextInputLayout
import kotlin.concurrent.thread

/** «Перенести медиатеку»: выбрать сервис → вставить ссылку (или файл/список) → готово. */
class ImportActivity : AppCompatActivity() {
    private var source = Importer.Source.SPOTIFY
    private lateinit var tiles: GridLayout
    private lateinit var hint: TextView
    private lateinit var fromApp: MaterialButton
    private lateinit var linkBox: TextInputLayout
    private lateinit var link: TextInputEditText
    private lateinit var listBox: TextInputLayout
    private lateinit var list: TextInputEditText
    private lateinit var pickFile: MaterialButton
    private lateinit var toFav: MaterialSwitch
    private lateinit var go: MaterialButton
    private lateinit var progress: LinearProgressIndicator
    private lateinit var status: TextView
    private lateinit var done: LinearLayout
    private var busy = false

    private val openFile = registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri == null) return@registerForActivityResult
        if (busy) return@registerForActivityResult
        busy = true; go.isEnabled = false; status.isVisible = true; status.text = "Читаю файл…"
        thread {
            val text = runCatching { contentResolver.openInputStream(uri)?.bufferedReader()?.use { it.readText() } }.getOrNull()
            val name = if (text != null) runCatching {
                contentResolver.query(uri, null, null, null, null)?.use { c -> if (c.moveToFirst()) c.getString(c.getColumnIndexOrThrow(android.provider.OpenableColumns.DISPLAY_NAME)) else null }
            }.getOrNull()?.substringBeforeLast('.') ?: "Из файла" else ""
            runOnUiThread {
                if (isFinishing || isDestroyed) return@runOnUiThread
                busy = false; go.isEnabled = true
                if (text == null) { status.isVisible = true; status.text = "Не получилось прочитать файл" }
                else start { Importer.fromText(text, name) }
            }
        }
    }

    private val onSurface by lazy { MaterialColors.getColor(this, com.google.android.material.R.attr.colorOnSurface, Color.WHITE) }
    private val muted by lazy { MaterialColors.getColor(this, com.google.android.material.R.attr.colorOnSurfaceVariant, Color.GRAY) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL; fitsSystemWindows = true
            setPadding(dp(20), dp(8), dp(20), dp(32))
        }
        val head = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
        head.addView(ImageButton(this).apply {
            setImageResource(R.drawable.ic_arrow_back); setColorFilter(onSurface); background = getDrawable(R.drawable.bg_round_button)
            contentDescription = "Назад"; setOnClickListener { finish() }
        }, LinearLayout.LayoutParams(dp(44), dp(44)))
        root.addView(head)
        root.addView(TextView(this).apply {
            text = "Перенести\nмедиатеку"; textSize = 28f; setTextColor(onSurface); typeface = ResourcesCompat.getFont(this@ImportActivity, R.font.unbounded_bold)
            setPadding(0, dp(16), 0, dp(6)); setLineSpacing(0f, 1.05f)
        })
        root.addView(TextView(this).apply {
            text = "Песни попадут в плейлист с тем же названием и в «Любимое». Ничего не скачивается — играет сразу."
            textSize = 14f; setTextColor(muted); setLineSpacing(0f, 1.25f)
        })

        tiles = GridLayout(this).apply { columnCount = 2 }
        root.addView(tiles, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(18) })

        hint = TextView(this).apply { textSize = 14f; setTextColor(onSurface); setLineSpacing(0f, 1.3f); background = getDrawable(R.drawable.bg_card); setPadding(dp(16), dp(14), dp(16), dp(14)) }
        root.addView(hint, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(10) })

        // Главный путь — без браузера и входа: прямо из приложения сервиса на телефоне.
        fromApp = MaterialButton(this).apply {
            setIconResource(R.drawable.ic_library_music); Aura.primaryButton(this); insetTop = 0; insetBottom = 0
            setOnClickListener { fromScreen() }
        }
        root.addView(fromApp, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(54)).apply { topMargin = dp(14) })
        root.addView(TextView(this).apply {
            id = View.generateViewId(); tag = "orLink"
            text = "или по ссылке на плейлист:"; textSize = 13f; setTextColor(muted); setPadding(dp(4), dp(14), 0, 0)
        })

        linkBox = TextInputLayout(this, null, com.google.android.material.R.attr.textInputOutlinedStyle).apply { hint = "Ссылка на плейлист или альбом"; endIconMode = TextInputLayout.END_ICON_CLEAR_TEXT }
        link = TextInputEditText(linkBox.context).apply { inputType = InputType.TYPE_TEXT_VARIATION_URI; maxLines = 3 }
        linkBox.addView(link)
        root.addView(linkBox, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(14) })

        pickFile = MaterialButton(this, null, com.google.android.material.R.attr.materialButtonOutlinedStyle).apply {
            text = "Выбрать файл (CSV, TXT)"; setIconResource(R.drawable.ic_upload_file)
            setOnClickListener { openFile.launch(arrayOf("text/*", "application/csv", "application/vnd.ms-excel", "application/octet-stream")) }
        }
        root.addView(pickFile, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(52)).apply { topMargin = dp(14) })
        listBox = TextInputLayout(this, null, com.google.android.material.R.attr.textInputOutlinedStyle).apply { hint = "…или вставьте список: «Исполнитель — Песня» по строке" }
        list = TextInputEditText(listBox.context).apply { minLines = 4; maxLines = 10; gravity = Gravity.TOP; inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_MULTI_LINE }
        listBox.addView(list)
        root.addView(listBox, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(10) })

        val favRow = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL; setPadding(0, dp(12), 0, 0) }
        favRow.addView(TextView(this).apply { text = "Добавить песни в «Любимое»"; textSize = 15f; setTextColor(onSurface) }, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        toFav = MaterialSwitch(this).apply { isChecked = true }
        favRow.addView(toFav)
        root.addView(favRow)

        go = MaterialButton(this).apply {
            text = "Перенести"; setIconResource(R.drawable.ic_library_music); Aura.primaryButton(this)
            insetTop = 0; insetBottom = 0
            setOnClickListener { submit() }
        }
        root.addView(go, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(54)).apply { topMargin = dp(16) })

        progress = LinearProgressIndicator(this).apply { isVisible = false; trackCornerRadius = dp(3); setIndicatorColor(AuraColors.c2(this@ImportActivity)) }
        root.addView(progress, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(18) })
        status = TextView(this).apply { textSize = 14f; setTextColor(muted); isVisible = false; setPadding(0, dp(8), 0, 0) }
        root.addView(status)
        done = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; isVisible = false }
        root.addView(done)

        setContentView(androidx.core.widget.NestedScrollView(this).apply {
            setBackgroundColor(MaterialColors.getColor(this, com.google.android.material.R.attr.colorSurface, Color.BLACK))
            addView(root)
        })

        intent.getStringExtra(EXTRA_URL)?.let { prefill(it) } ?: clipboardLink()?.let { prefill(it) }
        renderSource()
    }

    private fun prefill(url: String) {
        val s = Service.of(url)
        Importer.Source.entries.firstOrNull { it.service == s && it.byLink }?.let { source = it }
        link.setText(url)
    }

    /** Если в буфере обмена ссылка на плейлист — подставляем сами. */
    private fun clipboardLink(): String? = runCatching {
        val t = getSystemService(ClipboardManager::class.java)?.primaryClip?.getItemAt(0)?.coerceToText(this)?.toString()?.trim()
        t?.let { Links.extract(it) }?.takeIf { Service.of(it) != null && (it.contains("playlist") || it.contains("album") || it.contains("/sets/") || it.contains("list=") || it.contains("/likes")) }
    }.getOrNull()

    private fun renderSource() {
        tiles.removeAllViews()
        Importer.Source.entries.forEach { s ->
            val on = s == source
            val cell = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL
                setPadding(dp(12), 0, dp(10), 0)
                background = GradientDrawable().apply {
                    cornerRadius = dp(18).toFloat()
                    setColor(androidx.core.content.ContextCompat.getColor(this@ImportActivity, R.color.card))
                    if (on) setStroke(dp(2), AuraColors.c2(this@ImportActivity)) else setStroke(dp(1), androidx.core.content.ContextCompat.getColor(this@ImportActivity, R.color.line))
                }
                isClickable = true; isFocusable = true
                setOnClickListener { source = s; renderSource() }
            }
            val badge = s.service?.badge ?: Badge("≡", AuraColors.c2(this))
            cell.addView(TextView(this).apply {
                showBadge(badge); gravity = Gravity.CENTER; textSize = 12f
                typeface = ResourcesCompat.getFont(this@ImportActivity, R.font.onest_bold)
                background = GradientDrawable().apply { shape = GradientDrawable.OVAL; setColor(badge.color) }
            }, LinearLayout.LayoutParams(dp(30), dp(30)))
            cell.addView(TextView(this).apply {
                text = s.title; textSize = 14f; setTextColor(onSurface); maxLines = 1
                typeface = ResourcesCompat.getFont(this@ImportActivity, if (on) R.font.onest_semibold else R.font.onest_regular)
                setPadding(dp(10), 0, 0, 0)
            })
            tiles.addView(cell, GridLayout.LayoutParams(GridLayout.spec(GridLayout.UNDEFINED), GridLayout.spec(GridLayout.UNDEFINED, 1f)).apply {
                width = 0; height = dp(54); setMargins(dp(4), dp(4), dp(4), dp(4))
            })
        }
        val app = installedApp(source)
        fromApp.isVisible = source.apps.isNotEmpty()
        fromApp.text = if (app != null) "Перенести «Любимые» из приложения ${source.title}" else "Приложение ${source.title} не установлено"
        fromApp.isEnabled = app != null
        hint.text = if (source.apps.isNotEmpty())
            "Без браузера и входа: откройте в приложении ${source.title} «Любимые» (или любой плейлист) и нажмите кнопку SoundAura внизу — список перенесётся сам.\n\n" + source.hint
        else source.hint
        linkBox.isVisible = source.byLink
        pickFile.isVisible = !source.byLink
        listBox.isVisible = !source.byLink
    }

    private fun installedApp(s: Importer.Source) = s.apps.firstOrNull { p -> runCatching { packageManager.getPackageInfo(p, 0) }.isSuccess }

    /**
     * Перенос с экрана: включаем кнопку SoundAura в приложении сервиса и открываем его.
     * Нужна служба в «Специальных возможностях» (один переключатель, без входа и паролей).
     */
    private fun fromScreen() {
        val app = installedApp(source) ?: return
        if (!ScreenImportService.enabled(this)) {
            com.google.android.material.dialog.MaterialAlertDialogBuilder(this)
                .setTitle("Один переключатель")
                .setMessage("Чтобы SoundAura могла пролистать «Любимые» в ${source.title}, включите её в «Специальных возможностях»:\n\n" +
                    "Специальные возможности → Установленные приложения → «SoundAura — перенос медиатеки» → Включить.\n\n" +
                    "Без входа и паролей. Работает только в музыкальных приложениях и только пока идёт перенос.\n\n" +
                    "Пишет «Настройки с ограниченным доступом»? Так Android защищает приложения, установленные не из магазина. " +
                    "Нажмите «Снять ограничение» → ⋮ в правом верхнем углу → «Разрешить ограниченные настройки» (на Xiaomi — «Разрешить ограниченные настройки» внизу страницы), " +
                    "подтвердите и снова включите переключатель.")
                .setPositiveButton("Открыть настройки") { _, _ -> startActivity(Intent(android.provider.Settings.ACTION_ACCESSIBILITY_SETTINGS)) }
                .setNeutralButton("Снять ограничение") { _, _ ->
                    startActivity(Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS, android.net.Uri.fromParts("package", packageName, null)))
                }
                .setNegativeButton("Отмена", null).show()
            return
        }
        ScreenImportService.armed = source.title
        ScreenImportService.result = null
        status.isVisible = true
        status.text = "Откройте «Любимые» в ${source.title} и нажмите кнопку SoundAura внизу экрана."
        packageManager.getLaunchIntentForPackage(app)?.let { startActivity(it) }
    }

    /** Вернулись из приложения сервиса со списком — переносим. */
    private fun takeScreenResult() {
        val r = ScreenImportService.result ?: return
        ScreenImportService.result = null
        if (r.tracks.isEmpty()) {
            status.isVisible = true
            status.text = "На экране не нашлось песен. Откройте сам список песен («Любимые» или плейлист) и нажмите кнопку ещё раз."
            return
        }
        start { r }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        if (intent.getBooleanExtra(EXTRA_FROM_SCREEN, false)) takeScreenResult()
    }

    override fun onResume() {
        super.onResume()
        renderSource() // включили службу в настройках — кнопка готова
        takeScreenResult()
    }

    private fun submit() {
        if (busy) return
        if (source.byLink) {
            val u = link.text?.toString()?.let { Links.extract(it) ?: it.trim() }.orEmpty()
            if (u.isBlank()) { linkBox.error = "Вставьте ссылку"; return }
            linkBox.error = null
            start { Importer.fromLink(u) }
        } else {
            val text = list.text?.toString().orEmpty()
            if (text.isBlank()) { openFile.launch(arrayOf("text/*", "application/csv", "application/vnd.ms-excel", "application/octet-stream")); return }
            start { Importer.fromText(text, if (source == Importer.Source.VK) "Из VK" else "Мой список") }
        }
    }

    private fun start(load: () -> Importer.Result) {
        busy = true
        go.isEnabled = false
        done.isVisible = false
        progress.isVisible = true; progress.isIndeterminate = true
        status.isVisible = true; status.text = "Открываю плейлист…"
        getSystemService(android.view.inputmethod.InputMethodManager::class.java)?.hideSoftInputFromWindow(go.windowToken, 0)
        thread {
            try {
                val r = load()
                // Сохраняем сразу — всё, без ограничений; обложки и длительность догружаются потом в фоне.
                val pl = Library.addPlaylist(r.name, r.source, r.tracks)
                val added = if (toFav.isChecked) Library.addFavorites(r.tracks) else 0
                val need = r.tracks.filter { it.cover == null || it.durationSec == 0 }
                runOnUiThread {
                    if (isFinishing || isDestroyed) return@runOnUiThread
                    finished(pl, added, need.size)
                }
                if (need.isNotEmpty()) enrichInBackground(pl.id, need)
            } catch (e: Exception) {
                runOnUiThread {
                    if (isFinishing || isDestroyed) {
                        busy = false
                        return@runOnUiThread
                    }
                    busy = false; go.isEnabled = true; progress.isVisible = false
                    status.text = (e as? UserError)?.message ?: "Не получилось: ${e.message}"
                }
            }
        }
    }

    /** Обложки для перенесённого — порциями, в фоне: можно уходить с экрана, медиатека обновится сама. */
    private fun enrichInBackground(playlistId: String, tracks: List<Track>) {
        val total = tracks.size
        var doneCount = 0
        tracks.chunked(100).forEach { part ->
            val out = Importer.enrich(part) { k -> val n = doneCount + k; if (n % 10 == 0 || n == total) runOnUiThread { coverStatus(n, total) } }
            doneCount += part.size
            Library.enriched(playlistId, part.zip(out))
        }
        runOnUiThread { coverStatus(total, total) }
    }

    private fun coverStatus(n: Int, total: Int) {
        if (isFinishing || isDestroyed) return
        progress.isVisible = n < total
        if (n < total) { progress.isIndeterminate = false; progress.max = total; progress.setProgressCompat(n, true) }
        cover.isVisible = true
        cover.text = if (n < total) "Подтягиваю обложки: $n из $total — можно закрыть экран, продолжится само" else "Обложки готовы"
    }

    private val cover by lazy {
        TextView(this).apply { textSize = 13f; setTextColor(status.currentTextColor); setPadding(0, dp(6), 0, 0) }
            .also { (status.parent as ViewGroup).addView(it, (status.parent as ViewGroup).indexOfChild(status) + 1) }
    }

    private fun finished(pl: Library.Playlist, added: Int, pending: Int = 0) {
        busy = false; go.isEnabled = true; progress.isVisible = pending > 0
        if (pending > 0) { progress.isIndeterminate = false; progress.max = pending; progress.progress = 0 }
        status.text = "Готово: ${pl.tracks.size} песен — плейлист «${pl.name}»" + if (added > 0) ", $added новых в «Любимом»." else "."
        done.removeAllViews()
        done.isVisible = true
        done.addView(MaterialButton(this).apply {
            text = "Открыть плейлист"; Aura.primaryButton(this); insetTop = 0; insetBottom = 0
            setOnClickListener { startActivity(CollectionActivity.playlist(this@ImportActivity, pl.id)) }
        }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(52)).apply { topMargin = dp(14) })
        done.addView(MaterialButton(this, null, com.google.android.material.R.attr.materialButtonOutlinedStyle).apply {
            text = "Перенести ещё"; setOnClickListener { link.setText(""); list.setText(""); done.isVisible = false; status.isVisible = false }
        }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(52)).apply { topMargin = dp(8) })
    }

    companion object {
        const val EXTRA_URL = "url"
        const val EXTRA_FROM_SCREEN = "fromScreen"
        fun open(ctx: Context, url: String? = null) = ctx.startActivity(Intent(ctx, ImportActivity::class.java).apply { url?.let { putExtra(EXTRA_URL, it) } })
    }

    @Suppress("unused") private fun noop(v: View) = Unit
}
