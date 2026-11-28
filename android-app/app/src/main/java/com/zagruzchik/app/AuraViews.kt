package com.zagruzchik.app

import android.animation.ValueAnimator
import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.SweepGradient
import android.graphics.drawable.GradientDrawable
import android.util.AttributeSet
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.content.ContextCompat
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.sin

/** Фирменные цвета ауры и общие кисти. */
object AuraColors {
    fun c1(ctx: Context) = ContextCompat.getColor(ctx, R.color.aura1)
    fun c2(ctx: Context) = ContextCompat.getColor(ctx, R.color.aura2)
    fun c3(ctx: Context) = ContextCompat.getColor(ctx, R.color.aura3)

    /** Градиент ауры для фона кнопок/плашек (скругление [radius] px). */
    fun drawable(ctx: Context, radius: Float, angle: GradientDrawable.Orientation = GradientDrawable.Orientation.TL_BR) =
        GradientDrawable(angle, intArrayOf(c1(ctx), c2(ctx), c3(ctx))).apply { cornerRadius = radius }

    fun mix(a: Int, b: Int, t: Float) = androidx.core.graphics.ColorUtils.blendARGB(a, b, t.coerceIn(0f, 1f))

    /** Цвет ауры в точке [t] от 0 до 1. */
    fun at(ctx: Context, t: Float) = if (t < 0.5f) mix(c1(ctx), c2(ctx), t * 2) else mix(c2(ctx), c3(ctx), (t - 0.5f) * 2)
}

/** Перемотка, общая для «кольца» и «волны». Доли от 0 до 1. */
interface AuraSeek {
    var progress: Float
    var onScrub: ((Float) -> Unit)?
    var onSeek: ((Float) -> Unit)?
    val isScrubbing: Boolean
    /** Цвет бегунка — основной акцент обложки. null — фирменные цвета приложения. */
    var accent: Int?
}

/** Три оттенка одного цвета (темнее → сам → светлее) — вместо фирменного градиента. */
private fun shades(c: Int) = intArrayOf(AuraColors.mix(c, Color.BLACK, 0.22f), c, AuraColors.mix(c, Color.WHITE, 0.28f))

/**
 * Кольцо прогресса ауры: дорожка + градиентная дуга, с ручкой и перемоткой пальцем по кругу
 * (вариант плеера «Кольцо»), или тонкое кольцо вокруг кнопки мини-плеера.
 */
class RingProgressView @JvmOverloads constructor(ctx: Context, attrs: AttributeSet? = null) : View(ctx, attrs), AuraSeek {
    var stroke = ctx.dp(6).toFloat()
    var knob = true
    var seekable = true
    override var progress = 0f
        set(v) { field = v.coerceIn(0f, 1f); invalidate() }
    override var onScrub: ((Float) -> Unit)? = null
    override var onSeek: ((Float) -> Unit)? = null
    override var isScrubbing = false; private set

