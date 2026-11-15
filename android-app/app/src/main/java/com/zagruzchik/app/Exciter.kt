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

        // ---- Ритм для экрана плеера: удары бас-барабана, найденные прямо в звуке, который идёт в динамик ----
        /** Удары: (когда прозвучит, сила 0..1). Звук уходит в динамик чуть позже обработки — поэтому время с поправкой. */
        private val beats = java.util.concurrent.ConcurrentLinkedDeque<Pair<Long, Float>>()
        @Volatile private var fedAt = 0L
        /** Задержка самого выхода (динамик ~70 мс, Bluetooth заметно больше) — выставляет экран плеера. */
        @Volatile var outputLatencyMs = 70L
        /** Сколько звука лежит в буфере проигрывателя, мс: измеряется при каждом старте/перемотке. */
        @Volatile private var bufferMs = 400f
        @Volatile private var lastPlayedBeat = 0L

        /** Время последнего уже прозвучавшего удара (0 — не было): меняется — значит, только что был новый удар. */
        fun lastBeat(): Long { beatNow(); return lastPlayedBeat }

        /**
         * Сила пульса сейчас, 0..1: вспышка в момент удара и плавное затухание.
         * null — звук через обработчик не идёт (пауза, другой формат): тогда экран пульсирует сам по себе.
         */
        fun beatNow(): Float? {
            val now = android.os.SystemClock.uptimeMillis()
            if (now - fedAt > 1200) return null
            var v = 0f
            val it = beats.iterator()
            while (it.hasNext()) {
                val (at, strength) = it.next()
                val age = now - at
                if (age > 700) { it.remove(); continue }
                if (age >= 0) { v = maxOf(v, strength * (1f - age / 420f).coerceAtLeast(0f)); if (at > lastPlayedBeat) lastPlayedBeat = at }
            }
            return v
        }
    }

    private var rate = 44100
    private var bassLp = 0f          // фильтр низких частот (бас-барабан живёт ниже ~150 Гц)
    private var bassAlpha = 0.02f
    private var energy = 0f          // энергия баса в текущем окне (~23 мс)
    private var inWindow = 0
    private var window = 1024
    private var average = 0f         // средняя энергия за последние ~1,5 с
    // Время считаем по самому звуку (числу отданных отсчётов), а не по часам: звук подаётся в проигрыватель рывками,
    // и по часам удары одного рывка слипались — ритм на экране «срывался».
    private var frames = 0L           // сколько отсчётов прошло через обработчик
    private var lastBeatAudio = -1e9  // когда был прошлый удар, мс по звуку
    private var curMax = Double.NaN; private var prevMax = Double.NaN; private var bucketAt = 0L
    private var flushAt = 0L; private var flushC = Double.NaN; private var flushMax = 0.0; private var measured = true

    /** Через сколько мс прозвучит только что обработанный звук: заполненность буфера проигрывателя. */
    private fun leadMs(audioMs: Double, now: Long): Float {
        val c = audioMs - now   // растёт, пока буфер наполняется; на его максимуме буфер полон
        if (flushC.isNaN()) { flushC = c; flushMax = c; flushAt = now; measured = false }
        if (now - bucketAt >= 500) { prevMax = if (now - bucketAt < 1000) curMax else Double.NaN; curMax = Double.NaN; bucketAt = now }
        curMax = if (curMax.isNaN()) c else maxOf(curMax, c)
        var full = if (prevMax.isNaN()) curMax else maxOf(curMax, prevMax)
        if (now - flushAt < 1500) {
            flushMax = maxOf(flushMax, c)
            full = maxOf(full, flushC + bufferMs)       // сразу после старта буфер ещё пуст
        } else if (!measured) {
            measured = true
            val b = (flushMax - flushC).toFloat()
            if (b > 100f && b < 1500f) bufferMs = b
        }
        return (bufferMs - (full - c).toFloat()).coerceIn(0f, bufferMs + 50f)
    }
    private var channels = 2
    private var alpha = 0.5f               // коэффициент фильтра верхних частот
    private var lp = FloatArray(2)         // состояние фильтра по каналам

    override fun onConfigure(inputAudioFormat: AudioProcessor.AudioFormat): AudioProcessor.AudioFormat {
        if (inputAudioFormat.encoding != C.ENCODING_PCM_16BIT) throw AudioProcessor.UnhandledAudioFormatException(inputAudioFormat)
        channels = inputAudioFormat.channelCount
        rate = inputAudioFormat.sampleRate
        bassAlpha = (1.0 - exp(-2.0 * PI * 150.0 / rate)).toFloat()
        window = (rate * 0.023f).toInt().coerceAtLeast(256)
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
            // Ритм: считаем энергию баса по первому каналу; всплеск над средним уровнем — удар.
            if (ch == 0) {
                bassLp += bassAlpha * (s - bassLp)
                energy += bassLp * bassLp
                if (++inWindow >= window) {
                    val e = energy / window
                    val now = android.os.SystemClock.uptimeMillis()
                    fedAt = now
                    frames += window
                    val audioMs = frames * 1000.0 / rate
                    val lead = leadMs(audioMs, now)
                    if (e > average * 1.55f + 0.0004f && audioMs - lastBeatAudio > 230) {
                        lastBeatAudio = audioMs
                        val strength = ((e / (average + 0.0004f) - 1f) / 2.5f).coerceIn(0.35f, 1f)
                        beats.addLast((now + lead.toLong() + outputLatencyMs) to strength)
                        while (beats.size > 24) beats.pollFirst()
                    }
                    average += (e - average) * 0.045f
                    energy = 0f; inWindow = 0
                }
            }
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

    override fun onFlush() {
        lp = FloatArray(channels); bassLp = 0f; energy = 0f; inWindow = 0; average = 0f
        // Перемотка/новая песня: буфер проигрывателя пуст, старые удары больше не прозвучат.
        flushC = Double.NaN; curMax = Double.NaN; prevMax = Double.NaN; lastBeatAudio = -1e9; beats.clear()
    }
}
