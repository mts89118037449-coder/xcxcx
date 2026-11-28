package com.zagruzchik.app

import androidx.activity.ComponentActivity
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.SweepGradient
import android.os.SystemClock
import android.view.Gravity
import android.view.ViewGroup
import android.view.animation.DecelerateInterpolator
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.content.res.ResourcesCompat

/**
 * Заставка, пока собирается «Аура дня»: на весь экран — клубящийся дым в цветах ауры и по шагам, что происходит
 * («беру ваших исполнителей…», «ищу новое по тегам…»). Уходит плавно, когда включается первая песня.
 */
class AuraOverlay private constructor(private val a: ComponentActivity) {
    private val root = FrameLayout(a).apply {
        setBackgroundColor(0xF20B0A10.toInt())
        isClickable = true // экран под заставкой не нажимается
        alpha = 0f
    }
    private val smoke = SmokeView(a)
    private val title = TextView(a).apply {
        text = "Аура дня"; textSize = 34f; setTextColor(Color.WHITE); gravity = Gravity.CENTER
        typeface = ResourcesCompat.getFont(a, R.font.onest_bold); letterSpacing = -0.02f
        setShadowLayer(a.dp(18).toFloat(), 0f, 0f, 0xAA000000.toInt())
    }
    private val step = TextView(a).apply {
        textSize = 16f; setTextColor(0xEEFFFFFF.toInt()); gravity = Gravity.CENTER
        typeface = ResourcesCompat.getFont(a, R.font.onest_medium)
        setShadowLayer(a.dp(10).toFloat(), 0f, 0f, 0xCC000000.toInt())
        minLines = 2
    }
    private val shownAt = SystemClock.uptimeMillis()
    private var gone = false

    var cancelled = false
        private set
    private val back = object : androidx.activity.OnBackPressedCallback(true) {
        override fun handleOnBackPressed() {
            cancelled = true
            dismiss(0, now = true)
        }
    }

    init {
        // Цвета дыма — фирменные цвета ауры: «обложка» из кругового градиента, с краёв которой дым и берёт цвета.
        smoke.setCover(auraBitmap())
        smoke.warmStart()
        root.addView(smoke, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        root.addView(LinearLayout(a).apply {
            orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER
            setPadding(a.dp(28), 0, a.dp(28), 0)
            addView(title)
            addView(step, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = a.dp(14) })
        }, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER))
        root.addOnLayoutChangeListener { v, l, t, r, b, _, _, _, _ ->
            val w = r - l; val h = b - t
            smoke.place(w / 2f, h / 2f, minOf(w, h) * 0.2f) // дым клубится из середины экрана
        }
        (a.findViewById<ViewGroup>(android.R.id.content)).addView(root, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        root.animate().alpha(1f).setDuration(140).start()
        step.text = "Собираю твою ауру…"
        // Назад отменяет переход в новую подборку (случайный тап по экрану анимацию не прерывает).
        a.onBackPressedDispatcher.addCallback(a, back)
        title.scaleX = 0.9f; title.scaleY = 0.9f
        title.animate().scaleX(1f).scaleY(1f).setDuration(900).setInterpolator(DecelerateInterpolator()).start()
    }

    private fun auraBitmap(): Bitmap {
        val n = 64
        val b = Bitmap.createBitmap(n, n, Bitmap.Config.ARGB_8888)
        val c1 = AuraColors.c1(a); val c2 = AuraColors.c2(a); val c3 = AuraColors.c3(a)
        Canvas(b).drawRect(0f, 0f, n.toFloat(), n.toFloat(), Paint().apply {
            shader = SweepGradient(n / 2f, n / 2f, intArrayOf(c1, c2, c3, c2, c1), null)
        })
        return b
    }

    /** Новый шаг: старый текст тает, новый проявляется. */
    fun say(text: String) {
        if (gone || cancelled || a.isFinishing || a.isDestroyed) return
        step.animate().cancel()
        step.animate().alpha(0f).setDuration(120).withEndAction {
            if (gone || cancelled || a.isFinishing || a.isDestroyed) return@withEndAction
            step.text = text
            step.translationY = a.dp(6).toFloat()
            step.animate().alpha(1f).translationY(0f).setDuration(220).start()
        }.start()
    }

    /** Убрать — не раньше чем через 1,2 с после появления, чтобы заставка не мелькала ([now] — сразу, по отмене). */
    fun dismiss(extraMs: Long = 0, now: Boolean = false) {
        if (gone) return
        val wait = if (now) 0L else maxOf(0L, 1200 - (SystemClock.uptimeMillis() - shownAt)) + extraMs
        root.postDelayed({
            if (gone) return@postDelayed
            runCatching { back.remove() }
            gone = true
            if (a.isFinishing || a.isDestroyed) {
                smoke.playing = false
                (root.parent as? ViewGroup)?.removeView(root)
                return@postDelayed
            }
            root.animate().alpha(0f).setDuration(420).withEndAction {
                smoke.playing = false
                (root.parent as? ViewGroup)?.removeView(root)
            }.start()
        }, wait)
    }

    companion object {
        fun show(a: ComponentActivity): AuraOverlay = AuraOverlay(a)
    }
}

