package com.zagruzchik.app

import android.graphics.Bitmap
import android.graphics.Color
import kotlin.math.floor
import kotlin.math.sqrt

/**
 * Текстура дыма: рваное облако с завихрениями (шум с «закруткой»), края тают. Делается один раз — 4 варианта по 128×128.
 * Рисуется маской: цвет задаёт кисть, поэтому одна текстура годится для любого цвета обложки.
 * Те же формулы проверены отрисовкой на сервере (scratchpad/smoke_sprite.py).
 */
object SmokeSprites {
    private const val N = 128

    val all: Array<Bitmap> by lazy { Array(4) { make(it + 1) } }

    private fun hash(ix: Int, iy: Int, seed: Int): Float {
        var h = ix * 374761393 + iy * 668265263 + seed * 1274126177
        h = (h xor (h ushr 13)) * 1274126177
        return ((h xor (h ushr 16)) and 0xFFFF) / 65535f
    }

    private fun noise(x: Float, y: Float, seed: Int): Float {
        val ix = floor(x).toInt(); val iy = floor(y).toInt()
        val fx = x - ix; val fy = y - iy
        val u = fx * fx * (3 - 2 * fx); val v = fy * fy * (3 - 2 * fy)
        val a = hash(ix, iy, seed); val b = hash(ix + 1, iy, seed); val c = hash(ix, iy + 1, seed); val d = hash(ix + 1, iy + 1, seed)
        return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
    }

    private fun fbm(x: Float, y: Float, seed: Int): Float {
        var s = 0f; var amp = 0.5f; var f = 1f
        for (o in 0 until 4) { s += amp * noise(x * f, y * f, seed + o); f *= 2; amp *= 0.5f }
        return s
    }

    private fun make(seed: Int): Bitmap {
        val px = IntArray(N * N)
        for (j in 0 until N) for (i in 0 until N) {
            val x = i / N.toFloat() * 4f; val y = j / N.toFloat() * 4f
            val wx = fbm(x + 1.7f, y + 9.2f, seed + 10); val wy = fbm(x + 8.3f, y + 2.8f, seed + 20)
            val n = fbm(x + 2.5f * wx, y + 2.5f * wy, seed)
            val dx = i - N / 2 + 0.5f; val dy = j - N / 2 + 0.5f
            val r = sqrt(dx * dx + dy * dy) / (N / 2)
            val fall = Math.pow((1f - r).coerceIn(0f, 1f).toDouble(), 1.4).toFloat()
            val a = (((n - 0.32f) * 2.2f).coerceIn(0f, 1f) * fall * 1.6f).coerceIn(0f, 1f)
            px[j * N + i] = Color.argb((a * 255).toInt(), 255, 255, 255)
        }
        val argb = Bitmap.createBitmap(px, N, N, Bitmap.Config.ARGB_8888)
        return argb.extractAlpha().also { argb.recycle() }
    }

    const val HALF = N / 2f
}
