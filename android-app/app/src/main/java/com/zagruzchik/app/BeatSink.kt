package com.zagruzchik.app

import android.os.SystemClock
import androidx.media3.common.C
import androidx.media3.common.Format
import androidx.media3.common.MimeTypes
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.audio.AudioSink
import androidx.media3.exoplayer.audio.ForwardingAudioSink
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.ConcurrentLinkedDeque
import kotlin.math.PI
import kotlin.math.exp

/**
 * Ритм для экрана плеера — по часам самого звука.
 * Удары бас-барабана ищутся в звуке, который проигрыватель отдаёт на выход, и запоминаются с меткой времени записи.
 * Экран сравнивает их с тем, что звучит прямо сейчас (позиция выхода — с учётом задержки динамика или Bluetooth,
 * её меряет сам проигрыватель). Раньше время удара угадывалось по часам телефона и заполненности буфера — и вспышки
 * расходились со звуком.
 */
@UnstableApi
class BeatSink(sink: AudioSink) : ForwardingAudioSink(sink) {
    companion object {
        @Volatile var timeline = 0L
            private set
        private val beats = ConcurrentLinkedDeque<Pair<Long, Float>>()   // (время в записи, мкс; сила 0..1)
        @Volatile private var posUs = 0L
        @Volatile private var posAt = 0L
        @Volatile private var playing = false
        @Volatile private var lastPlayed = 0L
        @Volatile private var lastPlayedAt = 0L

        /** То, что звучит сейчас, мкс по шкале записи. null — не играет или проигрыватель давно не сообщал позицию. */
        private fun nowUs(): Long? {
            val now = SystemClock.uptimeMillis()
            if (!playing || posAt == 0L || now - posAt > 1000) return null
            return posUs + (now - posAt) * 1000
        }

        /** Сила пульса сейчас, 0..1: вспышка в момент удара и затухание за ~0,23 с. null — ритма нет (пауза, другой формат). */
        fun beatNow(): Float? {
            val pos = nowUs() ?: return null
            var v = 0f
            val it = beats.iterator()
            while (it.hasNext()) {
                val (t, strength) = it.next()
                val age = pos - t
                if (age > 700_000) { it.remove(); continue }
                if (age >= 0) {
                    v = maxOf(v, strength * (1f - age / 230_000f).coerceAtLeast(0f))
                    if (t > lastPlayed) { lastPlayed = t; lastPlayedAt = SystemClock.uptimeMillis() }
                }
            }
            return v
        }

        // Три полосы — бас (до ~150 Гц), середина (голос, гитары, клавиши — до ~2 кГц) и верх (тарелки, хэты, шипящие).
        // Уровень каждой (0..1, относительно её собственного среднего) и «ноты» — всплески в каждой полосе, по шкале записи.
        private val levels = ConcurrentLinkedDeque<Pair<Long, FloatArray>>()
        private val notes = ConcurrentLinkedDeque<Triple<Long, Int, Float>>()   // (время в записи, полоса 0..2, сила)

        /** Уровни полос сейчас: [бас, середина, верх], 0..1. null — ритма нет. */
        fun bandsNow(): FloatArray? {
            val pos = nowUs() ?: return null
            var cur: FloatArray? = null
            val it = levels.iterator()
            while (it.hasNext()) {
                val (t, v) = it.next()
                if (pos - t > 1_000_000) { it.remove(); continue }
                if (t <= pos) cur = v
            }
            return cur ?: FloatArray(3)
        }

        /** Ноты, прозвучавшие после [after] (мкс по шкале записи), по порядку. Пусто — новых нет. */
        fun notesAfter(after: Long): List<Triple<Long, Int, Float>> {
            val pos = nowUs() ?: return emptyList()
            val out = ArrayList<Triple<Long, Int, Float>>()
            val it = notes.iterator()
            while (it.hasNext()) {
                val n = it.next()
                if (pos - n.first > 2_000_000) { it.remove(); continue }
                if (n.first > after && pos - n.first in 0..120_000) out += n
            }
            return out
        }

        // Для тегов песни: интервалы между ударами и доля баса за всё время, что песня звучала.
        private val intervals = java.util.Collections.synchronizedList(ArrayList<Long>())
        private var bassSum = 0.0
        private var allSum = 0.0

        /** Темп (ударов в минуту) и доля баса с прошлого вызова; счёт начинается заново. null — мерить было нечего. */
        fun takeStats(): Pair<Int, Float>? {
            val (iv, share) = synchronized(intervals) {
                val list = intervals.toList().also { intervals.clear() }
                val s = if (allSum > 0) (bassSum / allSum).toFloat() else 0f
                bassSum = 0.0; allSum = 0.0
                list to s
            }
            if (iv.size < 16 && share <= 0f) return null
            var bpm = 0
            if (iv.size >= 16) {
                val med = iv.sorted()[iv.size / 2] / 1_000_000.0
                if (med > 0) { var b = 60.0 / med; while (b < 70) b *= 2; while (b > 180) b /= 2; bpm = b.toInt() }
            }
            return bpm to share
        }

        /** Метка последнего уже прозвучавшего удара (меняется — значит, был новый удар). */
        fun lastBeat(): Long { beatNow(); return lastPlayed }
        /** Сколько мс назад прозвучал последний удар. */
        fun lastBeatAgeMs(): Long = SystemClock.uptimeMillis() - lastPlayedAt
    }

