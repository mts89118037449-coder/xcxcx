package com.zagruzchik.app

import android.accessibilityservice.AccessibilityService
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.os.Handler
import android.os.Looper
import android.provider.Settings as SysSettings
import android.view.Gravity
import android.view.WindowManager
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import android.widget.LinearLayout
import android.widget.TextView

/**
 * Перенос медиатеки прямо из приложения сервиса — без браузера и входа:
 * человек открывает в Spotify (Яндексе, VK…) «Любимые треки», нажимает плавающую кнопку SoundAura,
 * и мы сами листаем список, собирая название и исполнителя из строк на экране.
 * Работает только пока идёт перенос и только в музыкальных приложениях из списка.
 */
class ScreenImportService : AccessibilityService() {

    private var overlay: TextView? = null
    private val main = Handler(Looper.getMainLooper())
    private var collecting = false
    private val found = LinkedHashMap<String, Track>()
    private var idleSteps = 0
    private var lastPackage: String? = null

    override fun onServiceConnected() { instance = this }

    override fun onDestroy() { hide(); instance = null; super.onDestroy() }

    override fun onInterrupt() {}

    override fun onAccessibilityEvent(e: AccessibilityEvent) {
        val pkg = e.packageName?.toString() ?: return
        if (pkg == packageName) return
        if (armed == null) { hide(); return }
        if (pkg in APPS) {
            lastPackage = pkg
            if (overlay == null) show()
        } else if (!collecting && e.eventType == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED && pkg != "com.android.systemui") hide()
    }

    // ---------------- Плавающая кнопка ----------------