    override var accent: Int? = null
        set(v) { if (field != v) { field = v; invalidate() } }
    private val track = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; color = 0x24FFFFFF }
    private val arc = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeCap = Paint.Cap.ROUND }
    private val knobPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.WHITE }
    private val box = RectF()
    private val arcMatrix = android.graphics.Matrix()
    private var shaderW = -1
    private var shaderH = -1
    private var shaderAccent: Int? = null

    fun trackColor(c: Int) { track.color = c; invalidate() }

    override fun onDraw(canvas: Canvas) {
        val pad = stroke / 2 + (if (knob) stroke * 0.9f else 0f)
        box.set(pad, pad, width - pad, height - pad)
        track.strokeWidth = stroke; arc.strokeWidth = stroke
        canvas.drawOval(box, track)
        val cx = width / 2f; val cy = height / 2f
        if (shaderW != width || shaderH != height || shaderAccent != accent) {
            shaderW = width; shaderH = height; shaderAccent = accent
            val g = accent?.let { shades(it) } ?: intArrayOf(AuraColors.c1(context), AuraColors.c2(context), AuraColors.c3(context))
            arcMatrix.setRotate(-90f, cx, cy)
            arc.shader = SweepGradient(cx, cy, intArrayOf(g[0], g[1], g[2], g[0]), null)
                .apply { setLocalMatrix(arcMatrix) }
        }
        if (progress > 0f) canvas.drawArc(box, -90f, 360f * progress, false, arc)
        if (knob) {
            val a = (progress * 2 * PI - PI / 2).toFloat()
            val r = box.width() / 2
            canvas.drawCircle(cx + r * cos(a), cy + r * sin(a), stroke * 1.6f, knobPaint)
        }
    }

    @SuppressLint("ClickableViewAccessibility")
    override fun onTouchEvent(e: MotionEvent): Boolean {
        if (!seekable) return false
        val cx = width / 2f; val cy = height / 2f
        val dx = e.x - cx; val dy = e.y - cy
        val r = kotlin.math.sqrt(dx * dx + dy * dy)
        val outer = width / 2f
        fun fraction(): Float {
            var a = Math.toDegrees(atan2(dy.toDouble(), dx.toDouble())).toFloat() + 90f
            if (a < 0) a += 360f
            return a / 360f
        }
        when (e.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                // Только по самому кольцу, а не по обложке в середине.
                if (r < outer * 0.72f) return false
                isScrubbing = true; parent?.requestDisallowInterceptTouchEvent(true)
                progress = fraction(); onScrub?.invoke(progress)
            }
            MotionEvent.ACTION_MOVE -> if (isScrubbing) { progress = fraction(); onScrub?.invoke(progress) }
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> if (isScrubbing) {
                isScrubbing = false; progress = fraction(); onSeek?.invoke(progress)
            }
        }
        return true
    }
}

/**
 * Перемотка «волной»: столбики звука, сыгранная часть — градиентом ауры, текущее место — белым.
 * Рисунок волны свой у каждой песни ([seed]).
 */
class WaveSeekView @JvmOverloads constructor(ctx: Context, attrs: AttributeSet? = null) : View(ctx, attrs), AuraSeek {
    override var progress = 0f
        set(v) { field = v.coerceIn(0f, 1f); invalidate() }
    override var onScrub: ((Float) -> Unit)? = null
    override var onSeek: ((Float) -> Unit)? = null
    override var isScrubbing = false; private set
    var seed: Int = 0
        set(v) { field = v; heights = makeHeights(); invalidate() }
    var idleColor = 0x2EFFFFFF
    override var accent: Int? = null
        set(v) { if (field != v) { field = v; invalidate() } }

    private val bar = Paint(Paint.ANTI_ALIAS_FLAG)
    private val rect = RectF()
    private val count = 48
    private var heights = makeHeights()

    private fun makeHeights(): FloatArray {
        val r = java.util.Random(seed.toLong())
        var prev = 0.5f
        return FloatArray(count) {
            // Плавная «музыкальная» волна: соседние столбики похожи, местами пики.
            prev = (prev * 0.55f + r.nextFloat() * 0.45f + (if (r.nextInt(7) == 0) 0.25f else 0f)).coerceIn(0.18f, 1f)
            prev
        }
    }

    override fun onDraw(canvas: Canvas) {
        val gap = context.dp(3).toFloat()
        val w = (width - gap * (count - 1)) / count
        val played = (progress * count).toInt()
        val tones = accent?.let { shades(it) }
        for (i in 0 until count) {
            val h = height * heights[i]
            val x = i * (w + gap)
            rect.set(x, (height - h) / 2, x + w, (height + h) / 2)
            bar.color = when {
                i == played -> Color.WHITE
                i < played -> (i / maxOf(1f, played - 1f)).let { t ->
                    tones?.let { g -> if (t < 0.5f) AuraColors.mix(g[0], g[1], t * 2) else AuraColors.mix(g[1], g[2], (t - 0.5f) * 2) } ?: AuraColors.at(context, t)
                }
                else -> idleColor
            }
            canvas.drawRoundRect(rect, w / 2, w / 2, bar)
        }
    }

