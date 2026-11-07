package com.zagruzchik.app

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapShader
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.Typeface
import android.text.Layout
import android.text.StaticLayout
import android.text.TextPaint
import android.text.TextUtils
import androidx.core.content.FileProvider
import java.io.File

/**
 * Карточка песни для мессенджеров: картинка (обложка, название, значки сервисов)
 * + текст со всеми ссылками. Получатель сразу видит, что за песня, и открывает в своём сервисе.
 */
object SongCard {
    private const val W = 1080
    private const val H = 1350

    fun render(t: Track, cover: Bitmap?, services: List<Service>): Bitmap {
        val bmp = Bitmap.createBitmap(W, H, Bitmap.Config.ARGB_8888)
        val c = Canvas(bmp)

        // Фон — градиент от основного цвета обложки к почти чёрному.
        val base = cover?.let { dominant(it) } ?: Color.parseColor("#0E5E5E")
        val top = blend(base, Color.BLACK, 0.25f)
        val bottom = blend(base, Color.BLACK, 0.85f)
        c.drawRect(0f, 0f, W.toFloat(), H.toFloat(), Paint().apply {
            shader = LinearGradient(0f, 0f, 0f, H.toFloat(), top, bottom, Shader.TileMode.CLAMP)
        })

        // Обложка со скруглёнными углами и мягкой тенью.
        val size = 660f
        val left = (W - size) / 2
        val coverRect = RectF(left, 110f, left + size, 110f + size)
        c.drawRoundRect(RectF(coverRect).apply { offset(0f, 18f) }, 48f, 48f, Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.argb(90, 0, 0, 0)
        })
        if (cover != null) {
            val scaled = Bitmap.createScaledBitmap(cover, size.toInt(), size.toInt(), true)
            c.drawRoundRect(coverRect, 48f, 48f, Paint(Paint.ANTI_ALIAS_FLAG).apply {
                shader = BitmapShader(scaled, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP).apply {
                    setLocalMatrix(android.graphics.Matrix().apply { setTranslate(left, 110f) })
                }
            })
        } else {
            c.drawRoundRect(coverRect, 48f, 48f, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = blend(base, Color.WHITE, 0.15f) })
            c.drawText("♪", W / 2f, coverRect.centerY() + 110f, Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = Color.WHITE; textSize = 320f; textAlign = Paint.Align.CENTER
            })
        }

        // Название и исполнитель.
        var y = coverRect.bottom + 70f
        y += drawText(c, t.title, y, 66f, Color.WHITE, bold = true, maxLines = 2)
        y += 10f
        if (t.artist.isNotEmpty()) y += drawText(c, t.artist, y, 44f, Color.argb(210, 255, 255, 255), bold = false, maxLines = 1)

        // Значки сервисов, где есть песня.
        val shown = services.take(8)
        val d = 84f
        val gap = 22f
        val rowW = shown.size * d + (shown.size - 1).coerceAtLeast(0) * gap
        var x = (W - rowW) / 2
        val cy = H - 190f
        for (s in shown) {
            val b = s.badge
            c.drawCircle(x + d / 2, cy, d / 2, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = b.color })
            c.drawText(b.text, x + d / 2, cy + 13f, Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = b.textColor; textSize = if (b.text.length > 1) 30f else 38f; textAlign = Paint.Align.CENTER
                typeface = Typeface.DEFAULT_BOLD
            })
            x += d + gap
        }
        c.drawText("Ссылки на все сервисы — в сообщении", W / 2f, H - 80f, Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.argb(170, 255, 255, 255); textSize = 34f; textAlign = Paint.Align.CENTER
        })
        return bmp
    }

    /** Отправить карточку (картинка + текст со ссылками) в мессенджер. */
    fun share(ctx: Context, t: Track, cover: Bitmap?, links: List<Transfer.Link>) {
        val text = Transfer.shareText(t, links)
        val dir = File(ctx.cacheDir, "share").apply { mkdirs() }
        val file = File(dir, "song.png")
        file.outputStream().use { render(t, cover, links.map { it.service }).compress(Bitmap.CompressFormat.PNG, 100, it) }
        val uri = FileProvider.getUriForFile(ctx, ctx.packageName + ".files", file)
        val send = Intent(Intent.ACTION_SEND)
            .setType("image/png")
            .putExtra(Intent.EXTRA_STREAM, uri)
            .putExtra(Intent.EXTRA_TEXT, text)
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        ctx.startActivity(Intent.createChooser(send, "Отправить карточку песни").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    private fun drawText(c: Canvas, text: String, y: Float, size: Float, color: Int, bold: Boolean, maxLines: Int): Float {
        val p = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
            this.color = color; textSize = size; typeface = if (bold) Typeface.DEFAULT_BOLD else Typeface.DEFAULT
        }
        val width = W - 160
        val layout = StaticLayout.Builder.obtain(text, 0, text.length, p, width)
            .setAlignment(Layout.Alignment.ALIGN_CENTER)
            .setMaxLines(maxLines)
            .setEllipsize(TextUtils.TruncateAt.END)
            .build()
        c.save()
        c.translate(80f, y)
        layout.draw(c)
        c.restore()
        return layout.height.toFloat()
    }

    private fun dominant(b: Bitmap): Int {
        val s = Bitmap.createScaledBitmap(b, 1, 1, true)
        return s.getPixel(0, 0)
    }

    private fun blend(a: Int, b: Int, t: Float) = Color.rgb(
        (Color.red(a) * (1 - t) + Color.red(b) * t).toInt(),
        (Color.green(a) * (1 - t) + Color.green(b) * t).toInt(),
        (Color.blue(a) * (1 - t) + Color.blue(b) * t).toInt(),
    )
}
