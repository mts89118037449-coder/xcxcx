package com.zagruzchik.app

import android.content.Context
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

// Небольшие помощники, чтобы собирать экраны кодом без XML-разметки.

fun Context.dp(v: Int) = (v * resources.displayMetrics.density).toInt()

/** Цвет из темы. TypedArray.getColor правильно раскрывает и обычные цвета, и списки цветов (как textColorPrimary). */
fun Context.themeColor(attr: Int): Int {
    val a = obtainStyledAttributes(intArrayOf(attr))
    try {
        return a.getColor(0, Color.GRAY)
    } finally {
        a.recycle()
    }
}

val ACCENT = Color.parseColor("#0E7490")

fun Context.isNight() =
    (resources.configuration.uiMode and android.content.res.Configuration.UI_MODE_NIGHT_MASK) == android.content.res.Configuration.UI_MODE_NIGHT_YES

/** Цвет текста-ссылок: в тёмной теме светлее, чтобы читался. */
fun Context.accentText() = if (isNight()) Color.parseColor("#67D4EA") else ACCENT

fun Context.errorText() = if (isNight()) Color.parseColor("#F87171") else Color.parseColor("#DC2626")

fun Context.column(padding: Int = 20) = LinearLayout(this).apply {
    orientation = LinearLayout.VERTICAL
    setPadding(dp(padding), dp(padding), dp(padding), dp(padding))
}

fun Context.text(s: String, sizeSp: Float = 15f, bold: Boolean = false, muted: Boolean = false) = TextView(this).apply {
    text = s
    textSize = sizeSp
    if (bold) setTypeface(typeface, android.graphics.Typeface.BOLD)
    setTextColor(themeColor(android.R.attr.textColorPrimary))
    if (muted) alpha = 0.7f
    setPadding(0, dp(4), 0, dp(4))
}

fun Context.button(label: String, primary: Boolean = true, onClick: (View) -> Unit) = Button(this).apply {
    text = label
    isAllCaps = false
    textSize = 16f
    gravity = Gravity.CENTER
    minHeight = dp(52)
    background = GradientDrawable().apply {
        cornerRadius = dp(14).toFloat()
        if (primary) setColor(ACCENT) else {
            setColor(Color.TRANSPARENT)
            setStroke(dp(1), ACCENT)
        }
    }
    setTextColor(if (primary) Color.WHITE else themeColor(android.R.attr.textColorPrimary))
    backgroundTintList = null
    stateListAnimator = null
    setOnClickListener(onClick)
    layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
        .apply { topMargin = dp(10) }
}

fun Context.spacer(h: Int) = View(this).apply {
    layoutParams = LinearLayout.LayoutParams(1, dp(h))
}

