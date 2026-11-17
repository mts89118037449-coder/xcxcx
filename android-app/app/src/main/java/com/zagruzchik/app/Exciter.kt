package com.zagruzchik.app

import androidx.media3.common.C
import androidx.media3.common.audio.AudioProcessor
import androidx.media3.common.audio.BaseAudioProcessor
import androidx.media3.common.util.UnstableApi
import java.nio.ByteBuffer
import kotlin.math.PI
import kotlin.math.exp

/**
 * «Восстановление верхов» (эксайтер). Сжатие срезает самые высокие частоты; здесь из верхней части спектра
 * (выше ~5 кГц) строятся гармоники и тихо подмешиваются к звуку — запись слышится ярче.
 * Это эффект, а не восстановление потерянного: на хороших записях его лучше выключать.
 */
@UnstableApi
class Exciter : BaseAudioProcessor() {
    companion object {
        /** 0 — выключено, 1 — легко, 2 — сильнее. Меняется на лету из настроек. */
        @Volatile var level = 0

        // Ритм для экрана плеера считается в BeatSink — по часам самого звука.
        fun beatNow(): Float? = BeatSink.beatNow()
        fun lastBeat(): Long = BeatSink.lastBeat()
        fun lastBeatAgeMs(): Long = BeatSink.lastBeatAgeMs()
        fun bandsNow(): FloatArray? = BeatSink.bandsNow()
        fun notesAfter(after: Long) = BeatSink.notesAfter(after)
    }

    private var channels = 2
    private var alpha = 0.5f               // коэффициент фильтра верхних частот
    private var lp = FloatArray(2)         // состояние фильтра по каналам

    override fun onConfigure(inputAudioFormat: AudioProcessor.AudioFormat): AudioProcessor.AudioFormat {
        if (inputAudioFormat.encoding != C.ENCODING_PCM_16BIT) throw AudioProcessor.UnhandledAudioFormatException(inputAudioFormat)
        channels = inputAudioFormat.channelCount
        lp = FloatArray(channels)
        alpha = (1.0 - exp(-2.0 * PI * 5000.0 / inputAudioFormat.sampleRate)).toFloat()
        return inputAudioFormat
    }

    override fun queueInput(inputBuffer: ByteBuffer) {
        val n = inputBuffer.remaining()
        val out = replaceOutputBuffer(n)
        val mix = when (level) { 1 -> 0.18f; 2 -> 0.32f; else -> 0f }
        var ch = 0
        while (inputBuffer.remaining() >= 2) {
            val s = inputBuffer.short / 32768f
            var y = s
            if (mix > 0f) {
                lp[ch] += alpha * (s - lp[ch])          // низ и середина
                val high = s - lp[ch]                   // только верх
                // Мягкое ограничение рождает гармоники выше исходных; вычитаем сам верх — остаётся добавка.
                val driven = high * 4f
                val shaped = driven / (1f + kotlin.math.abs(driven))
                y = s + mix * (shaped - high * 0.5f)
                if (y > 1f) y = 1f else if (y < -1f) y = -1f
            }
            out.putShort((y * 32767f).toInt().toShort())
            ch = if (ch + 1 >= channels) 0 else ch + 1
        }
        out.flip()
    }

    override fun onFlush() { lp = FloatArray(channels) }
}
