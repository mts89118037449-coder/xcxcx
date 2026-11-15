package com.zagruzchik.app

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RadialGradient
import android.graphics.Shader
import android.os.SystemClock
import android.view.View
import androidx.core.graphics.ColorUtils
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin

/**
 * Цветной «дым» вокруг обложки: мягкие облака медленно плывут и клубятся по её контуру, каждое — цвета
 * ближайшего края обложки. Пока музыка играет — движется, на паузе — замирает и тускнеет.
 * Тема приложения сохраняется: цвета слегка подмешаны к фирменному фиолетовому, а без обложки дым — цветов ауры.
 */
class SmokeView(ctx: Context) : View(ctx) {
    private class Puff(val angle: Float, val speed: Float, val phase: Float, val size: Float, val reach: Float)

    private val puffs = List(COUNT) { i ->
        val f = i / COUNT.toFloat()
        // Разные скорости и фазы — облака не ходят строем; знак скорости чередуется, чтобы они расходились и сходились.
        Puff((f * 2 * PI).toFloat(), (0.035f + 0.02f * ((i * 7) % 5)) * (if (i % 2 == 0) 1 else -1), f * 9.7f, 0.62f + 0.09f * ((i * 3) % 4), 0.86f + 0.07f * ((i * 5) % 3))
    }
    private var colors = IntArray(COUNT)
    private var shaders = arrayOfNulls<Shader>(COUNT)
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)

    private var cx = 0f; private var cy = 0f; private var radius = 0f
    private var clock = 0f          // «время дыма»: идёт только пока играет музыка
    private var last = 0L
    private var level = 0f          // яркость: плавно растёт при игре и гаснет на паузе
    var playing = false
        set(v) { if (field != v) { field = v; last = SystemClock.uptimeMillis(); invalidate() } }

    init { setCover(null); isClickable = false }

    /** Где обложка (центр и половина стороны) — в координатах этого слоя. */
    fun place(x: Float, y: Float, r: Float) {
        if (x != cx || y != cy || r != radius) { cx = x; cy = y; radius = r; invalidate() }
    }

    /** Цвета берём с краёв обложки: каждое облако — цвета того края, у которого оно плывёт. */
    fun setCover(b: Bitmap?) {
        val theme = intArrayOf(AuraColors.c1(context), AuraColors.c2(context), AuraColors.c3(context))
        val small = b?.let { runCatching { Bitmap.createScaledBitmap(it, GRID, GRID, true) }.getOrNull() }
        for (i in 0 until COUNT) {
            val a = puffs[i].angle
            val c = if (small == null) theme[i % theme.size] else {
                // Точка у края обложки в направлении облака; усредняем соседние пиксели.
                val px = ((0.5f + 0.42f * cos(a)) * (GRID - 1)).toInt().coerceIn(1, GRID - 2)
                val py = ((0.5f + 0.42f * sin(a)) * (GRID - 1)).toInt().coerceIn(1, GRID - 2)
                var r = 0; var g = 0; var bl = 0
                for (dx in -1..1) for (dy in -1..1) { val p = small.getPixel(px + dx, py + dy); r += Color.red(p); g += Color.green(p); bl += Color.blue(p) }
                vivid(Color.rgb(r / 9, g / 9, bl / 9), theme[i % theme.size])
            }
            colors[i] = c
            shaders[i] = RadialGradient(0f, 0f, 1f, intArrayOf(ColorUtils.setAlphaComponent(c, 0xCC), ColorUtils.setAlphaComponent(c, 0x55), Color.TRANSPARENT),
                floatArrayOf(0f, 0.45f, 1f), Shader.TileMode.CLAMP)
        }
        invalidate()
    }

    /** Тусклые и серые края (чёрная обложка) не дают свечения — поднимаем яркость и насыщенность, подмешиваем цвет темы. */
    private fun vivid(c: Int, theme: Int): Int {
        val hsv = FloatArray(3); Color.colorToHSV(c, hsv)
        if (hsv[1] < 0.18f) return ColorUtils.blendARGB(c, theme, 0.6f).let { t -> FloatArray(3).also { Color.colorToHSV(t, it); it[2] = maxOf(it[2], 0.6f) }.let(Color::HSVToColor) }
        hsv[1] = minOf(1f, hsv[1] * 1.25f + 0.08f); hsv[2] = hsv[2].coerceIn(0.55f, 0.95f)
        return ColorUtils.blendARGB(Color.HSVToColor(hsv), theme, 0.12f)
    }

    override fun onDraw(canvas: Canvas) {
        if (radius <= 0f) return
        val now = SystemClock.uptimeMillis()
        val dt = if (last == 0L) 0f else minOf(64L, now - last) / 1000f
        last = now
        if (playing) clock += dt
        // Плавное появление и затухание (около секунды).
        val target = if (playing) 1f else 0.45f
        level += (target - level) * minOf(1f, dt * 2.2f)

        for (i in 0 until COUNT) {
            val p = puffs[i]
            val t = clock
            // Движение — сумма медленных колебаний с разными периодами: облако плывёт вдоль контура, отходит и возвращается.
            val a = p.angle + t * p.speed + 0.35f * sin(t * 0.21f + p.phase)
            val dist = radius * (p.reach + 0.13f * sin(t * 0.33f + p.phase * 1.7f))
            val size = radius * (p.size + 0.12f * sin(t * 0.27f + p.phase * 0.6f))
            val alpha = (0.55f + 0.3f * sin(t * 0.41f + p.phase * 2.3f)) * level
            paint.shader = shaders[i]
            paint.alpha = (alpha * 255).toInt().coerceIn(0, 255)
            canvas.save()
            canvas.translate(cx + cos(a) * dist, cy + sin(a) * dist)
            // Слегка вытянутое облако, повёрнутое по ходу движения, — похоже на клуб дыма, а не на ровный круг.
            canvas.rotate(Math.toDegrees(a.toDouble()).toFloat() + 90f)
            canvas.scale(size * 1.25f, size * 0.85f)
            canvas.drawCircle(0f, 0f, 1f, paint)
            canvas.restore()
        }
        if (playing || kotlin.math.abs(level - target) > 0.01f) postInvalidateOnAnimation()
    }

    companion object {
        private const val COUNT = 9
        private const val GRID = 20
    }
}
