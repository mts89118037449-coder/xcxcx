package com.zagruzchik.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class CoreLogicTest {

    @Test
    fun matchNormAndBase() {
        assertEquals("елка прованс", Match.norm("Ёлка — Прованс!"))
        assertEquals("еще один день 2025", Match.norm("Ещё один день (2025)"))
        assertEquals("еще один день", Match.base("Ещё один день (2025)"))
        assertEquals("moonlight on the river", Match.base("Moonlight on the River (Official Audio)"))
        assertEquals("kahlil gibran", Match.base("Kahlil Gibran – Single Version"))
        assertEquals("ждать ее", Match.base("Ждать её (feat. Кто-то) [Remix]"))
        assertEquals("темная ночь", Match.base("Тёмная ночь [Live] ft. Кто-то"))
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

    @Test
    fun awaitStreamPriorityOverFallback() {
        val pool = java.util.concurrent.Executors.newFixedThreadPool(4)
        try {
            val ytmStream = StreamInfo("https://yt/1", "https://yt/1", "YouTube Music", null, "Song")
            val hitStream = StreamInfo("https://hm/1.mp3", "https://hm/1.mp3", "Hitmotop · MP3", null, "Song")

            // 1) Fallback finishes in 10ms, priority (ytm) finishes in 120ms (< graceMs 600ms) -> priority wins
            val fHit1 = pool.submit<StreamInfo?> { Thread.sleep(10); hitStream }
            val fYtm1 = pool.submit<StreamInfo?> { Thread.sleep(120); ytmStream }
            val picked1 = Streams.awaitStream(System.currentTimeMillis(), graceMs = 600L, fastPriority = listOf(fYtm1), fallback = listOf(fHit1))
            assertEquals("YouTube Music", picked1?.source)

            // 2) Fallback finishes in 10ms, priority hangs past graceMs 150ms -> fallback wins & cancels priority
            val fHit2 = pool.submit<StreamInfo?> { Thread.sleep(10); hitStream }
            val fSlow2 = pool.submit<StreamInfo?> { Thread.sleep(2000); ytmStream }
            val picked2 = Streams.awaitStream(System.currentTimeMillis(), graceMs = 150L, fastPriority = listOf(fSlow2), fallback = listOf(fHit2))
            assertEquals("Hitmotop · MP3", picked2?.source)
            assertTrue(fSlow2.isCancelled || fSlow2.isDone)

            // 3) Priority finishes null quickly -> fallback returns immediately without waiting for full graceMs
            val fHit3 = pool.submit<StreamInfo?> { Thread.sleep(10); hitStream }
            val fNull3 = pool.submit<StreamInfo?> { Thread.sleep(20); null }
            val t0 = System.currentTimeMillis()
            val picked3 = Streams.awaitStream(t0, graceMs = 2000L, fastPriority = listOf(fNull3), fallback = listOf(fHit3))
            assertEquals("Hitmotop · MP3", picked3?.source)
            assertTrue(System.currentTimeMillis() - t0 < 1000L)
        } finally {
            pool.shutdownNow()
        }
    }

    @Test
    fun vkKateOAuthAndApiParsing() {
        val parsed = VkSource.parseOAuthRedirect("https://oauth.vk.com/blank.html#access_token=vk1.a.test_tok&expires_in=0&user_id=12345678")
        assertEquals("vk1.a.test_tok", parsed?.first)
        assertEquals(12345678L, parsed?.second)
        val parsedMirror = VkSource.parseOAuthRedirect("https://oauth.vk.ru/blank.html#access_token=vk1.a.mirror_tok&expires_in=0&user_id=87654321")
        assertEquals("vk1.a.mirror_tok", parsedMirror?.first)
        assertEquals(87654321L, parsedMirror?.second)
        val parsedDirect = VkSource.parseOAuthRedirect("access_token=vk1.a.direct_tok&expires_in=0&user_id=112233")
        assertEquals("vk1.a.direct_tok", parsedDirect?.first)
        assertEquals(112233L, parsedDirect?.second)
        assertNull(VkSource.parseOAuthRedirect("https://oauth.vk.com/blank.html#error=access_denied"))

        val okJson = """
            {
              "response": {
                "count": 1,
                "items": [
                  {
                    "id": 999,
                    "owner_id": 12345,
                    "title": "Ждать её",
                    "artist": "Playingtheangel",
                    "duration": 185,
                    "url": "https://cs9.vkuseraudio.net/p1/test.mp3",
                    "access_key": "abc",
                    "album": {"thumb": {"photo_600": "https://sun9.userapi.com/600.jpg"}}
                  }
                ]
              }
            }
        """.trimIndent()
        val list = VkSource.parseApiSearch(okJson)
        assertEquals(1, list.size)
        assertEquals("vkapi:12345_999", list[0].key)
        assertEquals("https://cs9.vkuseraudio.net/p1/test.mp3", list[0].directUrl)
        assertEquals("https://sun9.userapi.com/600.jpg", list[0].cover)

        var err14 = false
        try {
            VkSource.parseApiSearch("""{"error":{"error_code":14,"error_msg":"Captcha needed"}}""")
        } catch (e: UserError) {
            err14 = true
            assertTrue(VkSource.pausedUntil > System.currentTimeMillis())
        }
        assertTrue(err14)

        var err5 = false
        try {
            VkSource.parseApiSearch("""{"error":{"error_code":5,"error_msg":"User authorization failed"}}""")
        } catch (e: UserError) {
            err5 = true
        }
        assertTrue(err5)

        VkSource.saveToken("stale_kate_tok", 123L, VkSource.TOKEN_TYPE_KATE)
        assertTrue(VkSource.hasToken)
        var err3Msg = ""
        try {
            VkSource.parseApiSearch("""{"error":{"error_code":3,"error_msg":"Unknown method passed"}}""")
        } catch (e: UserError) {
            err3Msg = e.message.orEmpty()
        }
        assertTrue(err3Msg.contains("без доступа к музыке"))
        assertTrue(!VkSource.hasToken)
    }

    @Test
    fun vkAndroidAuthResponseParsing() {
        assertEquals("anon_tok_1", VkSource.parseAnonymTokenResponse("""{"token":"anon_tok_1"}"""))
        assertEquals("anon_tok_2", VkSource.parseAnonymTokenResponse("""{"response":{"token":"anon_tok_2"}}"""))
        assertEquals("sid_abc", VkSource.parseValidateAccountResponse("""{"response":{"sid":"sid_abc"}}"""))
        assertEquals("sid_otp", VkSource.parseCheckOtpResponse("""{"response":{"sid":"sid_otp"}}""", "sid_abc"))
        assertEquals("sid_abc", VkSource.parseCheckOtpResponse("""{"response":{}}""", "sid_abc"))

        val otp = VkSource.parseOAuthTokenResponse(
            """{"error":"need_validation","error_description":"Enter code from app","validation_sid":"vsid_99"}""",
            "sid_abc",
            "anon_tok_1"
        )
        assertTrue(otp is VkSource.VkAndroidAuthResult.NeedOtp)
        val otpRes = otp as VkSource.VkAndroidAuthResult.NeedOtp
        assertEquals("vsid_99", otpRes.sid)
        assertEquals("anon_tok_1", otpRes.anonymToken)

        val ok = VkSource.parseOAuthTokenResponse(
            """{"access_token":"vk1.a.android_tok","user_id":555777}""",
            "sid_abc",
            "anon_tok_1"
        )
        assertTrue(ok is VkSource.VkAndroidAuthResult.Success)
        val okRes = ok as VkSource.VkAndroidAuthResult.Success
        assertEquals("vk1.a.android_tok", okRes.accessToken)
        assertEquals(555777L, okRes.userId)

        assertEquals("vk1.a.refreshed", VkSource.parseRefreshTokenResponse("""{"response":{"token":"vk1.a.refreshed"}}""", "vk1.a.android_tok"))
        assertEquals("vk1.a.android_tok", VkSource.parseRefreshTokenResponse("""{"error":{"error_code":5}}""", "vk1.a.android_tok"))
    }

    @Test
    fun zaycevSanitizeQueryAndImmediateFallback() {
        val longQ = "Justice, Tame Impala, SZA & King Gizzard & The Lizard Wizard Neverender [From Arcane Season 2] (feat. Someone)"
        val clean = ZaycevSource.sanitizeQuery(longQ)
        assertTrue(clean.length <= 60)
        assertTrue(!clean.contains("["))
        assertTrue(!clean.contains("feat."))
        assertTrue(clean.startsWith("Justice Tame Impala SZA"))

        val pool = java.util.concurrent.Executors.newFixedThreadPool(3)
        try {
            val hitStream = StreamInfo("https://hm/fast.mp3", "https://hm/fast.mp3", "Hitmotop · MP3", null, "Song")
            val fPriorityNull = pool.submit<StreamInfo?> { Thread.sleep(15); null }
            val fFallback = pool.submit<StreamInfo?> { Thread.sleep(15); hitStream }
            val t0 = System.currentTimeMillis()
            val picked = Streams.awaitStream(
                started = t0,
                graceMs = 4500L,
                fastPriority = listOf(fPriorityNull),
                fallback = listOf(fFallback),
                startSlow = null,
            )
            assertEquals("Hitmotop · MP3", picked?.source)
            assertTrue(System.currentTimeMillis() - t0 < 1000L)
        } finally {
            pool.shutdownNow()
        }
    }

    @Test
    fun tasteDaySlotsAndTimeDecay() {
        // Утро 5..11 -> 0, День 12..17 -> 1, Вечер 18..22 -> 2, Ночь остальное -> 3
        assertEquals(0, Taste.daySlotOf(5))
        assertEquals(0, Taste.daySlotOf(11))
        assertEquals(1, Taste.daySlotOf(12))
        assertEquals(1, Taste.daySlotOf(17))
        assertEquals(2, Taste.daySlotOf(18))
        assertEquals(2, Taste.daySlotOf(22))
        assertEquals(3, Taste.daySlotOf(23))
        assertEquals(3, Taste.daySlotOf(0))
        assertEquals(3, Taste.daySlotOf(4))

        val dayMs = 86_400_000L
        assertEquals(1.0, Taste.timeDecay(0L), 1e-6)
        assertEquals(0.5, Taste.timeDecay(21L * dayMs), 1e-6)
        assertEquals(0.25, Taste.timeDecay(42L * dayMs), 1e-6)
        assertTrue(Taste.timeDecay(7L * dayMs) > Taste.timeDecay(14L * dayMs))
        assertTrue(Taste.timeDecay(14L * dayMs) > Taste.timeDecay(30L * dayMs))
    }

    @Test
    fun tagsCosineScore() {
        val profile = mapOf("рок" to 1.0, "русский" to 0.5)
        // Полное совпадение с единственным тегом профиля
        assertEquals(1.0, Tags.cosineScore(mapOf("рок" to 1.0), listOf("рок")), 1e-6)
        // Частичное совпадение
        val partial = Tags.cosineScore(profile, listOf("рок", "быстрая"))
        assertTrue(partial > 0.5 && partial < 1.0)
        // Ортогональные теги
        assertEquals(0.0, Tags.cosineScore(profile, listOf("джаз", "инструментал")), 1e-6)
        // Пустые входные данные
        assertEquals(0.0, Tags.cosineScore(emptyMap(), listOf("рок")), 1e-6)
        assertEquals(0.0, Tags.cosineScore(profile, emptyList()), 1e-6)
    }

    @Test
    fun auraDaySequenceWithSpacing() {
        val input = listOf(
            Track("A1", "Artist A"),
            Track("A2", "Artist A"),
            Track("A3", "Artist A"),
            Track("A4", "Artist A"),
            Track("B1", "Artist B"),
            Track("C1", "Artist C"),
            Track("D1", "Artist D"),
            Track("E1", "Artist E"),
            Track("F1", "Artist F"),
            Track("G1", "Artist G"),
            Track("H1", "Artist H"),
            Track("I1", "Artist I"),
            Track("J1", "Artist J"),
        )
        val spaced = AuraDay.sequenceWithSpacing(input, minGap = 4)
        assertEquals(input.size, spaced.size)
        val aPositions = spaced.mapIndexedNotNull { idx, t -> if (t.artist == "Artist A") idx else null }
        assertEquals(4, aPositions.size)
        for (i in 1 until aPositions.size) {
            val gap = aPositions[i] - aPositions[i - 1]
            assertTrue("Expected gap >= 4, got $gap at $aPositions", gap >= 4)
        }
        // Не идут подряд
        for (i in 1 until spaced.size) {
            assertTrue(spaced[i].artist != spaced[i - 1].artist)
        }
    }

    @Test
    fun smokeViewLandscapeVisualRadius() {
        // В альбомном виде на ТВ (1920x1080) при сжатой обложке (r = 140) дым не схлопывается в мелкие точки
        val tvR = SmokeView.computeVisualRadius(1920, 1080, 140f)
        assertTrue("Expected visualR >= 280f on 1920x1080, got $tvR", tvR >= 280f)
        // В портрете (1080x2400) радиус остаётся без изменений
        assertEquals(370f, SmokeView.computeVisualRadius(1080, 2400, 370f), 1e-4f)
    }
}