    private fun show() {
        val wm = getSystemService(WindowManager::class.java) ?: return
        val v = TextView(this).apply {
            text = "SoundAura: перенести этот список"
            textSize = 15f; setTextColor(Color.WHITE)
            typeface = androidx.core.content.res.ResourcesCompat.getFont(this@ScreenImportService, R.font.onest_semibold)
            setPadding(dp(20), dp(14), dp(20), dp(14))
            background = GradientDrawable(GradientDrawable.Orientation.LEFT_RIGHT,
                intArrayOf(AuraColors.c1(context), AuraColors.c2(context), AuraColors.c3(context))).apply { cornerRadius = dp(28).toFloat() }
            elevation = dp(8).toFloat()
            setOnClickListener { if (!collecting) start() else finish() }
        }
        val lp = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT, WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT,
        ).apply { gravity = Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL; y = dp(140) }
        runCatching { wm.addView(v, lp); overlay = v }
    }

    private fun hide() {
        overlay?.let { v -> runCatching { getSystemService(WindowManager::class.java)?.removeView(v) } }
        overlay = null
    }

    private fun label(s: String) { overlay?.text = s }

    // ---------------- Сбор ----------------

    private fun start() {
        collecting = true
        found.clear(); idleSteps = 0
        label("Собираю… 0 · нажмите, чтобы закончить")
        main.postDelayed(::step, 300)
    }

    /** Один шаг: прочитать видимые строки, пролистать дальше. Конец — когда новые не появляются. */
    private fun step() {
        if (!collecting) return
        val root = rootInActiveWindow
        val before = found.size
        root?.let { read(it) }
        label("Собираю… ${found.size} · нажмите, чтобы закончить")
        idleSteps = if (found.size == before) idleSteps + 1 else 0
        val list = root?.let { biggestScrollable(it) }
        val scrolled = list?.performAction(AccessibilityNodeInfo.ACTION_SCROLL_FORWARD) == true
        if ((!scrolled && idleSteps >= 2) || idleSteps >= 4 || found.size >= 5000) { finish(); return }
        main.postDelayed(::step, 650)
    }

    private fun finish() {
        collecting = false
        val tracks = found.values.toList()
        hide()
        armed?.let { source ->
            result = Importer.Result(if (source == "VK Музыка") "Моя музыка ВК" else "Любимое из $source", source, tracks)
        }
        armed = null
        startActivity(Intent(this, ImportActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            .putExtra(ImportActivity.EXTRA_FROM_SCREEN, true))
    }

    private fun biggestScrollable(n: AccessibilityNodeInfo): AccessibilityNodeInfo? {
        var best: AccessibilityNodeInfo? = null
        var bestArea = 0
        fun walk(x: AccessibilityNodeInfo?) {
            x ?: return
            if (x.isScrollable) {
                val r = android.graphics.Rect(); x.getBoundsInScreen(r)
                val a = r.width() * r.height()
                if (a > bestArea) { bestArea = a; best = x }
            }
            for (i in 0 until x.childCount) walk(x.getChild(i))
        }
        walk(n)
        return best
    }

    /** Строки списка: в каждой — название и исполнитель (первые два осмысленных текста). */
    private fun read(root: AccessibilityNodeInfo) {
        val list = biggestScrollable(root) ?: root
        for (i in 0 until list.childCount) {
            val row = list.getChild(i) ?: continue
            val texts = mutableListOf<String>()
            fun walk(x: AccessibilityNodeInfo?) {
                x ?: return
                val t = (x.text ?: if (x.childCount == 0) x.contentDescription else null)?.toString()?.trim()
                if (!t.isNullOrEmpty() && !junk(t)) texts += t
                for (k in 0 until x.childCount) walk(x.getChild(k))
            }
            walk(row)
            val title = texts.getOrNull(0) ?: continue
            val artist = texts.getOrNull(1)?.let(::cleanArtist).orEmpty()
            if (artist.isEmpty() || COUNT.matches(artist) || title.length > 150) continue
            found.putIfAbsent(Library.key(Track(title, artist)), Track(title, artist, explicit = texts.any { it == "E" || it.equals("explicit", true) }))
        }
    }

    private fun cleanArtist(s: String) = s.replace(PREFIX, "").substringBefore(" • ").trim()

    private fun junk(t: String) = isUiText(t) || t.length < 2 && t != "E" || t in JUNK || DURATION.matches(t) || t.all { it.isDigit() }

    companion object {
        @Volatile var instance: ScreenImportService? = null
        /** Идёт перенос из этого сервиса (название) — показываем кнопку в его приложении. */
        @Volatile var armed: String? = null
        @Volatile var result: Importer.Result? = null

        val APPS = setOf(
            "com.spotify.music", "ru.yandex.music", "com.vkontakte.android", "com.uma.musicvk", "com.apple.android.music",
            "com.google.android.apps.youtube.music", "com.soundcloud.android", "deezer.android.app", "com.zvooq.openplay",
        )
        private val JUNK = setOf("Скачано", "Downloaded", "Explicit", "E", "•", "Песня", "Song", "Трек", "Track", "Ещё", "More",
            "Перемешать", "Shuffle", "Слушать", "Play", "Добавить", "Add")
        private val DURATION = Regex("""\d{1,2}:\d{2}(:\d{2})?""")
        private val COUNT = Regex("""^\d[\d\s]*\s*(трек|песен|песни|песня|songs?|tracks?).*""", RegexOption.IGNORE_CASE)
        private val PREFIX = Regex("""^(Песня|Song|Трек|Track|Видео|Video)\s*•\s*""", RegexOption.IGNORE_CASE)

        /** Подпись кнопки, а не название песни или исполнитель. */
        fun isUiText(s: String) = UI_TEXT.any { s.startsWith(it, ignoreCase = true) }
        private val UI_TEXT = listOf("Открыть контекстное меню", "Open context menu", "Ещё для", "More options for", "Дополнительные параметры")

        /** Включена ли служба в «Специальных возможностях». */
        fun enabled(ctx: Context): Boolean {
            val me = ComponentName(ctx, ScreenImportService::class.java).flattenToString()
            val list = SysSettings.Secure.getString(ctx.contentResolver, SysSettings.Secure.ENABLED_ACCESSIBILITY_SERVICES).orEmpty()
            return list.split(':').any { it.equals(me, true) }
        }
    }

    @Suppress("unused") private fun unused(l: LinearLayout) = l
}
