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
    // «Экран»: клубы, наложенные друг на друга, складываются в свет — дым яркий, но не выгорает в белое.
    // Обычное наложение, не «экран»: при сложении яркостей облака сливались в белую кашу. Теперь каждое облако — слой
    // поверх предыдущих: плотное тело, светлый ободок и тонкий тёмный контур, под ним — тень. Слои видно отдельно.
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val shadow: Shader = RadialGradient(0f, 0f, 1f, intArrayOf(0x66000000, 0x33000000, Color.TRANSPARENT),
        floatArrayOf(0.5f, 0.82f, 1f), Shader.TileMode.CLAMP)

    /** Струя: на каждый удар из обложки вырывается быстрый поток дыма в одну сторону. */
    /**
     * Клуб от ноты: широкое облако, которое выкатывается из обложки и тает. Бас — самые большие и медленные,
     * середина — средние, верх — поменьше и быстрее. Чем больше полос звучит разом, тем клубы шире и их больше —
     * они накладываются друг на друга.
     */
    private class Billow(val at: Long, val dir: Float, val power: Float, val bend: Float, val band: Int, val width: Float, val seed: Int)
    private val billows = ArrayDeque<Billow>()
    private var lastNote = Long.MIN_VALUE
    private var billowNo = 0
    private val bandShown = FloatArray(3)

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
        val small = b?.let { runCatching { Bitmap.createScaledBitmap(it, GRID, GRID, true) }.getOrNull() }
        var sr = 0; var sg = 0; var sb = 0
        for (i in 0 until EDGES) {
            val a = (i / EDGES.toFloat() * 2 * PI).toFloat()
            // Обложки нет — дым серебристый, спокойный (раньше был ярких цветов приложения).
            val c = if (small == null) (if (i % 2 == 0) 0xFFC9CAD6.toInt() else 0xFFA9ABBA.toInt()) else rayColor(small, a)
            edge[i] = c; sr += Color.red(c); sg += Color.green(c); sb += Color.blue(c)
            val rim = ColorUtils.blendARGB(c, Color.WHITE, 0.35f)      // светлый ободок
            val line = ColorUtils.blendARGB(c, Color.BLACK, 0.45f)     // тонкий контур за ним
            shaders[i] = RadialGradient(0f, 0f, 1f,
                // Подобрано по отрисовке на сервере (scratchpad/layers_preview.py): мягкое полупрозрачное тело, ободок и контур.
                intArrayOf(ColorUtils.setAlphaComponent(ColorUtils.blendARGB(c, Color.BLACK, 0.12f), 0x70), ColorUtils.setAlphaComponent(c, 0xA0),
                    ColorUtils.setAlphaComponent(rim, 0xC8), ColorUtils.setAlphaComponent(line, 0x60), Color.TRANSPARENT),
                floatArrayOf(0f, 0.55f, 0.78f, 0.87f, 1f), Shader.TileMode.CLAMP)
        }
        val mean = Color.rgb(sr / EDGES, sg / EDGES, sb / EDGES)
        halo = RadialGradient(0f, 0f, 1f, intArrayOf(ColorUtils.setAlphaComponent(mean, 0xD0), ColorUtils.setAlphaComponent(mean, 0x60), Color.TRANSPARENT),
            floatArrayOf(0.35f, 0.62f, 1f), Shader.TileMode.CLAMP)
        invalidate()
    }

    /**
     * Цвет дыма в одну сторону — цвет самой обложки вдоль луча от её середины к краю в эту сторону.
     * Берётся только настоящий цвет: у тёмных и серых точек оттенок случайный (шум сжатия), раньше он раздувался
     * в яркий розовый/фиолетовый — и дым выглядел чужим. Если цвета на луче нет (чёрная, серая, чёрно-белая обложка) —
     * дым серебристый, без оттенка. Цвет приложения остаётся только там, где обложки нет вовсе.
     */
    private fun rayColor(small: Bitmap, a: Float): Int {
        var wr = 0f; var wg = 0f; var wb = 0f; var w = 0f; var lum = 0f; var n = 0; var top = 0
        var d = 0.10f
        while (d <= 0.48f) {
            val px = ((0.5f + d * cos(a)) * (GRID - 1)).toInt().coerceIn(0, GRID - 1)
            val py = ((0.5f + d * sin(a)) * (GRID - 1)).toInt().coerceIn(0, GRID - 1)
            val p = small.getPixel(px, py)
            val r = Color.red(p); val g = Color.green(p); val bl = Color.blue(p)
            val chroma = maxOf(r, g, bl) - minOf(r, g, bl)        // насколько точка цветная, 0..255
            top = maxOf(top, chroma)
            val k = (chroma * chroma).toFloat()
            wr += r * k; wg += g * k; wb += bl * k; w += k
            lum += (r * 0.3f + g * 0.59f + bl * 0.11f) / 255f; n++
            d += 0.04f
        }
        val hsv = FloatArray(3)
        if (top < NEUTRAL || w <= 0f) {
            // Цвета нет: серебристый дым, светлее на светлой обложке.
            hsv[0] = 0f; hsv[1] = 0f; hsv[2] = (0.62f + 0.33f * (lum / maxOf(1, n))).coerceIn(0.62f, 0.95f)
            return Color.HSVToColor(hsv)
        }
        Color.colorToHSV(Color.rgb((wr / w).toInt(), (wg / w).toInt(), (wb / w).toInt()), hsv)
        // Тот же оттенок, только светлее — чтобы дым был виден на тёмном фоне.
        hsv[1] = minOf(1f, hsv[1] * 1.1f); hsv[2] = hsv[2].coerceIn(0.74f, 1f)
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
        // Дым течёт в такт: между ударами еле плывёт, на ударе — рывком расходится от обложки.
        if (playing) clock += dt * (0.5f + 2.8f * shown)
        val target = if (playing) 1f else 0.4f
        level += (target - level) * minOf(1f, dt * 2.2f)
        val t = clock
        // Пульс: мягкий удар примерно раз в 1,3 секунды — дым вспыхивает и чуть расширяется.
        // Под ритм музыки: удары берутся из самого звука (см. Exciter.beatNow). Нет данных — мягкий собственный пульс.
        val heard = if (playing) Exciter.beatNow() else null
        val beat = heard ?: (0.5f + 0.5f * sin(t * 4.8f)).let { it * it }
        // Сглаживаем вспышку, чтобы яркость не дёргалась: быстрый подъём, плавный спад.
        shown += (beat - shown) * (if (beat > shown) 0.75f else minOf(1f, dt * 5f))
        val pulse = 0.7f + 0.3f * shown
        // Сколько полос звучит сейчас (бас, середина, верх): от этого — ширина и густота дыма.
        val bands = if (playing) Exciter.bandsNow() else null
        for (i in 0..2) { val v = bands?.get(i) ?: 0f; bandShown[i] += (v - bandShown[i]) * minOf(1f, dt * (if (v > bandShown[i]) 12f else 3f)) }
        val rich = bandShown.count { it > 0.3f }                      // 0..3
        val fullness = (bandShown[0] + bandShown[1] + bandShown[2]) / 3f
        // Новые ноты — новые клубы.
        if (playing && bands != null) {
            val fresh = Exciter.notesAfter(lastNote)
            for ((at, band, power) in fresh) {
                lastNote = maxOf(lastNote, at)
                val n = if (rich >= 2 && band == 0) 2 else 1          // богатый звук — на удар баса сразу два облака
                repeat(n) {
                    billowNo++
                    val width = (when (band) { 0 -> 0.9f; 1 -> 0.65f; else -> 0.45f }) * (0.7f + 0.3f * rich)
                    billows += Billow(now, rnd(billowNo, 1, 11) * 2 * PI.toFloat(), 0.55f + 0.45f * power,
                        (rnd(billowNo, 2, 12) - 0.5f) * 0.8f, band, width, billowNo)
                }
            }
            while (billows.size > 28) billows.removeFirst()
        }

        // Ореол вплотную к обложке — из него «выходит» дым.
        halo?.let { h ->
            paint.shader = h
            paint.alpha = (255 * 0.55f * level * pulse).toInt().coerceIn(0, 255)
            canvas.save(); canvas.translate(cx, cy)
            val hs = radius * (1.6f + 0.4f * shown + 0.25f * bandShown[0])
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
            val size = radius * (0.55f + 1.25f * out) * (0.85f + 0.3f * rnd(i, life, 7)) * (0.9f + 0.4f * fullness)
            val fade = minOf(1f, age * 7f) * (1f - age) * (1f - age * 0.35f)
            val alpha = minOf(0.75f, fade * 1.1f * level * pulse * (0.85f + 0.3f * fullness))
            if (alpha <= 0.01f) continue
            val idx = ((dir / (2 * PI.toFloat()) * EDGES).toInt() % EDGES + EDGES) % EDGES
            // Клуб — два смещённых вытянутых пятна: неровная форма, как у дыма, а не ровный круг.
            val turn = Math.toDegrees(a.toDouble()).toFloat() + 90f + 40f * sin(age * 3f + i)
            for (k in 0..1)
                layer(canvas, idx, alpha, x + (if (k == 0) -1 else 1) * size * 0.28f * cos(a + 1.3f), y + (if (k == 0) -1 else 1) * size * 0.28f * sin(a + 1.3f),
                    turn + k * 55f, size * (1.15f - 0.2f * k), size * (0.7f + 0.15f * k))
        }
        // Клубы от нот: несколько мягких облаков веером, растут и расплываются, накладываясь друг на друга.
        val it = billows.iterator()
        while (it.hasNext()) {
            val j = it.next()
            val life = when (j.band) { 0 -> 2600f; 1 -> 2000f; else -> 1500f }
            val p = (now - j.at) / life
            if (p >= 1f) { it.remove(); continue }
            val out = 1f - (1f - p) * (1f - p)
            val reach = (far - radius) * j.power * (if (j.band == 2) 0.9f else 0.75f)
            val scale = when (j.band) { 0 -> 1.25f; 1 -> 0.95f; else -> 0.7f } * (0.85f + 0.3f * fullness)
            val parts = 3 + j.band.let { if (it == 0) 2 else 1 }
            for (k in 0 until parts) {
                val spread = (k / (parts - 1f) - 0.5f) * j.width * (0.6f + 0.6f * out)   // веер расходится по мере полёта
                val a = j.dir + spread + j.bend * out + 0.15f * sin(p * 5f + j.seed + k)
                val d = radius * 0.85f + reach * out * (0.8f + 0.25f * rnd(j.seed, k, 13))
                val size = radius * scale * (0.45f + 1.35f * out) * (0.8f + 0.4f * rnd(j.seed, k, 14))
                val alpha = minOf(0.75f, minOf(1f, p * 6f) * (1f - p) * (1f - p * 0.5f) * 0.95f * level)
                if (alpha <= 0.01f) continue
                val idx = ((a / (2 * PI.toFloat()) * EDGES).toInt() % EDGES + EDGES) % EDGES
                layer(canvas, idx, alpha, cx + cos(a) * d, cy + sin(a) * d - radius * 0.3f * out,
                    Math.toDegrees(a.toDouble()).toFloat() + 30f * sin(p * 3f + k), size * 1.15f, size)
            }
        }
        if (playing || billows.isNotEmpty() || kotlin.math.abs(level - target) > 0.01f) postInvalidateOnAnimation()
    }

    /** Один слой дыма: сначала тень чуть ниже (отделяет от того, что под ним), затем само облако с ободком и контуром. */
    private fun layer(canvas: Canvas, idx: Int, alpha: Float, x: Float, y: Float, rot: Float, sx: Float, sy: Float) {
        paint.shader = shadow
        paint.alpha = (alpha * 0.7f * 255).toInt().coerceIn(0, 255)
        canvas.save(); canvas.translate(x + sx * 0.06f, y + sy * 0.14f); canvas.rotate(rot); canvas.scale(sx * 1.05f, sy * 1.05f)
        canvas.drawCircle(0f, 0f, 1f, paint); canvas.restore()
        paint.shader = shaders[idx]
        paint.alpha = (alpha * 255).toInt().coerceIn(0, 255)
        canvas.save(); canvas.translate(x, y); canvas.rotate(rot); canvas.scale(sx, sy)
        canvas.drawCircle(0f, 0f, 1f, paint); canvas.restore()
    }

    companion object {
        private const val COUNT = 30
        private const val EDGES = 12
        private const val GRID = 24
        private const val NEUTRAL = 34   // ниже этой «цветности» точка считается серой
    }
}