    @SuppressLint("ClickableViewAccessibility")
    override fun onTouchEvent(e: MotionEvent): Boolean {
        val f = (e.x / width).coerceIn(0f, 1f)
        when (e.actionMasked) {
            MotionEvent.ACTION_DOWN -> { isScrubbing = true; parent?.requestDisallowInterceptTouchEvent(true); progress = f; onScrub?.invoke(f) }
            MotionEvent.ACTION_MOVE -> { progress = f; onScrub?.invoke(f) }
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> { isScrubbing = false; progress = f; onSeek?.invoke(f) }
        }
        return true
    }
}

/** «Играет сейчас»: три столбика из иконки, пляшут, пока играет музыка. */
class EqBarsView @JvmOverloads constructor(ctx: Context, attrs: AttributeSet? = null) : View(ctx, attrs) {
    private val p = Paint(Paint.ANTI_ALIAS_FLAG)
    private val r = RectF()
    private var t = 0f
    private val anim = ValueAnimator.ofFloat(0f, (2 * PI).toFloat()).apply {
        duration = 1100; repeatCount = ValueAnimator.INFINITE; interpolator = android.view.animation.LinearInterpolator()
        addUpdateListener { t = it.animatedValue as Float; invalidate() }
    }

    fun playing(on: Boolean) {
        if (on && !anim.isStarted) anim.start()
        if (!on && anim.isStarted) { anim.cancel(); t = 0.6f; invalidate() }
    }

    override fun onDetachedFromWindow() { anim.cancel(); super.onDetachedFromWindow() }

    override fun onDraw(canvas: Canvas) {
        val n = 3
        val gap = width * 0.18f
        val w = (width - gap * (n - 1)) / n
        for (i in 0 until n) {
            val k = 0.35f + 0.65f * abs(sin(t + i * 1.3f))
            val h = height * k
            val x = i * (w + gap)
            r.set(x, height - h, x + w, height.toFloat())
            p.color = AuraColors.at(context, i / (n - 1f))
            canvas.drawRoundRect(r, w / 2, w / 2, p)
        }
    }
}

/**
 * Нижнее меню — плавающая «таблетка»: у активной вкладки — градиент ауры и подпись,
 * у остальных — только значок. Счётчик (активные загрузки) — точкой с числом.
 */
class PillNav @JvmOverloads constructor(ctx: Context, attrs: AttributeSet? = null) : LinearLayout(ctx, attrs) {
    class Item(val id: Int, val label: String, val icon: Int)

    private val items = mutableListOf<Item>()
    private val views = mutableMapOf<Int, LinearLayout>()
    private val badges = mutableMapOf<Int, TextView>()
    var selectedItemId: Int = 0
        set(v) { if (field != v) { field = v; paint(); listener?.invoke(v) } else { paint(); onReselect?.invoke(v) } }
    var listener: ((Int) -> Unit)? = null
    /** Нажали уже выбранную вкладку. */
    var onReselect: ((Int) -> Unit)? = null

    init {
        orientation = HORIZONTAL
        gravity = Gravity.CENTER_VERTICAL
        val pad = ctx.dp(6)
        setPadding(pad, 0, pad, 0)
        background = GradientDrawable().apply {
            cornerRadius = ctx.dp(24).toFloat()
            setColor(ContextCompat.getColor(ctx, R.color.nav_bg))
            setStroke(ctx.dp(1), ContextCompat.getColor(ctx, R.color.nav_line))
        }
        elevation = ctx.dp(8).toFloat()
    }

