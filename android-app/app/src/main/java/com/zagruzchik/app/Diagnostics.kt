package com.zagruzchik.app

import android.content.Context
import com.yausername.youtubedl_android.YoutubeDL

/**
 * «Проверить источники»: что отвечает на этом телефоне, сколько ждать и какая ошибка.
 * Чтобы не гадать, почему песня не нашлась или полная версия не подхватилась.
 */
object Diagnostics {
    private const val QUERY = "МУККА Девочка с каре"

    fun run(ctx: Context, line: (String) -> Unit) {
        fun step(name: String, block: () -> String) {
            val t = System.currentTimeMillis()
            val r = runCatching { block() }
            val sec = "%.1f с".format((System.currentTimeMillis() - t) / 1000.0)
            line(r.fold({ "✓ $name — $it · $sec" }, { "✗ $name — ${(it as? UserError)?.message ?: it.message ?: it.javaClass.simpleName} · $sec" }))
        }
        step("Движок yt-dlp") {
            App.awaitReady()
            YoutubeDL.getInstance().versionName(ctx) ?: "встроенная версия"
        }
        step("Каталоги (Deezer/Apple)") { "${MusicSearch.search(QUERY).size} песен" }
        var top: Downloader.Candidate? = null
        step("SoundCloud") {
            val r = Downloader.searchOrThrow("scsearch8:$QUERY", "SoundCloud")
            top = Match.ranked(Track("Девочка с каре", "МУККА", 157), r) { Triple(it.title, it.author, it.duration) }.firstOrNull()
            "${r.size} результатов" + (top?.let { ", лучший: ${it.title}" } ?: "")
        }
        step("YouTube Music") { "${Downloader.searchOrThrow("https://music.youtube.com/search?q=" + Http.enc(QUERY) + "#songs", "YouTube Music").size} результатов" }
        step("YouTube") { "${Downloader.searchOrThrow("ytsearch6:$QUERY", "YouTube").size} результатов" }
        var stream: String? = null
        step("Поток SoundCloud (для «Слушать»)") {
            val c = top ?: throw UserError("нет результата SoundCloud")
            val s = Downloader.streamOf(c.url, "SoundCloud", c.title) ?: throw UserError("не отдал поток (возможно, DRM)")
            stream = s.url
            "есть"
        }
        step("Разбор звука ffmpeg (подхват с того же места)") {
            val u = stream ?: throw UserError("нет потока")
            val pcm = Align.pcm(ctx, u, 20) ?: throw UserError("ffmpeg не прочитал поток")
            "${pcm.size / 8000} с звука"
        }
        step("Яндекс Музыка") { Http.json("https://api.music.yandex.net/search?type=track&page=0&text=" + Http.enc(QUERY)).optJSONObject("result")?.let { "отвечает" } ?: "пусто" }
        step("Internet Archive") { Http.json("https://archive.org/advancedsearch.php?rows=1&output=json&fl%5B%5D=identifier&q=" + Http.enc("($QUERY) AND mediatype:audio")).let { "отвечает" } }
        step("Rutube") { "${Http.json("https://rutube.ru/api/search/video/?query=" + Http.enc(QUERY)).optInt("count")} результатов" }
        line("Готово. Если что-то с ✗ — пришлите скриншот.")
    }
}
