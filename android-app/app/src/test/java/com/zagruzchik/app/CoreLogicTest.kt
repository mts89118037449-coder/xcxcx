package com.zagruzchik.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class CoreLogicTest {

    @Test
    fun matchNormAndBase() {
        assertEquals("елка прованс", Match.norm("Ёлка — Прованс!"))
        assertEquals("moonlight on the river", Match.base("Moonlight on the River (Official Audio)"))
        assertEquals("kahlil gibran", Match.base("Kahlil Gibran – Single Version"))
        assertEquals("ждать ее", Match.base("Ждать её (feat. Кто-то) [Remix]"))
    }

    @Test
    fun matchScoreAndVersionPenalty() {
        val src = Track("Ждать её", "Playingtheangel", 185)
        assertTrue((Match.score(src, "Ждать ее", "Playingtheangel", 185) ?: 0) > 0)
        assertNull(Match.score(src, "Ждать ее (Slowed + Reverb)", "Other", 185))
        assertTrue(Match.versionPenaltyWords("Song (Original Mix)", "Song").isEmpty())
        assertTrue(Match.versionPenaltyWords("Song (Remix)", "Song").isNotEmpty())
    }

    @Test
    fun hitmotopParseHtml() {
        val html = """
            <div data-musmeta='{"url":"https://rus.hitmotop.com/get/music/1.mp3","title":"Ждать ее","artist":"Playingtheangel","img":"https://rus.hitmotop.com/covers/1.jpg"}'>
                <div class="track__fulltime">03:05</div>
            </div>
        """.trimIndent()
        val res = HitmotopSource.parseHtml(html)
        assertEquals(1, res.size)
        assertEquals("Ждать ее", res[0].title)
        assertEquals("Playingtheangel", res[0].artist)
        assertEquals(185, res[0].durationSec)
        assertEquals("https://rus.hitmotop.com/get/music/1.mp3", res[0].url)
    }

    @Test
    fun hearthisParseJson() {
        val json = """
            [
              {
                "title": "Moonlight on the River",
                "stream_url": "https://hearthis.at/stream/123.mp3",
                "duration": "240",
                "playback_count": "1500",
                "artwork_url": "https://hearthis.at/art/123.jpg",
                "user": {"username": "Mac DeMarco"}
              }
            ]
        """.trimIndent()
        val res = HearthisSource.parseJson(json)
        assertEquals(1, res.size)
        assertEquals("Moonlight on the River", res[0].title)
        assertEquals("Mac DeMarco", res[0].artist)
        assertEquals(240, res[0].durationSec)
        assertEquals(1500L, res[0].views)
    }

    @Test
    fun streamsBlacklistAndBreaker() {
        val url = "https://example.com/test-track-${System.nanoTime()}.mp3"
        assertTrue(!Streams.isBlacklisted(url))
        Streams.blacklist("direct:$url")
        assertTrue(Streams.isBlacklisted(url))
        assertTrue(Streams.isBlacklisted("direct:$url"))

        val b = Streams.Breaker()
        assertTrue(!b.open)
        b.fail()
        assertTrue(!b.open)
        b.ok()
        b.fail()
        assertTrue(!b.open)
        b.fail()
        assertTrue(b.open)
    }

    @Test
    fun zaycevParseAndWebRelevance() {
        val json = """
            {
              "trackIds": [101, 102],
              "tracksInfo": {
                "101": {"playbackEnabled": true, "track": "Ждать её", "artistName": "Playingtheangel", "duration": "03:05", "bitrate": 320, "imageJpg": "//cdn.zaycev.net/101.jpg", "explicit": true},
                "102": {"playbackEnabled": false, "track": "Blocked", "artistName": "X", "duration": "02:00", "bitrate": 128}
              }
            }
        """.trimIndent()
        val z = ZaycevSource.parseSearchJson(json)
        assertEquals(1, z.size)
        assertEquals(101L, z[0].id)
        assertEquals(185, z[0].durationSec)
        assertEquals(320, z[0].bitrate)
        assertEquals("https://cdn.zaycev.net/101.jpg", z[0].cover)
        assertTrue(z[0].explicit)

        // Translit & lookalike matching
        val src = Track("Метеоритный дождь", "Скриптонит", 200)
        assertTrue((Match.score(src, "Meteoritnyj dozhd", "Skriptonit", 200) ?: 0) > 0)
        assertNull(Match.score(src, "Метеоритный дождь", "Скриптонит", 30))

        val orig = WebResult("https://a/1.mp3", "Kahlil Gibran", "STRFKR", 220, "Hearthis", views = 10000)
        val remix = WebResult("https://a/2.mp3", "Kahlil Gibran (Remix)", "STRFKR", 220, "Hearthis", views = 100)
        assertTrue(WebSearch.relevance("STRFKR Kahlil Gibran", orig) > WebSearch.relevance("STRFKR Kahlil Gibran", remix))
    }
}
