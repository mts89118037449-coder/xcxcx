package com.zagruzchik.app

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri

/**
 * Какие музыкальные приложения установлены на телефоне.
 * Чтобы Android показал их нам, они перечислены в <queries> в манифесте.
 */
object Installed {
    fun packageOf(ctx: Context, s: Service): String? =
        s.packages.firstOrNull { ctx.packageManager.getLaunchIntentForPackage(it) != null }

    fun has(ctx: Context, s: Service) = packageOf(ctx, s) != null

    fun all(ctx: Context): List<Service> = Service.entries.filter { has(ctx, it) }

    /** «Мой сервис»: выбранный в настройках, иначе первый установленный по популярности. */
    fun preferred(ctx: Context): Service? = Settings.myService(ctx) ?: Transfer.ORDER.firstOrNull { has(ctx, it) }

    /** Открывает ссылку прямо в приложении сервиса, если оно есть; иначе — как обычно (браузер/выбор). */
    fun open(ctx: Context, s: Service, url: String): Boolean {
        val base = Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        packageOf(ctx, s)?.let { pkg ->
            try {
                ctx.startActivity(Intent(base).setPackage(pkg))
                return true
            } catch (_: ActivityNotFoundException) {
                // Приложение не умеет открывать такие ссылки — откроем как обычно.
            }
        }
        return try {
            ctx.startActivity(base)
            true
        } catch (_: ActivityNotFoundException) {
            false
        }
    }
}
