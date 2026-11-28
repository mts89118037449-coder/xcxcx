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
    private var halo: Shader? = null
    // «Экран»: клубы, наложенные друг на друга, складываются в свет — дым яркий, но не выгорает в белое.
    // Обычное наложение, не «экран»: при сложении яркостей облака сливались в белую кашу. Теперь каждое облако — слой
    // поверх предыдущих: плотное тело, светлый ободок и тонкий тёмный контур, под ним — тень. Слои видно отдельно.
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)


    /** Струя: на каждый удар из обложки вырывается быстрый поток дыма в одну сторону. */
    /**
     * Клуб от ноты: широкое облако, которое выкатывается из обложки и тает. Бас — самые большие и медленные,
     * середина — средние, верх — поменьше и быстрее. Чем больше полос звучит разом, тем клубы шире и их больше —
     * они накладываются друг на друга.
     */
    private class Billow(val at: Long, val dir: Float, val power: Float, val bend: Float, val band: Int, val width: Float, val seed: Int) {
        /** Сколько живёт: короткая нота (полоса быстро стихла) — облако тает быстро. */
        val life = when (band) { 0 -> 1200f; 1 -> 950f; else -> 650f }
        /** Дополнительное угасание 1 → 0: короткая нота или лишнее облако тают плавно, а не исчезают и не «перескакивают». */
        var fade = 1f
        var fading = false
    }
    private val billows = ArrayDeque<Billow>()
    private var timeline = -1L
    private var splash = false
    private var lastNote = Long.MIN_VALUE
    private var billowNo = 0
    private val bandShown = FloatArray(3)
    private val lastSpawn = LongArray(3)

    private var cx = 0f; private var cy = 0f; private var radius = 0f
    private var clock = 0f          // «время дыма»: идёт только пока играет музыка
    private var last = 0L
    private var level = 0f          // общая яркость: плавно растёт при игре и гаснет на паузе
    private var shown = 0f          // текущая сила пульса на экране
    private var speed = 1f          // скорость течения дыма — меняется плавно (раньше рывком на каждом ударе)
    var playing = false
        set(v) { if (field != v) { field = v; last = SystemClock.uptimeMillis(); invalidate() } }

    init { setCover(null); isClickable = false }


    /** Дым сразу в полную силу и уже клубится (для заставки): без разгона с нуля. */
    fun warmStart() { splash = true; level = 1f; clock = 6f; playing = true; invalidate() }

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
        speed += ((0.6f + 1.6f * shown) - speed) * minOf(1f, dt * 4f)
        if (playing) clock += dt * speed
        val target = if (playing) 1f else 0.4f
        level += (target - level) * minOf(1f, dt * 2.2f)
        val t = clock
        if (timeline != BeatSink.timeline) {
            timeline = BeatSink.timeline
            lastNote = Long.MIN_VALUE
            lastSpawn.fill(0L)
            billows.clear()
            bandShown.fill(0f)
            shown = 0f
        }
        val beat = if (splash) (0.5f + 0.5f * sin(t * 4.8f)) else if (playing) Exciter.beatNow() ?: 0f else 0f
        // Сглаживаем вспышку, чтобы яркость не дёргалась: быстрый подъём, плавный спад.
        // Удар баса — чёткий толчок: подъём ~35 мс, спад ~150 мс (не дёргано, но и не размазано).
        shown += (beat - shown) * (if (beat > shown) minOf(1f, dt * 50f) else minOf(1f, dt * 12f))
        // Сколько полос звучит сейчас (бас, середина, верх): от этого — ширина и густота дыма.
        val bands = if (playing) Exciter.bandsNow() else null
        for (i in 0..2) { val v = bands?.get(i) ?: 0f; bandShown[i] += (v - bandShown[i]) * minOf(1f, dt * (if (v > bandShown[i]) 32f else 8f)) }
        val instrumental = maxOf(bandShown[1], bandShown[2]).coerceIn(0f, 1f)
        val pulse = 0.94f + 0.35f * shown
        val fullness = (2f * bandShown[0] + bandShown[1] + bandShown[2]) / 4f // бас весит вдвое
        // Новые ноты — новые клубы.
        if (playing && bands != null) {
            val fresh = Exciter.notesAfter(lastNote)
            val newest = fresh.lastOrNull()?.first ?: 0L
            for ((at, band, power) in fresh) {
                lastNote = maxOf(lastNote, at)
                if (newest - at > 300_000) continue // старые ноты (после паузы, первого кадра) — не выпускаем пачкой разом
                val gap = when (band) { 0 -> 180L; 1 -> 145L; else -> 110L }
                if (now - lastSpawn[band] < gap) continue
                lastSpawn[band] = now
                // Каждому диапазону своя область и свой запас клубов.
                if (billows.count { it.band == band && !it.fading } >= 3) {
                    billows.first { it.band == band && !it.fading }.fading = true
                }
                billowNo++
                val direction = when (band) { 0 -> PI / 2; 1 -> PI * 7 / 6; else -> PI * 11 / 6 }.toFloat()
                val spread = (rnd(billowNo, 1, 11) - 0.5f) * 0.85f
                val width = when (band) { 0 -> 0.7f; 1 -> 0.5f; else -> 0.32f }
                billows += Billow(now, direction + spread, 0.6f + 0.4f * power,
                    (rnd(billowNo, 2, 12) - 0.5f) * 0.35f, band, width, billowNo)
            }
        }

        val landscape = width > height
        val minDim = minOf(width, height).toFloat()
        val visualR = computeVisualRadius(width, height, radius)
        val farX = if (landscape) width * 0.56f else maxOf(width, height) * 0.62f
        val farY = if (landscape) height * 0.58f else maxOf(width, height) * 0.62f
        val stretchX = if (landscape) 1.15f else 1f

        // Ореол вплотную к обложке — из него «выходит» дым.
        halo?.let { h ->
            paint.shader = h
            paint.alpha = (255 * (0.54f + 0.46f * maxOf(shown, instrumental)) * level).toInt().coerceIn(0, 255)
            canvas.save(); canvas.translate(cx, cy)
            val haloR = maxOf(radius, visualR * 0.9f)
            val hs = haloR * (1.55f + 0.7f * shown + 0.2f * bandShown[0])
            canvas.scale(hs, hs); canvas.drawCircle(0f, 0f, 1f, paint); canvas.restore()
        }

        // Как далеко уплывает дым: эллиптический разлёт на широком экране ТВ и круглый в портрете.
        val startR = radius * 0.85f
        val maxMainSize = if (landscape) minDim * 0.58f else width * 0.45f
        val mainRiseCap = minOf(visualR * 1.4f, height * 0.20f)
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
            val factor = out * (0.55f + 0.45f * rnd(i, life, 6))
            val distX = startR + (farX - startR) * factor
            val distY = startR + (farY - startR) * factor
            val a = dir + drift * out + 0.25f * sin(age * 6.3f + i)
            val x = cx + cos(a) * distX
            val y = cy + sin(a) * distY - rise * mainRiseCap * out
            // Растёт и тает.
            val size = minOf(maxMainSize, visualR * (0.5f + 0.9f * out) * (0.85f + 0.3f * rnd(i, life, 7)) * (0.9f + 0.3f * fullness))
            val fade = minOf(1f, age * 7f) * (1f - age) * (1f - age * 0.35f)
            val alpha = minOf(0.9f, fade * 1.1f * level * pulse * (0.85f + 0.3f * fullness))
            if (alpha <= 0.01f) continue
            val idx = ((dir / (2 * PI.toFloat()) * EDGES).toInt() % EDGES + EDGES) % EDGES
            // Клуб — два смещённых вытянутых пятна: неровная форма, как у дыма, а не ровный круг.
            val turn = Math.toDegrees(a.toDouble()).toFloat() + 90f + 40f * sin(age * 3f + i)
            // Клуб — рваное облако, медленно закручивается, пока летит.
            // На ударе баса весь дым толкается наружу и светлеет.
            val kick = 1f + 0.15f * shown
            layer(canvas, idx, alpha, x, y, turn + age * 70f, size * 1.25f * kick * stretchX, size * 1.05f * kick, i * 7 + life, 0.12f + 0.3f * shown, shade = false)
        }
        // Клубы от нот: несколько мягких облаков веером, растут и расплываются, накладываясь друг на друга.
        val maxBillowSize = minDim * 0.65f
        val billowRiseCap = minOf(visualR * 0.35f, height * 0.08f)
        val it = billows.iterator()
        while (it.hasNext()) {
            val j = it.next()
            val age = now - j.at
            // Нота коротко прозвучала и стихла — облако плавно тает быстрее; тянется — живёт весь срок.
            if (age in 150..600 && bandShown[j.band] < 0.22f) j.fading = true
            if (j.fading) j.fade = maxOf(0f, j.fade - dt / 0.22f)
            val p = age / j.life
            if (p >= 1f || j.fade <= 0f) { it.remove(); continue }
            val out = 1f - (1f - p) * (1f - p)
            val pMul = j.power * (if (j.band == 2) 0.9f else 0.75f)
            val reachX = (farX - radius) * pMul
            val reachY = (farY - radius) * pMul
            val scale = when (j.band) { 0 -> 1.15f; 1 -> 0.85f; else -> 0.6f } * (0.85f + 0.3f * fullness) * (if (j.band == 0) 1f else 0.6f + 0.4f * j.power)
            val parts = if (j.band == 0) 4 else 3
            for (k in 0 until parts) {
                val spread = (k / (parts - 1f) - 0.5f) * j.width * (0.6f + 0.6f * out)   // веер расходится по мере полёта
                val a = j.dir + spread + j.bend * out + 0.15f * sin(p * 5f + j.seed + k)
                val dFactor = out * (0.8f + 0.25f * rnd(j.seed, k, 13))
                val dx = startR + reachX * dFactor
                val dy = startR + reachY * dFactor
                val size = minOf(maxBillowSize, visualR * scale * (0.45f + 1.35f * out) * (0.8f + 0.4f * rnd(j.seed, k, 14)))
                val alpha = minOf(if (j.band == 0) 0.95f else 0.88f, minOf(1f, (age + 16) / 45f) * (1f - p) * (1f - p * 0.5f) * (if (j.band == 0) 1.2f else (0.9f + 0.4f * bandShown[j.band]) * j.power) * level) * j.fade
                if (alpha <= 0.01f) continue
                val idx = ((a / (2 * PI.toFloat()) * EDGES).toInt() % EDGES + EDGES) % EDGES
                layer(canvas, idx, alpha, cx + cos(a) * dx, cy + sin(a) * dy - billowRiseCap * out,
                    Math.toDegrees(a.toDouble()).toFloat() + 60f * p + k * 90f, size * 1.3f * stretchX, size * 1.1f, j.seed * 3 + k,
                    if (j.band == 0) 0.3f * (1f - p) + 0.25f * shown else 0.28f + 0.22f * bandShown[j.band])
            }
        }
        if (playing || billows.isNotEmpty() || kotlin.math.abs(level - target) > 0.01f) postInvalidateOnAnimation()
    }

    private val spritePaint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)

    /**
     * Один клуб дыма: рваная текстура в цвет края обложки. Сначала лёгкая тень чуть ниже — она отделяет новый слой от
     * того, что под ним, — затем сам дым. Обычное наложение: новые клубы ложатся поверх старых, а не сливаются в белое.
     */
    private fun layer(canvas: Canvas, idx: Int, alpha: Float, x: Float, y: Float, rot: Float, sx: Float, sy: Float, seed: Int = idx, glow: Float = 0f,
                      shade: Boolean = true) {
        val sprite = SmokeSprites.all[(seed and 0x7fffffff) % 4]
        val k = SmokeSprites.HALF
        if (shade) drawShade(canvas, sprite, k, alpha, x, y, rot, sx, sy)
        spritePaint.color = if (glow > 0f) ColorUtils.blendARGB(edge[idx], Color.WHITE, glow.coerceAtMost(0.5f)) else edge[idx]
        spritePaint.alpha = (alpha * 255).toInt().coerceIn(0, 255)
        canvas.save(); canvas.translate(x, y); canvas.rotate(rot); canvas.scale(sx / k, sy / k)
        canvas.drawBitmap(sprite, -k, -k, spritePaint); canvas.restore()
    }

    private fun drawShade(canvas: Canvas, sprite: Bitmap, k: Float, alpha: Float, x: Float, y: Float, rot: Float, sx: Float, sy: Float) {
        spritePaint.color = Color.BLACK
        spritePaint.alpha = (alpha * 0.33f * 255).toInt().coerceIn(0, 255)
        canvas.save(); canvas.translate(x + sx * 0.06f, y + sy * 0.12f); canvas.rotate(rot); canvas.scale(sx / k * 1.05f, sy / k * 1.05f)
        canvas.drawBitmap(sprite, -k, -k, spritePaint); canvas.restore()
    }

    companion object {
        @JvmStatic internal fun computeVisualRadius(w: Int, h: Int, r: Float): Float {
            val minDim = minOf(w, h).toFloat()
            return if (w > h) maxOf(r, minDim * 0.28f) else r
        }

        // Меньше и мельче клубов: каждый — слой поверх всего экрана, и десятки таких слоёв на кадр давали зависания
        // при переходе в плеер (журнал 17.11: «ЗАВИСАНИЕ ИНТЕРФЕЙСА 2,5–7 с: HardwareRenderer»).
        private const val COUNT = 16
        private const val EDGES = 12
        private const val GRID = 24
        private const val NEUTRAL = 34   // ниже этой «цветности» точка считается серой
    }
}
