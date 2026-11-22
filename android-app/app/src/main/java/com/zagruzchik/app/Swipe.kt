package com.zagruzchik.app

import android.annotation.SuppressLint
import android.view.GestureDetector
import android.view.MotionEvent
import android.view.View
import kotlin.math.abs

/** Горизонтальный свайп по виду (обложка, мини-плеер). Нажатие при этом работает как раньше. */
object Swipe {
    @SuppressLint("ClickableViewAccessibility")
    fun attach(v: View, onRight: () -> Unit, onLeft: () -> Unit) {
        val min = v.context.dp(60)
        val d = GestureDetector(v.context, object : GestureDetector.SimpleOnGestureListener() {
            override fun onDown(e: MotionEvent) = true
            override fun onFling(e1: MotionEvent?, e2: MotionEvent, vx: Float, vy: Float): Boolean {
                val dx = e2.x - (e1?.x ?: return false)
                val dy = e2.y - e1.y
                if (abs(dx) < min || abs(dx) < abs(dy) * 1.5f) return false
                v.animate().translationX(if (dx > 0) min.toFloat() else -min.toFloat()).alpha(0.4f).setDuration(110).withEndAction {
                    v.translationX = 0f; v.alpha = 1f
                }.start()
                if (dx > 0) onRight() else onLeft()
                return true
            }
        })
        v.isClickable = true // иначе вид не получит движение пальца после касания
        v.setOnTouchListener { _, e -> d.onTouchEvent(e) && e.actionMasked != MotionEvent.ACTION_DOWN }
    }
}
