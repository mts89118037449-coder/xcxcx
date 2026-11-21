package com.zagruzchik.app

import android.graphics.Bitmap
import android.graphics.BitmapFactory

object SmokeSprites {
    const val HALF = 64f

    val all: Array<Bitmap> by lazy {
        val resources = App.instance.resources
        val ids = intArrayOf(R.drawable.smoke_mask_1, R.drawable.smoke_mask_2, R.drawable.smoke_mask_3, R.drawable.smoke_mask_4)
        Array(ids.size) { i ->
            val image = BitmapFactory.decodeResource(resources, ids[i])
            image.extractAlpha().also { image.recycle() }
        }
    }
}
