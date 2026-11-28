package com.zagruzchik.app

import android.content.Context
import android.content.SharedPreferences
import android.media.audiofx.BassBoost
import android.media.audiofx.Equalizer
import android.media.audiofx.Virtualizer
import android.util.Log
import kotlin.math.ln

/**
 * Эквалайзер, усиление баса и объём (3D) — встроенные эффекты Android, подключённые к проигрывателю.
 * Кривая хранится в децибелах на 5 опорных частотах и раскладывается на полосы конкретного телефона
 * (их бывает 5, 6 или 10 — с разными частотами), поэтому пресеты звучат одинаково на любом устройстве.
 */
object AudioFx {
    /** Опорные частоты кривой, Гц. */
    val FREQS = floatArrayOf(60f, 230f, 910f, 3600f, 14000f)
    val LABELS = listOf("60 Гц", "230 Гц", "910 Гц", "3,6 кГц", "14 кГц")
    const val MAX_DB = 12f

    class Preset(val name: String, val gains: FloatArray, val bass: Int, val virt: Int)

    val PRESETS = listOf(
        Preset("Обычный", floatArrayOf(0f, 0f, 0f, 0f, 0f), 0, 0),
        Preset("Бас", floatArrayOf(6f, 4f, 0f, 0f, 1f), 500, 0),
        Preset("Рэп", floatArrayOf(5f, 3f, -1f, 1f, 3f), 400, 150),
        Preset("Рок", floatArrayOf(4f, 2f, -2f, 2f, 4f), 200, 200),
        Preset("Поп", floatArrayOf(-1f, 2f, 4f, 2f, -1f), 100, 100),
        Preset("Электро", floatArrayOf(5f, 2f, 0f, 2f, 5f), 450, 300),
        Preset("Вокал", floatArrayOf(-2f, 0f, 4f, 3f, 1f), 0, 0),
        Preset("Акустика", floatArrayOf(3f, 1f, 1f, 2f, 3f), 100, 150),
        Preset("Классика", floatArrayOf(3f, 2f, -1f, 1f, 4f), 0, 250),
        Preset("Наушники", floatArrayOf(2f, 1f, 0f, 1f, 2f), 200, 500),
    )
    const val CUSTOM = "Свой"

    private const val TAG = "AudioFx"
    private var eq: Equalizer? = null
    private var bass: BassBoost? = null
    private var virt: Virtualizer? = null
    private var dyn: android.media.audiofx.AudioEffect? = null
    private var session = 0
    private var app: Context? = null

    private fun prefs(ctx: Context) = ctx.getSharedPreferences("app", Context.MODE_PRIVATE)

    // ---------------- Настройки ----------------

    fun enabled(ctx: Context) = prefs(ctx).getBoolean("fx_on", false)
    fun preset(ctx: Context) = prefs(ctx).getString("fx_preset", "Обычный")!!
    fun gains(ctx: Context): FloatArray =
        prefs(ctx).getString("fx_gains", null)?.split(',')?.mapNotNull { it.toFloatOrNull() }?.takeIf { it.size == 5 }?.toFloatArray()
            ?: PRESETS.first { it.name == preset(ctx) || it.name == "Обычный" }.gains.copyOf()
    fun protectPeaks(ctx: Context) = prefs(ctx).getBoolean("fx_protect_peaks", true)
    fun setProtectPeaks(ctx: Context, on: Boolean) = prefs(ctx).edit().putBoolean("fx_protect_peaks", on).apply()

    internal fun headroom(gains: FloatArray, bass: Int): Float =
        (gains.maxOrNull() ?: 0f).coerceAtLeast(0f) + 3f * bass.coerceIn(0, 1000) / 1000f

    fun bass(ctx: Context) = prefs(ctx).getInt("fx_bass", 0)
    fun virt(ctx: Context) = prefs(ctx).getInt("fx_virt", 0)

    // ---- Отдельно от эквалайзера: громкость, верхи, тишина на стыках ----
    /** Выравнивание громкости: тихие песни подтягиваются, громкие прижимаются — не надо крутить громкость между песнями. */
    fun leveling(ctx: Context) = prefs(ctx).getBoolean("fx_level", false)
    fun setLeveling(ctx: Context, on: Boolean) = prefs(ctx).edit().putBoolean("fx_level", on).apply()
    /** Восстановление верхов: 0 — выкл, 1 — легко, 2 — сильнее. */
    fun exciter(ctx: Context) = prefs(ctx).getInt("fx_exciter", 0)
    fun setExciter(ctx: Context, v: Int) = prefs(ctx).edit().putInt("fx_exciter", v.coerceIn(0, 2)).apply()
    /** Вырезать тишину — переходы без пауз. По умолчанию выключено: проигрыватель режет тишину и внутри песни тоже. */
    fun skipSilence(ctx: Context) = prefs(ctx).getBoolean("fx_skip_silence", false)
    fun setSkipSilence(ctx: Context, on: Boolean) = prefs(ctx).edit().putBoolean("fx_skip_silence", on).apply()
    /** Проигрыватель подписывается сюда, чтобы применять «тишину» сразу. */
    @Volatile var onSkipSilence: ((Boolean) -> Unit)? = null

