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
}