    private var enabled = false
    private var channels = 2
    private var rate = 44100
    private var bassAlpha = 0.02f
    private var window = 1024
    private var lastPts = Long.MIN_VALUE

    // Детектор: энергия баса (ниже ~150 Гц) в окнах ~23 мс; всплеск над средним уровнем — удар.
    private var bassLp = FloatArray(2)
    private var energy = 0f
    private var inWindow = 0
    private var average = 0f
    private var lastBeatUs = Long.MIN_VALUE / 2
    private var midAlpha = 0.25f
    private var midLp = FloatArray(2)
    private val previousEnergy = FloatArray(3)
    private val bandE = FloatArray(3)
    private val bandAvg = FloatArray(3)
    private val lastNoteUs = LongArray(3) { Long.MIN_VALUE / 2 }

    override fun configure(inputFormat: Format, specifiedBufferSize: Int, outputChannels: IntArray?) {
        enabled = MimeTypes.AUDIO_RAW == inputFormat.sampleMimeType && inputFormat.pcmEncoding == C.ENCODING_PCM_16BIT &&
            inputFormat.channelCount > 0 && inputFormat.sampleRate > 0
        if (enabled) {
            channels = inputFormat.channelCount
            if (bassLp.size != channels) {
                bassLp = FloatArray(channels)
                midLp = FloatArray(channels)
            }
            rate = inputFormat.sampleRate
            bassAlpha = (1.0 - exp(-2.0 * PI * 150.0 / rate)).toFloat()
            window = (rate * 0.023f).toInt().coerceAtLeast(256)
            midAlpha = (1.0 - exp(-2.0 * PI * 2000.0 / rate)).toFloat()
        }
        super.configure(inputFormat, specifiedBufferSize, outputChannels)
    }

    override fun handleBuffer(buffer: ByteBuffer, presentationTimeUs: Long, encodedAccessUnitCount: Int): Boolean {
        // Тот же буфер приходит повторно, пока выход его не примет целиком, — разбираем один раз.
        if (enabled && presentationTimeUs != lastPts && buffer.hasRemaining()) {
            lastPts = presentationTimeUs
            runCatching { analyze(buffer.duplicate().order(ByteOrder.LITTLE_ENDIAN), presentationTimeUs) }
        }
        return super.handleBuffer(buffer, presentationTimeUs, encodedAccessUnitCount)
    }

