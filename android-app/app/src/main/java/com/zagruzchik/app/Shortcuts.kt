package com.zagruzchik.app

import android.content.Context
import android.content.Intent
import androidx.core.content.pm.ShortcutInfoCompat
import androidx.core.content.pm.ShortcutManagerCompat
import androidx.core.graphics.drawable.IconCompat

/**
 * Быстрые кнопки «Загрузчик: скачать» и «Загрузчик: где послушать» в верхнем ряду меню «Поделиться».
 * Android сам решает, показывать ли их там (чаще — если приложением пользуются).
 */
object Shortcuts {
    const val CATEGORY = "com.zagruzchik.app.category.SHARE"
    const val ID_DOWNLOAD = "share_download"
    const val ID_LINKS = "share_links"

    fun publish(ctx: Context) {
        runCatching {
            val list = listOf(
                info(ctx, ID_DOWNLOAD, "Скачать", "Скачать видео или музыку", R.drawable.ic_shortcut_download),
                info(ctx, ID_LINKS, "Где послушать", "Ссылки на песню в других сервисах", R.drawable.ic_shortcut_links),
            )
            ShortcutManagerCompat.addDynamicShortcuts(ctx, list)
        }
    }

    private fun info(ctx: Context, id: String, short: String, long: String, icon: Int) =
        ShortcutInfoCompat.Builder(ctx, id)
            .setShortLabel(short)
            .setLongLabel(long)
            .setIcon(IconCompat.createWithResource(ctx, icon))
            .setIntent(Intent(Intent.ACTION_DEFAULT).setClass(ctx, ShareActivity::class.java))
            .setCategories(setOf(CATEGORY))
            .setLongLived(true)
            .build()
}
