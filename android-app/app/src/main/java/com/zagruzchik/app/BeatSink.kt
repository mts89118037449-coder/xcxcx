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

        /** Сила пульса сейчас, 0..1: вспышка в момент удара и затухание за ~0,4 с. null — ритма нет (пауза, другой формат). */
        fun beatNow(): Float? {
            val pos = nowUs() ?: return null
            var v = 0f
            val it = beats.iterator()
            while (it.hasNext()) {
                val (t, strength) = it.next()
                val age = pos - t
                if (age > 700_000) { it.remove(); continue }
                if (age >= 0) {
                    v = maxOf(v, strength * (1f - age / 420_000f).coerceAtLeast(0f))
                    if (t > lastPlayed) { lastPlayed = t; lastPlayedAt = SystemClock.uptimeMillis() }
                }
            }
            return v
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
    private var bassLp = 0f
    private var energy = 0f
    private var inWindow = 0
    private var average = 0f
    private var lastBeatUs = Long.MIN_VALUE / 2

    override fun configure(inputFormat: Format, specifiedBufferSize: Int, outputChannels: IntArray?) {
        enabled = MimeTypes.AUDIO_RAW == inputFormat.sampleMimeType && inputFormat.pcmEncoding == C.ENCODING_PCM_16BIT &&
            inputFormat.channelCount > 0 && inputFormat.sampleRate > 0
        if (enabled) {
            channels = inputFormat.channelCount
            rate = inputFormat.sampleRate
            bassAlpha = (1.0 - exp(-2.0 * PI * 150.0 / rate)).toFloat()
            window = (rate * 0.023f).toInt().coerceAtLeast(256)
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
            val s = b.getShort(b.position()) / 32768f       // первый канал
            b.position(b.position() + step)
            bassLp += bassAlpha * (s - bassLp)
            energy += bassLp * bassLp
            frame++
            if (++inWindow >= window) {
                val e = energy / window
                val atUs = ptsUs + (frame - window / 2) * 1_000_000L / rate   // середина окна — там и был удар
                if (e > average * 1.55f + 0.0004f && atUs - lastBeatUs > 230_000) {
                    lastBeatUs = atUs
                    val strength = ((e / (average + 0.0004f) - 1f) / 2.5f).coerceIn(0.35f, 1f)
                    beats.addLast(atUs to strength)
                    while (beats.size > 64) beats.pollFirst()
                }
                average += (e - average) * 0.045f
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
        beats.clear(); lastPts = Long.MIN_VALUE; lastBeatUs = Long.MIN_VALUE / 2
        bassLp = 0f; energy = 0f; inWindow = 0; average = 0f
        lastPlayed = 0L; posAt = 0L
        super.flush()
    }

    override fun reset() { playing = false; posAt = 0L; super.reset() }
}