    private fun analyze(b: ByteBuffer, ptsUs: Long) {
        val step = channels * 2
        var frame = 0L
        while (b.remaining() >= step) {
            for (ch in 0 until channels) {
                val sample = b.short / 32768f
                bassLp[ch] += bassAlpha * (sample - bassLp[ch])
                midLp[ch] += midAlpha * (sample - midLp[ch])
                val mid = midLp[ch] - bassLp[ch]
                val high = sample - midLp[ch]
                energy += bassLp[ch] * bassLp[ch]
                bandE[1] += mid * mid
                bandE[2] += high * high
            }
            frame++
            if (++inWindow >= window) {
                val samples = window * channels
                val e = energy / samples
                val atUs = ptsUs + (frame - window / 2) * 1_000_000L / rate   // середина окна — там и был удар
                if (e > previousEnergy[0] * 1.12f && e > average * 1.55f + 0.0004f && atUs - lastBeatUs > 230_000 && e > 0.5f * bandE[1] / samples /* бас правда громче середины: иначе это гитара просачивается в низ (проверено на синтетике: 31 ложный «удар» → 0) */) {
                    if (atUs - lastBeatUs in 250_000..1_500_000) intervals += atUs - lastBeatUs
                    lastBeatUs = atUs
                    val strength = ((e / (average + 0.0004f) - 1f) / 2.5f).coerceIn(0.35f, 1f)
                    beats.addLast(atUs to strength)
                    notes.addLast(Triple(atUs, 0, strength))
                    while (beats.size > 64) beats.pollFirst()
                }
                average += (e - average) * 0.045f
                // Полосы: уровень относительно своего среднего и всплески-«ноты» в середине и верху.
                bandE[0] = energy
                synchronized(intervals) {
                    bassSum += e; allSum += e + bandE[1] / samples + bandE[2] / samples
                }
                val lv = FloatArray(3)
                // Вес полосы — её доля в общем звуке: раньше каждая полоса мерилась сама с собой, и тихая гитара давала столько же
                // «нот», сколько громкая, а тяжёлый бас среди них терялся (владелец 20.11: «гитара перебивает всё, бассы не чувствуются»).
                val total = bandE.sum() / samples + 1e-9f
                for (b in 0..2) {
                    val eb = bandE[b] / samples
                    val floor = if (b == 2) 0.00002f else 0.0001f
                    val ratio = eb / (bandAvg[b] + floor)
                    val presence = if (b == 0) 1f else (eb / total * 2.5f).coerceIn(0.15f, 1f)
                    lv[b] = ((ratio - 0.6f) / 1.6f).coerceIn(0f, 1f) * presence
                    // Во время басового удара отдельная атака середины остаётся видна,
                    // если её энергия заметно выше утечки из низкочастотного фильтра.
                    if (b > 0 && eb > previousEnergy[b] * 1.18f && ratio > 1.5f && eb > floor * 2 && atUs - lastNoteUs[b] > 160_000 &&
                        !(b == 1 && kotlin.math.abs(atUs - lastBeatUs) < 70_000 && eb < e * 0.55f)) {
                        lastNoteUs[b] = atUs
                        val strength = ((ratio - 1f) / 2.5f).coerceIn(0.3f, 1f) * presence
                        if (strength >= 0.25f) notes.addLast(Triple(atUs, b, strength)) // слабая нота тихой полосы — без дыма
                    }
                    previousEnergy[b] = eb
                    bandAvg[b] += (eb - bandAvg[b]) * 0.03f
                    bandE[b] = 0f
                }
                levels.addLast(atUs to lv)
                while (levels.size > 120) levels.pollFirst()
                while (notes.size > 64) notes.pollFirst()
                energy = 0f; inWindow = 0
            }
        }
    }

    override fun getCurrentPositionUs(sourceEnded: Boolean): Long = super.getCurrentPositionUs(sourceEnded).also {
        if (it != AudioSink.CURRENT_POSITION_NOT_SET) { posUs = it; posAt = SystemClock.uptimeMillis() }
    }

    override fun play() { playing = true; super.play() }
    override fun pause() { playing = false; super.pause() }

    override fun flush() {
        // Перемотка или новая запись: прежние удары больше не прозвучат, шкала времени начинается заново.
        beats.clear(); levels.clear(); notes.clear(); midLp.fill(0f); previousEnergy.fill(0f); bandE.fill(0f); bandAvg.fill(0f); lastNoteUs.fill(Long.MIN_VALUE / 2); lastPts = Long.MIN_VALUE; lastBeatUs = Long.MIN_VALUE / 2
        timeline++
        bassLp.fill(0f); energy = 0f; inWindow = 0; average = 0f
        lastPlayed = 0L; posAt = 0L
        super.flush()
    }

    override fun reset() { playing = false; posAt = 0L; super.reset() }
}
