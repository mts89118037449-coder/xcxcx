package com.zagruzchik.app

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import com.yausername.youtubedl_android.YoutubeDL
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/**
 * «Проверка и журнал»: каждое звено по отдельности на этом телефоне — сеть, поиск, ссылка на звук и сами байты звука.
 * У каждого шага своё время и своя ошибка; ни один шаг не ждёт другого и не может зависнуть дольше предела.
 * Результат пишется в журнал ([AppLog]) — по нему видно, что именно не работает, без догадок.
 */
object Diagnostics {
    private val pool = Executors.newCachedThreadPool()
    private val SONGS = listOf(Track("Стилево", "Макс Корж", 110), Track("Numb", "Linkin Park", 185))

    fun run(ctx: Context, line: (String) -> Unit) {
        val out = StringBuilder("ПРОВЕРКА\n")
        fun say(s: String) { line(s); out.append(s).append('\n') }

        /** Шаг с пределом времени: «✓ имя — результат · N с» или «✗ имя — ошибка · N с». Возвращает результат. */
        fun <T> step(name: String, limitSec: Long = 15, block: () -> T): T? {
            val t = System.currentTimeMillis()
            val f = pool.submit<T> { block() }
            val r = runCatching { f.get(limitSec, TimeUnit.SECONDS) }
            if (r.isFailure) f.cancel(true)
            val sec = "%.1f с".format((System.currentTimeMillis() - t) / 1000.0)
            val e = r.exceptionOrNull()?.let { it.cause ?: it }
            say(if (e == null) "✓ $name — ${describe(r.getOrNull())} · $sec"
                else "✗ $name — ${if (e is java.util.concurrent.TimeoutException) "нет ответа за $limitSec с" else "${e.javaClass.simpleName}: ${e.message.orEmpty().take(160)}"} · $sec")
            return r.getOrNull()
        }

        // ---- 1. Сеть ----
        say("— Сеть —")
        runCatching {
            val cm = ctx.getSystemService(ConnectivityManager::class.java)
            val c = cm.getNetworkCapabilities(cm.activeNetwork)
            say("Сеть: " + listOfNotNull(
                "VPN".takeIf { c?.hasTransport(NetworkCapabilities.TRANSPORT_VPN) == true },
                "Wi‑Fi".takeIf { c?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true },
                "мобильная".takeIf { c?.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) == true },
            ).joinToString(" + ").ifEmpty { "нет" } + " · обычная сеть мимо VPN: ${if (Net.physical() != null) "есть" else "нет"} · YouTube напрямую: ${Net.youtubeDirect}")
        }
        // Доступность площадок: все разом, у каждой 8 секунд.
        val hosts = listOf(
            "Zaycev" to "https://zaycev.net/api/external/pages/search/tracks?q=test&page=1&limit=1",
            "Deezer (каталог)" to "https://api.deezer.com/search?q=test&limit=1",
            "YouTube" to "https://www.youtube.com/generate_204",
            "YouTube Music" to "https://music.youtube.com/generate_204",
            "SoundCloud (сайт)" to "https://soundcloud.com/robots.txt",
            "SoundCloud (API)" to "https://api-v2.soundcloud.com/",
            "Rutube" to "https://rutube.ru/api/search/video/?query=test",
            "Зеркало Piped" to "https://pipedapi.ducks.party/search?q=test&filter=music_songs",
        )
        hosts.map { (name, url) -> name to pool.submit<String> { ping(url) } }.forEach { (name, f) ->
            say(runCatching { f.get(9, TimeUnit.SECONDS) }.fold({ "✓ $name: $it" }, { e -> "✗ $name: ${(e.cause ?: e).let { x -> if (x is java.util.concurrent.TimeoutException) "нет ответа за 9 с" else x.javaClass.simpleName + " " + x.message.orEmpty().take(80) }}" }))
        }

        // ---- 2. Движок ----
        say("— Движок —")
        step("yt-dlp готов", 60) { App.awaitReady(); YoutubeDL.getInstance().versionName(ctx) ?: "встроенная версия" }

