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
    private var session = 0
    private var app: Context? = null

    private fun prefs(ctx: Context) = ctx.getSharedPreferences("app", Context.MODE_PRIVATE)

    // ---------------- Настройки ----------------

    fun enabled(ctx: Context) = prefs(ctx).getBoolean("fx_on", false)
    fun preset(ctx: Context) = prefs(ctx).getString("fx_preset", "Обычный")!!
    fun gains(ctx: Context): FloatArray =
        prefs(ctx).getString("fx_gains", null)?.split(',')?.mapNotNull { it.toFloatOrNull() }?.takeIf { it.size == 5 }?.toFloatArray()
            ?: PRESETS.first { it.name == preset(ctx) || it.name == "Обычный" }.gains.copyOf()
    fun bass(ctx: Context) = prefs(ctx).getInt("fx_bass", 0)
    fun virt(ctx: Context) = prefs(ctx).getInt("fx_virt", 0)

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
        apply(ctx)
    }

    @Synchronized fun release() {
        runCatching { eq?.release() }; runCatching { bass?.release() }; runCatching { virt?.release() }
        eq = null; bass = null; virt = null; session = 0
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

    @Synchronized fun apply(ctx: Context) {
        val on = enabled(ctx)
        eq?.let { e ->
            runCatching {
                e.enabled = on
                val g = gains(ctx)
                val (min, max) = e.bandLevelRange.let { it[0].toInt() to it[1].toInt() }
                for (i in 0 until e.numberOfBands) {
                    val hz = e.getCenterFreq(i.toShort()) / 1000f
                    val mb = (gainAt(g, hz) * 100).toInt().coerceIn(min, max)
                    e.setBandLevel(i.toShort(), mb.toShort())
                }
            }.onFailure { Log.w(TAG, "eq apply", it) }
        }
        bass?.let { b -> runCatching { b.enabled = on && bass(ctx) > 0; if (b.strengthSupported) b.setStrength(bass(ctx).toShort()) } }
        virt?.let { v -> runCatching { v.enabled = on && virt(ctx) > 0; if (v.strengthSupported) v.setStrength(virt(ctx).toShort()) } }
    }
}
