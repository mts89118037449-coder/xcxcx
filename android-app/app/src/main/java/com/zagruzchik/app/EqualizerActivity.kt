package com.zagruzchik.app

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Path
import android.graphics.Shader
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.util.AttributeSet
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.widget.HorizontalScrollView
import android.widget.ImageButton
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.res.ResourcesCompat
import com.google.android.material.color.MaterialColors
import com.google.android.material.materialswitch.MaterialSwitch
import com.google.android.material.slider.Slider
import kotlin.math.abs

/** Кривая эквалайзера: 5 точек, тянутся пальцем вверх-вниз; линия и заливка — аурой. */
class EqCurveView @JvmOverloads constructor(ctx: Context, attrs: AttributeSet? = null) : View(ctx, attrs) {
    var gains = FloatArray(5)
        set(v) { field = v.copyOf(); invalidate() }
    var onChange: ((FloatArray, Boolean) -> Unit)? = null // (кривая, отпустили ли палец)
    var active = true
        set(v) { field = v; invalidate() }

    private val line = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeWidth = ctx.dp(3).toFloat(); strokeCap = Paint.Cap.ROUND }
    private val fill = Paint(Paint.ANTI_ALIAS_FLAG)
    private val grid = Paint(Paint.ANTI_ALIAS_FLAG).apply { strokeWidth = ctx.dp(1).toFloat(); color = 0x1FFFFFFF }
    private val dot = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.WHITE }
    private var drag = -1

    private fun x(i: Int) = paddingLeft + (width - paddingLeft - paddingRight) * (i / 4f)
    private fun y(db: Float) = paddingTop + (height - paddingTop - paddingBottom) * (0.5f - db / (2 * AudioFx.MAX_DB))
    private fun db(y: Float) = ((0.5f - (y - paddingTop) / (height - paddingTop - paddingBottom).toFloat()) * 2 * AudioFx.MAX_DB).coerceIn(-AudioFx.MAX_DB, AudioFx.MAX_DB)

    init { val p = ctx.dp(18); setPadding(p, p, p, p) }

    override fun onDraw(c: Canvas) {
        listOf(-AudioFx.MAX_DB, 0f, AudioFx.MAX_DB).forEach { c.drawLine(paddingLeft.toFloat(), y(it), (width - paddingRight).toFloat(), y(it), grid) }
        for (i in 0..4) c.drawLine(x(i), paddingTop.toFloat(), x(i), (height - paddingBottom).toFloat(), grid)
        // Плавная кривая через точки (кубические сплайны по середине отрезков).
        val path = Path()
        path.moveTo(x(0), y(gains[0]))
        for (i in 0 until 4) {
            val mx = (x(i) + x(i + 1)) / 2
            path.cubicTo(mx, y(gains[i]), mx, y(gains[i + 1]), x(i + 1), y(gains[i + 1]))
        }
        val c1 = AuraColors.c1(context); val c2 = AuraColors.c2(context); val c3 = AuraColors.c3(context)
        val alpha = if (active) 255 else 90
        line.shader = LinearGradient(0f, 0f, width.toFloat(), 0f, intArrayOf(c1, c2, c3), null, Shader.TileMode.CLAMP)
        line.alpha = alpha
        val area = Path(path).apply { lineTo(x(4), (height - paddingBottom).toFloat()); lineTo(x(0), (height - paddingBottom).toFloat()); close() }
        fill.shader = LinearGradient(0f, paddingTop.toFloat(), 0f, (height - paddingBottom).toFloat(),
            intArrayOf(androidx.core.graphics.ColorUtils.setAlphaComponent(c2, if (active) 0x66 else 0x22), Color.TRANSPARENT), null, Shader.TileMode.CLAMP)
        c.drawPath(area, fill)
        c.drawPath(path, line)
        for (i in 0..4) {
            dot.color = if (i == drag) AuraColors.at(context, i / 4f) else Color.WHITE
            dot.alpha = alpha
            c.drawCircle(x(i), y(gains[i]), context.dp(if (i == drag) 11 else 8).toFloat(), dot)
        }
    }

    @SuppressLint("ClickableViewAccessibility")
    override fun onTouchEvent(e: MotionEvent): Boolean {
        when (e.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                drag = (0..4).minByOrNull { abs(x(it) - e.x) } ?: -1
                parent?.requestDisallowInterceptTouchEvent(true)
                gains[drag] = db(e.y); invalidate(); onChange?.invoke(gains.copyOf(), false)
            }
            MotionEvent.ACTION_MOVE -> if (drag >= 0) { gains[drag] = db(e.y); invalidate(); onChange?.invoke(gains.copyOf(), false) }
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> { drag = -1; invalidate(); onChange?.invoke(gains.copyOf(), true) }
        }
        return true
    }
}

