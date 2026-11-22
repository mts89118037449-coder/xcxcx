package com.zagruzchik.app

import android.animation.ValueAnimator
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Shader
import android.graphics.drawable.GradientDrawable
import android.view.View
import android.view.animation.AccelerateDecelerateInterpolator
import android.widget.TextView
import com.google.android.material.button.MaterialButton

/** Фирменный стиль SoundAura: градиент ауры (фиолетовый → розовый), свечение, «дыхание» под музыку. */
object Aura {
    val VIOLET = Color.parseColor("#6A3DF0")
    val ORCHID = Color.parseColor("#A03EE0")
    val PINK = Color.parseColor("#FF4F9A")

    /** Текст с градиентом ауры (логотип). */
    fun gradientText(tv: TextView) {
        fun apply() {
            val w = tv.paint.measureText(tv.text.toString())
            tv.paint.shader = LinearGradient(0f, 0f, w, 0f, intArrayOf(VIOLET, ORCHID, PINK), null, Shader.TileMode.CLAMP)
            tv.invalidate()
        }
        apply()
        tv.addOnLayoutChangeListener { _, _, _, _, _, _, _, _, _ -> apply() }
    }

    /** Главная кнопка («Слушать»): градиент ауры, белый текст. */
    fun primaryButton(b: MaterialButton) {
        b.backgroundTintList = null
        b.setBackgroundResource(R.drawable.bg_aura_button)
        b.setTextColor(Color.WHITE)
        b.iconTint = ColorStateList.valueOf(Color.WHITE)
        b.rippleColor = ColorStateList.valueOf(0x40FFFFFF)
    }

    /** Круглая кнопка «Играть» в плеере. */
    fun playButton(b: MaterialButton) {
        b.backgroundTintList = null
        b.setBackgroundResource(R.drawable.bg_aura_circle)
        b.iconTint = ColorStateList.valueOf(Color.WHITE)
    }

    /** Приветствие по времени суток — под логотипом. */
    fun greeting(): String = when (java.util.Calendar.getInstance().get(java.util.Calendar.HOUR_OF_DAY)) {
        in 5..11 -> "Доброе утро"
        in 12..17 -> "Добрый день"
        in 18..22 -> "Добрый вечер"
        else -> "Доброй ночи"
    }

    /**
     * Свечение вокруг обложки в цвет песни. Пока играет музыка — мягко «дышит»
     * (раздувается и гаснет), на паузе — замирает.
     */
    class Glow(private val view: View) {
        private val drawable = GradientDrawable().apply {
            gradientType = GradientDrawable.RADIAL_GRADIENT
            shape = GradientDrawable.RECTANGLE
        }
        private val anim = ValueAnimator.ofFloat(0f, 1f).apply {
            duration = 2400
            repeatMode = ValueAnimator.REVERSE
            repeatCount = ValueAnimator.INFINITE
            interpolator = AccelerateDecelerateInterpolator()
            addUpdateListener {
                val f = it.animatedValue as Float
                view.scaleX = 0.94f + 0.1f * f
                view.scaleY = 0.94f + 0.1f * f
                view.alpha = 0.55f + 0.4f * f
            }
        }

        init {
            view.background = drawable
            view.addOnLayoutChangeListener { v, l, t, r, b, _, _, _, _ ->
                drawable.gradientRadius = minOf(r - l, b - t) * 0.8f
                v.invalidate()
            }
            color(VIOLET)
        }

        /** Цвет ауры — из обложки, с фирменным фиолетовым оттенком. */
        fun color(c: Int) {
            val tinted = androidx.core.graphics.ColorUtils.blendARGB(c, VIOLET, 0.35f)
            drawable.colors = intArrayOf(
                androidx.core.graphics.ColorUtils.setAlphaComponent(tinted, 0xCC),
                androidx.core.graphics.ColorUtils.setAlphaComponent(tinted, 0x55),
                Color.TRANSPARENT,
            )
        }

        fun playing(on: Boolean) {
            if (on && !anim.isStarted) anim.start()
            if (!on && anim.isStarted) anim.pause()
            if (on && anim.isPaused) anim.resume()
        }

        fun stop() = anim.cancel()
    }
}
