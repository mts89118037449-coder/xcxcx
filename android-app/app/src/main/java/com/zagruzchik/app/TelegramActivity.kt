package com.zagruzchik.app

import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.text.InputType
import android.view.Gravity
import android.view.ViewGroup
import android.widget.EditText
import android.widget.ImageButton
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.res.ResourcesCompat
import com.google.android.material.button.MaterialButton
import com.google.android.material.color.MaterialColors
import kotlin.concurrent.thread

/** Подключение Telegram как источника музыки: ключи приложения → номер → код → (пароль) → готово. */
class TelegramActivity : AppCompatActivity() {
    private lateinit var box: LinearLayout
    private val onSurface by lazy { MaterialColors.getColor(this, com.google.android.material.R.attr.colorOnSurface, Color.WHITE) }
    private val muted by lazy { MaterialColors.getColor(this, com.google.android.material.R.attr.colorOnSurfaceVariant, Color.GRAY) }
    private val listener: () -> Unit = { render() }
    private var shown: Telegram.State? = null
    private var shownError: String? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; fitsSystemWindows = true; setPadding(dp(20), dp(8), dp(20), dp(32)) }
        root.addView(ImageButton(this).apply {
            setImageResource(R.drawable.ic_arrow_back); setColorFilter(onSurface); background = getDrawable(R.drawable.bg_round_button)
            contentDescription = "Назад"; setOnClickListener { finish() }
        }, LinearLayout.LayoutParams(dp(44), dp(44)))
        root.addView(TextView(this).apply {
            text = "Музыка\nиз Telegram"; textSize = 28f; setTextColor(onSurface); typeface = ResourcesCompat.getFont(this@TelegramActivity, R.font.unbounded_bold)
            setPadding(0, dp(16), 0, dp(6)); setLineSpacing(0f, 1.05f)
        })
        box = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        root.addView(box)
        setContentView(ScrollView(this).apply { addView(root) })
        Telegram.start(this)
    }

    override fun onResume() { super.onResume(); Telegram.listen(listener); shown = null; render() }
    override fun onPause() { Telegram.unlisten(listener); super.onPause() }

    private fun text(s: String, size: Float = 14f, color: Int = muted) = TextView(this).apply {
        text = s; textSize = size; setTextColor(color); setLineSpacing(0f, 1.25f); setPadding(0, dp(8), 0, dp(4)); setTextIsSelectable(false)
    }.also { box.addView(it) }

    private fun field(hint: String, type: Int, value: String = "") = EditText(this).apply {
        this.hint = hint; inputType = type; setSingleLine(); setText(value)
    }.also { box.addView(it, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(6) }) }

    private fun button(label: String, primary: Boolean = true, click: () -> Unit) = (if (primary) MaterialButton(this) else
        MaterialButton(this, null, com.google.android.material.R.attr.materialButtonOutlinedStyle)).apply {
        text = label; if (primary) Aura.primaryButton(this); insetTop = 0; insetBottom = 0; setOnClickListener { click() }
    }.also { box.addView(it, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(52)).apply { topMargin = dp(12) }) }

    private fun render() {
        val st = if (!Telegram.hasKeys(this)) Telegram.State.NO_KEYS else Telegram.state
        // Тот же шаг и та же ошибка — не перерисовываем (иначе стирается то, что человек печатает).
        if (st == shown && Telegram.error == shownError && st != Telegram.State.READY) return
        shown = st; shownError = Telegram.error
        box.removeAllViews()
        when (st) {
            Telegram.State.NO_KEYS -> {
                text("SoundAura ищет музыку в Telegram так же, как само приложение Telegram — через его встроенный поиск музыки. Для этого нужно войти в свой аккаунт.")
                text("Шаг 1 из 3. Ключи приложения", 16f, onSurface)
                text("Telegram выдаёт их бесплатно каждому: откройте my.telegram.org → войдите по номеру → «API development tools» → создайте приложение (название любое). Скопируйте оттуда api_id и api_hash.")
                button("Открыть my.telegram.org", primary = false) { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://my.telegram.org/apps"))) }
                val id = field("api_id (число)", InputType.TYPE_CLASS_NUMBER)
                val hash = field("api_hash (32 символа)", InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS)
                button("Дальше") {
                    val n = id.text.toString().trim().toIntOrNull()
                    val h = hash.text.toString().trim()
                    if (n == null || n <= 0 || h.length < 16) toast("Проверьте api_id и api_hash") else Telegram.setKeys(this, n, h)
                }
            }
            Telegram.State.STARTING -> text("Подключаюсь к Telegram…", 16f, onSurface)
            Telegram.State.PHONE -> {
                text("Шаг 2 из 3. Номер телефона", 16f, onSurface)
                text("Номер вашего аккаунта Telegram, в международном виде.")
                val phone = field("+7 900 000-00-00", InputType.TYPE_CLASS_PHONE)
                button("Получить код") { Telegram.sendPhone(phone.text.toString()) }
                button("Другие ключи приложения", primary = false) { Telegram.logout(forgetKeys = true) }
            }
            Telegram.State.CODE -> {
                text("Шаг 3 из 3. Код", 16f, onSurface)
                text(Telegram.hint)
                val code = field("Код", InputType.TYPE_CLASS_NUMBER)
                button("Войти") { Telegram.sendCode(code.text.toString()) }
            }
            Telegram.State.PASSWORD -> {
                text("Облачный пароль", 16f, onSurface)
                text(Telegram.hint)
                val pw = field("Пароль", InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD)
                button("Войти") { Telegram.sendPassword(pw.text.toString()) }
            }
            Telegram.State.READY -> {
                text("Подключено" + if (Telegram.me.isNotBlank()) ": ${Telegram.me}" else "", 18f, onSurface)
                text("Telegram теперь один из источников: если песня там есть, она включится оттуда. В плеере будет подпись «Telegram · MP3 320» (формат и качество файла).")
                val q = field("Проверка: исполнитель и название", InputType.TYPE_CLASS_TEXT)
                val out = TextView(this).apply { textSize = 13f; setTextColor(muted); setPadding(0, dp(8), 0, 0); setLineSpacing(0f, 1.25f) }
                button("Найти", primary = false) {
                    val query = q.text.toString().trim()
                    if (query.isEmpty()) return@button
                    out.text = "Ищу…"
                    thread {
                        val r = runCatching { Telegram.search(query) }
                        runOnUiThread {
                            out.text = r.fold({ l ->
                                if (l.isEmpty()) "Ничего не нашлось" else l.take(8).joinToString("\n") { "${it.artist} — ${it.title} · ${it.durationSec / 60}:${"%02d".format(it.durationSec % 60)} · ${it.format} ${it.kbps}" }
                            }, { e -> (e as? UserError)?.message ?: "Ошибка: ${e.message}" })
                        }
                    }
                }
                box.addView(out)
                button("Выйти из Telegram", primary = false) { Telegram.logout(forgetKeys = false) }
                button("Выйти и стереть ключи", primary = false) { Telegram.logout(forgetKeys = true) }
            }
            Telegram.State.ERROR -> {
                text("Не получилось", 16f, onSurface)
                button("Ввести ключи заново") { Telegram.logout(forgetKeys = true) }
            }
        }
        Telegram.error?.let { text(it, 14f, 0xFFFF6B8A.toInt()) }
    }

    private fun toast(s: String) = android.widget.Toast.makeText(this, s, android.widget.Toast.LENGTH_SHORT).show()

    companion object {
        fun open(ctx: Context) = ctx.startActivity(Intent(ctx, TelegramActivity::class.java))
    }

    @Suppress("unused") private fun g() = Gravity.CENTER
}