/** Экран эквалайзера: вкл/выкл, пресеты, кривая (тянется пальцем), усиление баса, объём. */
class EqualizerActivity : AppCompatActivity() {
    private lateinit var curve: EqCurveView
    private lateinit var presets: LinearLayout
    private lateinit var bass: Slider
    private lateinit var virt: Slider
    private lateinit var sw: MaterialSwitch
    private lateinit var presetName: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val onSurface = MaterialColors.getColor(this, com.google.android.material.R.attr.colorOnSurface, Color.WHITE)
        val muted = MaterialColors.getColor(this, com.google.android.material.R.attr.colorOnSurfaceVariant, Color.GRAY)
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL; fitsSystemWindows = true
            setPadding(dp(20), dp(8), dp(20), dp(24))
            setBackgroundColor(MaterialColors.getColor(this, com.google.android.material.R.attr.colorSurface, Color.BLACK))
        }
        val head = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
        head.addView(ImageButton(this).apply {
            setImageResource(R.drawable.ic_arrow_back); setColorFilter(onSurface); background = getDrawable(R.drawable.bg_round_button)
            contentDescription = "Назад"; setOnClickListener { finish() }
        }, LinearLayout.LayoutParams(dp(44), dp(44)))
        head.addView(TextView(this).apply {
            text = "Эквалайзер"; textSize = 24f; setTextColor(onSurface); typeface = ResourcesCompat.getFont(this@EqualizerActivity, R.font.onest_bold)
            setPadding(dp(14), 0, 0, 0)
        }, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        sw = MaterialSwitch(this).apply { contentDescription = "Включить эквалайзер" }
        head.addView(sw)
        root.addView(head)

        presetName = TextView(this).apply { textSize = 14f; setTextColor(muted); setPadding(0, dp(14), 0, dp(4)) }
        root.addView(presetName)

        curve = EqCurveView(this).apply { background = getDrawable(R.drawable.bg_card) }
        root.addView(curve, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(220)).apply { topMargin = dp(6) })
        val labels = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; setPadding(dp(4), dp(6), dp(4), 0) }
        AudioFx.LABELS.forEach { l -> labels.addView(TextView(this).apply { text = l; textSize = 11f; setTextColor(muted); gravity = Gravity.CENTER }, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)) }
        root.addView(labels)

        root.addView(TextView(this, null, 0, R.style.SectionTitle).apply { text = "Пресеты" })
        presets = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        root.addView(HorizontalScrollView(this).apply { isHorizontalScrollBarEnabled = false; addView(presets) })

        fun slider(title: String): Slider {
            root.addView(TextView(this, null, 0, R.style.SectionTitle).apply { text = title })
            return Slider(this).apply {
                valueFrom = 0f; valueTo = 1000f; stepSize = 50f; isTickVisible = false
                trackActiveTintList = android.content.res.ColorStateList.valueOf(AuraColors.c2(this@EqualizerActivity))
                thumbTintList = android.content.res.ColorStateList.valueOf(Color.WHITE)
                setLabelFormatter { "${(it / 10).toInt()}%" }
            }.also { root.addView(it) }
        }
        bass = slider("Усиление баса")
        virt = slider("Объём (3D-звук)")
        // ---- Звук: громкость, верхи, стыки ----
        root.addView(TextView(this, null, 0, R.style.SectionTitle).apply { text = "Звук" })
        fun toggle(title: String, hint: String, checked: Boolean, onChange: (Boolean) -> Unit) {
            val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL; setPadding(0, dp(8), 0, dp(8)) }
            val col = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
            col.addView(TextView(this).apply { text = title; textSize = 16f; setTextColor(onSurface) })
            col.addView(TextView(this).apply { text = hint; textSize = 13f; setTextColor(muted); setPadding(0, dp(2), dp(12), 0) })
            row.addView(col, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
            row.addView(MaterialSwitch(this).apply { isChecked = checked; setOnCheckedChangeListener { _, on -> onChange(on) } })
            root.addView(row)
        }
        toggle("Выравнивание громкости", "Тихие песни громче, громкие тише — не нужно крутить громкость между песнями", AudioFx.leveling(this)) { AudioFx.setLeveling(this, it) }
        toggle("Вырезать тишину", "Следующая песня начинается без паузы. Заодно укорачиваются паузы внутри песен — если это мешает, выключите", AudioFx.skipSilence(this)) { AudioFx.setSkipSilence(this, it) }
        root.addView(TextView(this).apply { text = "Восстановление верхов"; textSize = 16f; setTextColor(onSurface); setPadding(0, dp(10), 0, 0) })
        root.addView(TextView(this).apply {
            text = "Добавляет яркости записям, у которых сжатие срезало верхние частоты. На хороших записях лучше выключить."
            textSize = 13f; setTextColor(muted); setPadding(0, dp(2), 0, dp(6))
        })
        val exLevels = listOf("Выключено", "Легко", "Сильнее")
        val exRow = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        fun drawEx() {
            exRow.removeAllViews()
            exLevels.forEachIndexed { i, name ->
                val sel = AudioFx.exciter(this) == i
                exRow.addView(TextView(this).apply {
                    text = name; textSize = 14f; setTextColor(if (sel) Color.WHITE else onSurface)
                    setPadding(dp(16), dp(9), dp(16), dp(9))
                    background = if (sel) AuraColors.drawable(this@EqualizerActivity, dp(18).toFloat(), GradientDrawable.Orientation.LEFT_RIGHT)
                    else GradientDrawable().apply { cornerRadius = dp(18).toFloat(); setStroke(dp(1), androidx.core.content.ContextCompat.getColor(this@EqualizerActivity, R.color.line)) }
                    setOnClickListener { AudioFx.setExciter(this@EqualizerActivity, i); drawEx() }
                }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { rightMargin = dp(8) })
            }
        }
        drawEx()
        root.addView(exRow)
        root.addView(TextView(this).apply {
            text = "Работает для музыки в приложении. При трансляции на ТВ звук настраивается на самом устройстве."
            textSize = 13f; setTextColor(muted); setPadding(0, dp(16), 0, 0)
        })
        setContentView(androidx.core.widget.NestedScrollView(this).apply { addView(root) })

        sw.setOnCheckedChangeListener { _, on -> AudioFx.setEnabled(this, on); render() }
        curve.onChange = { g, done -> if (done) { AudioFx.setGains(this, g); render() } else AudioFx.setGains(this, g) }
        bass.addOnSliderTouchListener(object : Slider.OnSliderTouchListener {
            override fun onStartTrackingTouch(s: Slider) {}
            override fun onStopTrackingTouch(s: Slider) { AudioFx.setBass(this@EqualizerActivity, s.value.toInt()); render() }
        })
        virt.addOnSliderTouchListener(object : Slider.OnSliderTouchListener {
            override fun onStartTrackingTouch(s: Slider) {}
            override fun onStopTrackingTouch(s: Slider) { AudioFx.setVirt(this@EqualizerActivity, s.value.toInt()); render() }
        })
        render()
    }

    private fun render() {
        val on = AudioFx.enabled(this)
        sw.isChecked = on
        curve.gains = AudioFx.gains(this)
        curve.active = on
        bass.value = AudioFx.bass(this).coerceIn(0, 1000).toFloat()
        virt.value = AudioFx.virt(this).coerceIn(0, 1000).toFloat()
        val current = AudioFx.preset(this)
        presetName.text = if (on) "Пресет: $current" else "Выключен — включите переключателем или выберите пресет"
        presets.removeAllViews()
        (AudioFx.PRESETS.map { it.name } + AudioFx.CUSTOM).forEach { name ->
            val sel = on && name == current
            presets.addView(TextView(this).apply {
                text = name; textSize = 14f
                typeface = ResourcesCompat.getFont(this@EqualizerActivity, if (sel) R.font.onest_semibold else R.font.onest_regular)
                setTextColor(if (sel) Color.WHITE else MaterialColors.getColor(this, com.google.android.material.R.attr.colorOnSurface, Color.WHITE))
                setPadding(dp(16), dp(9), dp(16), dp(9))
                background = if (sel) AuraColors.drawable(this@EqualizerActivity, dp(18).toFloat(), GradientDrawable.Orientation.LEFT_RIGHT)
                else GradientDrawable().apply { cornerRadius = dp(18).toFloat(); setStroke(dp(1), androidx.core.content.ContextCompat.getColor(this@EqualizerActivity, R.color.line)) }
                setOnClickListener {
                    AudioFx.PRESETS.firstOrNull { it.name == name }?.let { AudioFx.applyPreset(this@EqualizerActivity, it) }
                        ?: AudioFx.setEnabled(this@EqualizerActivity, true)
                    render()
                }
            }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { rightMargin = dp(8) })
        }
    }
}