        // ---- 3. Каждая площадка: поиск → ссылка → байты ----
        for (t in SONGS) {
            say("— «${t.label}» —")
            step("Zaycev: поиск") { ZaycevSource.search(t.query).let { r -> r to Match.ranked(t, r) { Triple(it.title, it.artist, it.durationSec) } } }
                ?.second?.firstOrNull()?.let { c ->
                    step("Zaycev: ссылка") { ZaycevSource.streamUrl(c.id) ?: throw UserError("ссылку не дал") }?.let { u -> step("Zaycev: звук") { bytes(u) } }
                }
            val ytm = step("YouTube Music: поиск на телефоне", 10) { NewPipeSource.onDevice(t.query) }
            val ytmOk = ytm?.let { r -> Match.ranked(t, r) { Triple(it.title, it.artist, it.durationSec) }.firstOrNull() }
            step("YouTube Music: поиск через зеркало", 10) { NewPipeSource.searchSongs(t.query) }
            val yt = step("YouTube: поиск на телефоне", 10) { NewPipeSource.search(false, t.query) }
            val ytUrl = ytmOk?.url ?: yt?.let { r -> Match.ranked(t, r) { Triple(it.title, it.artist, it.durationSec) }.firstOrNull() }?.url
            if (ytUrl != null) {
                step("YouTube: звук на телефоне (${ytUrl.takeLast(11)})", 15) { NewPipeSource.audio(ytUrl) ?: throw UserError("звук не отдал") }
                    ?.let { a -> step("YouTube: байты (${a.format} ${a.kbps})") { bytes(a.url) } }
                step("YouTube: звук через yt-dlp", 40) { YtdlpDaemon.stream(ytUrl, "bestaudio")?.optJSONArray("urls")?.optString(0) ?: throw UserError("ссылку не дал") }
                    ?.let { u -> step("YouTube: байты (yt-dlp)") { bytes(u) } }
            } else say("  YouTube: звук не проверен — поиск не дал подходящей записи")
            step("YouTube: поиск через yt-dlp", 12) { Downloader.searchOrThrow("ytsearch6:${t.query}", "YouTube") }
            step("SoundCloud: поиск на телефоне", 10) { NewPipeSource.search(true, t.query) }
            val sc = step("SoundCloud: поиск через yt-dlp", 12) { Downloader.searchOrThrow("scsearch8:${t.query}", "SoundCloud") }
            sc?.let { r -> Match.ranked(t, r) { Triple(it.title, it.author, it.duration) }.firstOrNull() }?.let { c ->
                step("SoundCloud: ссылка (yt-dlp)", 25) { Downloader.streamOf(c.url, "SoundCloud", c.title) ?: throw UserError("ссылку не дал (возможно, DRM)") }
                    ?.let { s -> step("SoundCloud: байты (${if (s.url.contains(".m3u8")) "нарезка" else "файл"})") { bytes(s.url) } }
            }
            step("Запасные площадки (Rutube, Archive…)", 12) { WebSearch.extraCandidates(t) }?.firstOrNull()?.let { w ->
                step("${w.source}: ссылка", 25) { if (w.direct) w.url else Downloader.streamOf(w.url, w.source, w.title)?.url ?: throw UserError("ссылку не дал") }
                    ?.let { u -> step("${w.source}: байты") { bytes(u) } }
            }
        }
        say("Готово.")
        AppLog.add(out.toString())
    }

    private fun describe(r: Any?): String = when (r) {
        null -> "пусто"
        is Pair<*, *> -> "результатов ${(r.first as? Collection<*>)?.size}, подошло ${(r.second as? Collection<*>)?.size}"
        is Collection<*> -> "результатов ${r.size}" + (r.firstOrNull()?.let { x ->
            when (x) {
                is NewPipeSource.Found -> ", первый: ${x.title.take(30)} | ${x.artist.take(20)} | ${x.durationSec} с"
                is Downloader.Candidate -> ", первый: ${x.title.take(30)} | ${x.author.take(20)} | ${x.duration} с"
                is WebResult -> ", первый: ${x.source} · ${x.title.take(30)}"
                else -> ""
            }
        } ?: "")
        is NewPipeSource.Audio -> "${r.format} ${r.kbps} kbps"
        is StreamInfo -> r.source
        is String -> if (r.startsWith("http")) "есть (${runCatching { URL(r).host }.getOrNull()})" else r
        else -> r.toString().take(80)
    }

    /** Ответ сервера и время: «200 за 0.3 с». */
    private fun ping(url: String): String {
        val t = System.currentTimeMillis()
        val c = URL(url).openConnection() as HttpURLConnection
        c.connectTimeout = 8000; c.readTimeout = 8000
        c.setRequestProperty("User-Agent", Http.DESKTOP_UA)
        try { return "HTTP ${c.responseCode} за ${"%.1f".format((System.currentTimeMillis() - t) / 1000.0)} с" } finally { c.disconnect() }
    }

    /** Реально читаем начало звука — как это сделает проигрыватель: сколько байт и с какой скоростью. */
    private fun bytes(url: String): String {
        val t = System.currentTimeMillis()
        val c = Net.open(URL(url))
        c.connectTimeout = 8000; c.readTimeout = 8000
        c.setRequestProperty("User-Agent", Http.DESKTOP_UA)
        if (!url.contains(".m3u8")) c.setRequestProperty("Range", "bytes=0-${256 * 1024 - 1}")
        try {
            val code = c.responseCode
            if (code !in 200..299) throw UserError("HTTP $code")
            var n = 0; val buf = ByteArray(16 * 1024)
            c.inputStream.use { ins -> while (n < 256 * 1024) { val r = ins.read(buf); if (r < 0) break; n += r } }
            val sec = (System.currentTimeMillis() - t) / 1000.0
            return "${n / 1024} КБ за ${"%.1f".format(sec)} с (${"%.0f".format(n / 1024 / maxOf(sec, 0.05))} КБ/с), ${c.contentType.orEmpty().take(30)}"
        } finally { c.disconnect() }
    }
}