    fun setItems(list: List<Item>) {
        items.clear(); items += list; removeAllViews(); views.clear(); badges.clear()
        for (it in list) {
            val box = FrameLayout(context)
            val cell = LinearLayout(context).apply {
                orientation = HORIZONTAL; gravity = Gravity.CENTER
                setPadding(context.dp(12), 0, context.dp(14), 0)
                if ((resources.configuration.uiMode and android.content.res.Configuration.UI_MODE_TYPE_MASK) ==
                    android.content.res.Configuration.UI_MODE_TYPE_TELEVISION) {
                    setOnFocusChangeListener { _, focused ->
                        foreground = if (focused) GradientDrawable().apply {
                            cornerRadius = context.dp(20).toFloat()
                            setColor(Color.TRANSPARENT)
                            setStroke(context.dp(3), Color.WHITE)
                        } else null
                    }
                }
                contentDescription = it.label
                isClickable = true; isFocusable = true
                setOnClickListener { _ -> selectedItemId = it.id }
                addView(ImageView(context).apply { setImageResource(it.icon); layoutParams = LayoutParams(context.dp(22), context.dp(22)) })
                addView(TextView(context).apply {
                    text = it.label; textSize = 12.5f; setTextColor(Color.WHITE); maxLines = 1
                    typeface = androidx.core.content.res.ResourcesCompat.getFont(context, R.font.onest_semibold)
                    setPadding(context.dp(6), 0, 0, 0)
                })
            }
            box.addView(cell, FrameLayout.LayoutParams(FrameLayout.LayoutParams.WRAP_CONTENT, context.dp(46), Gravity.CENTER))
            val badge = TextView(context).apply {
                textSize = 10f; setTextColor(Color.WHITE); gravity = Gravity.CENTER; visibility = GONE
                background = AuraColors.drawable(context, context.dp(9).toFloat())
                setPadding(context.dp(4), 0, context.dp(4), 0)
            }
            box.addView(badge, FrameLayout.LayoutParams(FrameLayout.LayoutParams.WRAP_CONTENT, context.dp(18), Gravity.CENTER).apply {
                leftMargin = context.dp(14); bottomMargin = context.dp(18)
            })
            addView(box, LayoutParams(0, LayoutParams.MATCH_PARENT, 1f))
            views[it.id] = cell; badges[it.id] = badge
        }
        if (selectedItemId == 0 && list.isNotEmpty()) selectedItemId = list[0].id else paint()
    }

    fun setBadge(id: Int, count: Int) {
        badges[id]?.apply { visibility = if (count > 0) VISIBLE else GONE; text = count.toString() }
    }

    private fun paint() {
        val idle = ContextCompat.getColor(context, R.color.nav_idle)
        for (it in items) {
            val cell = views[it.id] ?: continue
            val on = it.id == selectedItemId
            val icon = cell.getChildAt(0) as ImageView
            val label = cell.getChildAt(1) as TextView
            label.visibility = if (on) VISIBLE else GONE
            icon.setColorFilter(if (on) Color.WHITE else idle)
            cell.background = if (on) AuraColors.drawable(context, context.dp(20).toFloat(), GradientDrawable.Orientation.LEFT_RIGHT) else null
            // Активная вкладка — шире, остальные делят место поровну.
            (cell.parent as View).layoutParams = (cell.parent as View).layoutParams.apply { (this as LayoutParams).weight = if (on) 2.8f else 1f }
        }
        requestLayout()
    }
}

/** Тонкая полоска прогресса (2dp) в градиенте ауры для мини-плеера. */
class AuraProgressLine @JvmOverloads constructor(ctx: Context, attrs: AttributeSet? = null) : View(ctx, attrs) {
    private val trackPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0x1AFFFFFF }
    private val fillPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    var progress: Float = 0f
        set(v) {
            val clamped = v.coerceIn(0f, 1f)
            if (field != clamped) {
                field = clamped
                invalidate()
            }
        }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        if (w > 0) {
            fillPaint.shader = LinearGradient(
                0f, 0f, w.toFloat(), 0f,
                intArrayOf(AuraColors.c1(context), AuraColors.c2(context), AuraColors.c3(context)),
                null,
                Shader.TileMode.CLAMP
            )
        }
    }

    override fun onDraw(c: Canvas) {
        val w = width.toFloat()
        val h = height.toFloat()
        if (w <= 0f || h <= 0f) return
        c.drawRect(0f, 0f, w, h, trackPaint)
        if (progress > 0f) {
            c.drawRect(0f, 0f, w * progress, h, fillPaint)
        }
    }
}
