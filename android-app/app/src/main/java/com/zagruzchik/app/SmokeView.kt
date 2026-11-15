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
 * Цветной дым из обложки: клубы рождаются у её края, расплываются по всему экрану, растут и тают — как пар.
 * Каждый клуб — цвета того края обложки, откуда вышел. Яркость «дышит» в ритме пульса. Пока музыка играет — дым идёт,
 * на паузе — замирает и тускнеет. Тема приложения сохраняется: без обложки и на серых краях дым — цветов ауры.
 */
@androidx.annotation.OptIn(androidx.media3.common.util.UnstableApi::class)
class SmokeView(ctx: Context) : View(ctx) {
    private var edge = IntArray(EDGES)                    // цвета по краю обложки, по кругу
    private var shaders = arrayOfNulls<Shader>(EDGES)
    private var halo: Shader? = null
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)

    private var cx = 0f; private var cy = 0f; private var radius = 0f
    private var clock = 0f          // «время дыма»: идёт только пока играет музыка
    private var last = 0L
    private var level = 0f          // общая яркость: плавно растёт при игре и гаснет на паузе
    private var shown = 0f          // текущая сила пульса на экране
    var playing = false
        set(v) { if (field != v) { field = v; last = SystemClock.uptimeMillis(); invalidate() } }

    init { setCover(null); isClickable = false }

    /** Где обложка (центр и половина стороны) — в координатах этого слоя. */
    fun place(x: Float, y: Float, r: Float) {
        if (x != cx || y != cy || r != radius) { cx = x; cy = y; radius = r; invalidate() }
    }

    /** Цвета берём с краёв обложки: клуб дыма — цвета того места, откуда вышел. */
    fun setCover(b: Bitmap?) {
        val theme = intArrayOf(AuraColors.c1(context), AuraColors.c2(context), AuraColors.c3(context))
        val small = b?.let { runCatching { Bitmap.createScaledBitmap(it, GRID, GRID, true) }.getOrNull() }
        var sr = 0; var sg = 0; var sb = 0
        for (i in 0 until EDGES) {
            val a = (i / EDGES.toFloat() * 2 * PI).toFloat()
            val c = if (small == null) theme[i % theme.size] else {
                val px = ((0.5f + 0.40f * cos(a)) * (GRID - 1)).toInt().coerceIn(1, GRID - 2)
                val py = ((0.5f + 0.40f * sin(a)) * (GRID - 1)).toInt().coerceIn(1, GRID - 2)
                var r = 0; var g = 0; var bl = 0
                for (dx in -1..1) for (dy in -1..1) { val p = small.getPixel(px + dx, py + dy); r += Color.red(p); g += Color.green(p); bl += Color.blue(p) }
                vivid(Color.rgb(r / 9, g / 9, bl / 9), theme[i % theme.size])
            }
            edge[i] = c; sr += Color.red(c); sg += Color.green(c); sb += Color.blue(c)
            shaders[i] = RadialGradient(0f, 0f, 1f, intArrayOf(ColorUtils.setAlphaComponent(c, 0xF0), ColorUtils.setAlphaComponent(c, 0x80), Color.TRANSPARENT),
                floatArrayOf(0f, 0.42f, 1f), Shader.TileMode.CLAMP)
        }
        val mean = Color.rgb(sr / EDGES, sg / EDGES, sb / EDGES)
        halo = RadialGradient(0f, 0f, 1f, intArrayOf(ColorUtils.setAlphaComponent(mean, 0xD0), ColorUtils.setAlphaComponent(mean, 0x60), Color.TRANSPARENT),
            floatArrayOf(0.35f, 0.62f, 1f), Shader.TileMode.CLAMP)
        invalidate()
    }

    /**
     * Цвет дыма — цвет самой обложки, только светлее, чтобы он был виден на тёмном фоне.
     * Серая или чёрно-белая обложка даёт серебристо-белый дым (раньше он подменялся фиолетовым цветом приложения —
     * и дым выглядел чужим). Цвет приложения остаётся только там, где обложки нет вовсе.
     */
    private fun vivid(c: Int, @Suppress("UNUSED_PARAMETER") theme: Int): Int {
        val hsv = FloatArray(3); Color.colorToHSV(c, hsv)
        if (hsv[1] < 0.14f) { hsv[1] *= 0.6f; hsv[2] = (hsv[2] * 0.9f + 0.45f).coerceIn(0.62f, 0.97f); return Color.HSVToColor(hsv) }
        hsv[1] = minOf(1f, hsv[1] * 1.25f + 0.06f); hsv[2] = hsv[2].coerceIn(0.72f, 1f)
        return Color.HSVToColor(hsv)
    }

    /** Псевдослучайное число 0..1 по номеру клуба и номеру его «жизни» — каждый новый клуб летит по-своему. */
    private fun rnd(i: Int, life: Int, salt: Int): Float {
        var h = i * 374761393 + life * 668265263 + salt * 1274126177
        h = (h xor (h ushr 13)) * 1274126177
        return ((h xor (h ushr 16)) and 0xFFFF) / 65535f
    }

    override fun onDraw(canvas: Canvas) {
        if (radius <= 0f) return
        val now = SystemClock.uptimeMillis()
        val dt = if (last == 0L) 0f else minOf(64L, now - last) / 1000f
        last = now
        if (playing) clock += dt
        val target = if (playing) 1f else 0.4f
        level += (target - level) * minOf(1f, dt * 2.2f)
        val t = clock
        // Пульс: мягкий удар примерно раз в 1,3 секунды — дым вспыхивает и чуть расширяется.
        // Под ритм музыки: удары берутся из самого звука (см. Exciter.beatNow). Нет данных — мягкий собственный пульс.
        val heard = if (playing) Exciter.beatNow() else null
        val beat = heard ?: (0.5f + 0.5f * sin(t * 4.8f)).let { it * it }
        // Сглаживаем вспышку, чтобы яркость не дёргалась: быстрый подъём, плавный спад.
        shown += (beat - shown) * (if (beat > shown) 0.75f else minOf(1f, dt * 5f))
        val pulse = 0.62f + 0.38f * shown

        // Ореол вплотную к обложке — из него «выходит» дым.
        halo?.let { h ->
            paint.shader = h
            paint.alpha = (255 * 0.75f * level * pulse).toInt().coerceIn(0, 255)
            canvas.save(); canvas.translate(cx, cy)
            val hs = radius * (1.55f + 0.22f * shown)
            canvas.scale(hs, hs); canvas.drawCircle(0f, 0f, 1f, paint); canvas.restore()
        }

        // Как далеко уплывает дым: до краёв экрана.
        val far = maxOf(width, height) * 0.62f
        for (i in 0 until COUNT) {
            val lifeSec = 7f + 5f * rnd(i, 0, 1)                    // сколько живёт клуб
            val shifted = t + rnd(i, 0, 2) * lifeSec                 // клубы рождаются вразнобой
            val life = (shifted / lifeSec).toInt()
            val age = shifted / lifeSec - life                       // 0 — только вышел из обложки, 1 — растаял
            val dir = rnd(i, life, 3) * 2 * PI.toFloat()             // откуда вышел
            val drift = (rnd(i, life, 4) - 0.5f) * 1.3f              // закручивание в сторону
            val rise = 0.25f + 0.35f * rnd(i, life, 5)               // пар тянется вверх
            // Путь: от края обложки наружу, с замедлением, петляя и поднимаясь.
            val out = 1f - (1f - age) * (1f - age)
            val dist = radius * 0.85f + (far - radius * 0.85f) * out * (0.55f + 0.45f * rnd(i, life, 6))
            val a = dir + drift * out + 0.25f * sin(age * 6.3f + i)
            val x = cx + cos(a) * dist
            val y = cy + sin(a) * dist - rise * radius * 1.6f * out
            // Растёт и тает.
            val size = radius * (0.55f + 1.25f * out) * (0.85f + 0.3f * rnd(i, life, 7))
            val fade = minOf(1f, age * 7f) * (1f - age) * (1f - age * 0.35f)
            val alpha = fade * 0.95f * level * pulse
            if (alpha <= 0.01f) continue
            val shader = shaders[((dir / (2 * PI.toFloat()) * EDGES).toInt() % EDGES + EDGES) % EDGES]
            paint.shader = shader
            paint.alpha = (alpha * 255).toInt().coerceIn(0, 255)
            // Клуб — два смещённых вытянутых пятна: неровная форма, как у дыма, а не ровный круг.
            val turn = Math.toDegrees(a.toDouble()).toFloat() + 90f + 40f * sin(age * 3f + i)
            for (k in 0..1) {
                canvas.save()
                canvas.translate(x + (if (k == 0) -1 else 1) * size * 0.28f * cos(a + 1.3f), y + (if (k == 0) -1 else 1) * size * 0.28f * sin(a + 1.3f))
                canvas.rotate(turn + k * 55f)
                canvas.scale(size * (1.15f - 0.2f * k), size * (0.7f + 0.15f * k))
                canvas.drawCircle(0f, 0f, 1f, paint)
                canvas.restore()
            }
        }
        if (playing || kotlin.math.abs(level - target) > 0.01f) postInvalidateOnAnimation()
    }

    companion object {
        private const val COUNT = 22
        private const val EDGES = 12
        private const val GRID = 20
    }
}
