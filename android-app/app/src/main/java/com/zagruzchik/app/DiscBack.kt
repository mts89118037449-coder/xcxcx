package com.zagruzchik.app

import android.graphics.Canvas
import android.graphics.Color
import android.graphics.ColorFilter
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.PixelFormat
import android.graphics.RadialGradient
import android.graphics.Shader
import android.graphics.SweepGradient
import android.graphics.drawable.Drawable
import android.os.SystemClock

/**
 * Обратная сторона диска — как у компакт-диска на свету: серебро, два радужных «веера» отражения и тонкие дорожки.
 * Пока музыка играет, блик медленно ходит по кругу и вспыхивает на ударах.
 */
@androidx.annotation.OptIn(androidx.media3.common.util.UnstableApi::class)
class DiscBack : Drawable() {
    var playing = false
        set(v) { field = v; last = 0L; invalidateSelf() }

    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val line = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
    private val turn = Matrix()
    private var base: Shader? = null
    private var rainbow: Shader? = null
    private var gloss: Shader? = null
    private var builtFor = 0f
    private var angle = 24f
    private var flash = 0f
    private var last = 0L

    private fun build(cx: Float, cy: Float, r: Float) {
        builtFor = r
        base = RadialGradient(cx, cy, r, intArrayOf(0xFFB9BCC6.toInt(), 0xFFE9EAF0.toInt(), 0xFFC4C7D1.toInt(), 0xFFF4F5F8.toInt(), 0xFFAEB1BC.toInt()),
            floatArrayOf(0f, 0.3f, 0.55f, 0.85f, 1f), Shader.TileMode.CLAMP)
        // Два веера радуги друг напротив друга, между ними — серебро (прозрачно).
        val o = Color.TRANSPARENT
        rainbow = SweepGradient(cx, cy,
            intArrayOf(o, 0xCCFF3B6B.toInt(), 0xCCFFB02E.toInt(), 0xCCF7F44A.toInt(), 0xCC3BE477.toInt(), 0xCC2BC4FF.toInt(), 0xCC7A5CFF.toInt(), o,
                o, 0xCC7A5CFF.toInt(), 0xCC2BC4FF.toInt(), 0xCC3BE477.toInt(), 0xCCF7F44A.toInt(), 0xCCFFB02E.toInt(), 0xCCFF3B6B.toInt(), o, o),
            floatArrayOf(0f, 0.03f, 0.06f, 0.09f, 0.12f, 0.15f, 0.18f, 0.22f,
                0.5f, 0.53f, 0.56f, 0.59f, 0.62f, 0.65f, 0.68f, 0.72f, 1f))
        // Белые блики по краям вееров.
        val w = 0xE6FFFFFF.toInt()
        gloss = SweepGradient(cx, cy, intArrayOf(o, o, w, o, o, w, o, o), floatArrayOf(0f, 0.22f, 0.26f, 0.32f, 0.72f, 0.76f, 0.82f, 1f))
    }

    override fun draw(canvas: Canvas) {
        val b = bounds
        val cx = b.exactCenterX(); val cy = b.exactCenterY()
        val r = minOf(b.width(), b.height()) / 2f
        if (r <= 0f) return
        if (builtFor != r) build(cx, cy, r)
        val now = SystemClock.uptimeMillis()
        val dt = if (last == 0L) 0f else minOf(64L, now - last) / 1000f
        last = now
        val beat = if (playing) Exciter.beatNow() ?: 0f else 0f
        flash += (beat - flash) * (if (beat > flash) 0.7f else minOf(1f, dt * 5f))
        if (playing) angle = (angle + dt * (22f + 60f * flash)) % 360f

        paint.shader = base; paint.alpha = 255
        canvas.drawCircle(cx, cy, r, paint)
        turn.setRotate(angle, cx, cy)
        rainbow?.setLocalMatrix(turn); gloss?.setLocalMatrix(turn)
        paint.shader = rainbow; paint.alpha = (150 + 105 * flash).toInt()
        canvas.drawCircle(cx, cy, r, paint)
        paint.shader = gloss; paint.alpha = (120 + 135 * flash).toInt()
        canvas.drawCircle(cx, cy, r, paint)
        paint.shader = null

        // Дорожки: тонкие концентрические линии.
        line.strokeWidth = maxOf(1f, r * 0.004f)
        var k = 0.36f
        var i = 0
        while (k < 0.97f) {
            line.color = if (i % 2 == 0) 0x16000000 else 0x20FFFFFF
            canvas.drawCircle(cx, cy, r * k, line)
            k += 0.022f; i++
        }
        // Прозрачная середина диска и ободок.
        paint.color = 0x55E9EAF0; canvas.drawCircle(cx, cy, r * 0.33f, paint)
        paint.color = 0x66FFFFFF; canvas.drawCircle(cx, cy, r * 0.20f, paint)
        line.strokeWidth = r * 0.012f
        line.color = 0x40000000; canvas.drawCircle(cx, cy, r * 0.33f, line)
        line.color = 0x55FFFFFF; canvas.drawCircle(cx, cy, r * 0.994f, line)
        if (playing) invalidateSelf()
    }

    override fun setAlpha(alpha: Int) {}
    override fun setColorFilter(colorFilter: ColorFilter?) {}
    @Deprecated("Deprecated in Java") override fun getOpacity() = PixelFormat.TRANSLUCENT
}