    fun setEnabled(ctx: Context, on: Boolean) = prefs(ctx).edit().putBoolean("fx_on", on).apply()
    fun setGains(ctx: Context, g: FloatArray, presetName: String = CUSTOM) =
        prefs(ctx).edit().putString("fx_gains", g.joinToString(",")).putString("fx_preset", presetName).apply()
    fun setBass(ctx: Context, v: Int) = prefs(ctx).edit().putInt("fx_bass", v).putString("fx_preset", CUSTOM).apply()
    fun setVirt(ctx: Context, v: Int) = prefs(ctx).edit().putInt("fx_virt", v).putString("fx_preset", CUSTOM).apply()

    fun applyPreset(ctx: Context, p: Preset) {
        prefs(ctx).edit().putString("fx_gains", p.gains.joinToString(",")).putInt("fx_bass", p.bass).putInt("fx_virt", p.virt)
            .putString("fx_preset", p.name).putBoolean("fx_on", true).apply()
    }

    /** Есть ли на телефоне эффекты вообще (на некоторых прошивках их вырезают). */
    var available = true; private set

    // ---------------- Подключение к проигрывателю ----------------

    // Настройки поменяли (экран эквалайзера) — сразу слышно, без перезапуска.
    private val listener = SharedPreferences.OnSharedPreferenceChangeListener { _, key ->
        if (key != null && key.startsWith("fx_")) app?.let { apply(it) }
    }

    @Synchronized fun attach(ctx: Context, audioSession: Int) {
        if (audioSession == 0 || audioSession == session) return
        release()
        session = audioSession
        if (app == null) {
            app = ctx.applicationContext
            prefs(ctx).registerOnSharedPreferenceChangeListener(listener)
        }
        eq = runCatching { Equalizer(0, audioSession) }.onFailure { Log.w(TAG, "no equalizer", it); available = false }.getOrNull()
        bass = runCatching { BassBoost(0, audioSession) }.getOrNull()
        virt = runCatching { Virtualizer(0, audioSession) }.getOrNull()
        // Выравнивание громкости: один компрессор на весь спектр и ограничитель, чтобы не было перегруза.
        dyn = if (android.os.Build.VERSION.SDK_INT >= 28) runCatching {
            createDynamics(audioSession)
        }.onFailure { Log.w(TAG, "no dynamics", it) }.getOrNull() else null
        apply(ctx)
    }

    @androidx.annotation.RequiresApi(28)
    private fun createDynamics(audioSession: Int): android.media.audiofx.AudioEffect {
        val cfg = android.media.audiofx.DynamicsProcessing.Config.Builder(
            android.media.audiofx.DynamicsProcessing.VARIANT_FAVOR_FREQUENCY_RESOLUTION, 2, false, 0, true, 1, false, 0, true).build()
        return android.media.audiofx.DynamicsProcessing(0, audioSession, cfg).apply {
            setLimiterAllChannelsTo(android.media.audiofx.DynamicsProcessing.Limiter(true, true, 0, 1f, 80f, 12f, -1.5f, 0f))
        }
    }

    @Synchronized fun release() {
        runCatching { eq?.release() }; runCatching { bass?.release() }; runCatching { virt?.release() }; runCatching { dyn?.release() }
        eq = null; bass = null; virt = null; dyn = null; session = 0
    }

    /** Кривая в дБ на частоте [hz]: плавно между опорными точками (по логарифму частоты). */
    fun gainAt(g: FloatArray, hz: Float): Float {
        val x = ln(hz.coerceIn(FREQS.first(), FREQS.last()))
        for (i in 0 until FREQS.size - 1) {
            val a = ln(FREQS[i]); val b = ln(FREQS[i + 1])
            if (x <= b) { val t = (x - a) / (b - a); return g[i] + (g[i + 1] - g[i]) * t }
        }
        return g.last()
    }

    @androidx.annotation.OptIn(androidx.media3.common.util.UnstableApi::class)
    @Synchronized fun apply(ctx: Context) {
        val on = enabled(ctx)
        eq?.let { e ->
            runCatching {
                e.enabled = on
                val g = gains(ctx)
                val reserve = if (protectPeaks(ctx)) headroom(g, bass(ctx)) else 0f
                val (min, max) = e.bandLevelRange.let { it[0].toInt() to it[1].toInt() }
                for (i in 0 until e.numberOfBands) {
                    val hz = e.getCenterFreq(i.toShort()) / 1000f
                    val mb = ((gainAt(g, hz) - reserve) * 100).toInt().coerceIn(min, max)
                    e.setBandLevel(i.toShort(), mb.toShort())
                }
            }.onFailure { Log.w(TAG, "eq apply", it) }
        }
        bass?.let { b -> runCatching { b.enabled = on && bass(ctx) > 0; if (b.strengthSupported) b.setStrength(bass(ctx).toShort()) } }
        virt?.let { v -> runCatching { v.enabled = on && virt(ctx) > 0; if (v.strengthSupported) v.setStrength(virt(ctx).toShort()) } }
        if (android.os.Build.VERSION.SDK_INT >= 28) {
            (dyn as? android.media.audiofx.DynamicsProcessing)?.let { dynamics ->
                runCatching {
                    val leveling = leveling(ctx)
                    dynamics.setMbcBandAllChannelsTo(0, android.media.audiofx.DynamicsProcessing.MbcBand(
                        leveling, 20_000f, 40f, 350f, 2.5f, -19f, 6f, -70f, 1f, 0f, 3f,
                    ))
                    dynamics.enabled = leveling || (on && protectPeaks(ctx))
                }.onFailure { Log.w(TAG, "dynamics apply", it) }
            }
        }
        runCatching { Exciter.level = exciter(ctx) }
        onSkipSilence?.invoke(skipSilence(ctx))
    }
}
