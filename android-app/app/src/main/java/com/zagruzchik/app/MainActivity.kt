package com.zagruzchik.app

import android.Manifest
import android.app.Activity
import android.app.AlertDialog
import android.content.ClipboardManager
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.text.InputType
import android.widget.EditText
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast

class MainActivity : Activity() {

    private lateinit var input: EditText
    private lateinit var accounts: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        title = "Загрузчик"

        input = EditText(this).apply {
            hint = "Вставьте ссылку"
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI
            setSingleLine(true)
        }
        accounts = text("", 14f, muted = true)

        val root = column().apply {
            addView(text("Скачать по ссылке", 22f, bold = true))
            addView(text("В любом приложении нажмите «Поделиться» → «Загрузчик». Или вставьте ссылку сюда:", 15f, muted = true))
            addView(input)
            Format.entries.forEach { f -> addView(button(f.label, primary = f == Format.BEST) { download(f) }) }
            addView(text("Файлы сохраняются в «Загрузки/${Storage.FOLDER}».", 13f, muted = true))

            addView(spacer(28))
            addView(text("Аккаунты", 20f, bold = true))
            addView(text("Нужно для Instagram, видео 18+ и приватных публикаций.", 14f, muted = true))
            addView(accounts)
            addView(button("Войти в аккаунт", primary = false) { chooseSite() })
            addView(button("Загрузить файл cookies.txt", primary = false) { pickCookiesFile() })
            addView(button("Выйти из всех аккаунтов", primary = false) { logoutAll() })

            addView(spacer(28))
            addView(text("YouTube, TikTok, Instagram, X, VK, Rutube, SoundCloud, Spotify (треки) и ещё ~1800 сайтов.", 13f, muted = true))
        }
        setContentView(ScrollView(this).apply { addView(root) })

        handleIntent(intent)
        askNotificationPermission()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleIntent(intent)
    }

    override fun onResume() {
        super.onResume()
        val sites = Cookies.loggedInSites(this)
        accounts.text = if (sites.isEmpty()) "Вход не выполнен." else "Выполнен вход: ${sites.joinToString(", ")}"
    }

    // Android разрешает читать буфер обмена, только когда окно в фокусе.
    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (!hasFocus || input.text.isNotBlank()) return
        val clip = getSystemService(ClipboardManager::class.java).primaryClip
        val text = clip?.takeIf { it.itemCount > 0 }?.getItemAt(0)?.coerceToText(this)?.toString()
        Links.extract(text)?.let { input.setText(it) }
    }

    private fun handleIntent(intent: Intent?) {
        intent?.getStringExtra(DownloadService.EXTRA_URL)?.let { input.setText(it) }
    }

    private fun download(format: Format) {
        val url = Links.extract(input.text.toString())
        if (url == null) {
            Toast.makeText(this, "Вставьте ссылку", Toast.LENGTH_SHORT).show()
            return
        }
        DownloadService.start(this, url, format)
        Toast.makeText(this, "Скачиваю — следите за уведомлением", Toast.LENGTH_SHORT).show()
        input.setText("")
    }

    private fun chooseSite() {
        AlertDialog.Builder(this)
            .setTitle("Куда войти?")
            .setItems(Cookies.SITES.map { it.name }.toTypedArray()) { _, i ->
                startActivity(Intent(this, LoginActivity::class.java).putExtra(LoginActivity.EXTRA_SITE, i))
            }
            .setNegativeButton("Отмена", null)
            .show()
    }

    private fun pickCookiesFile() {
        AlertDialog.Builder(this)
            .setTitle("Файл cookies.txt")
            .setMessage(
                "Если Google не пускает во встроенном окне входа:\n\n" +
                    "1. Установите Firefox и дополнение «Get cookies.txt LOCALLY».\n" +
                    "2. Войдите на сайт в Firefox (можно через Google).\n" +
                    "3. Нажмите значок дополнения → Export.\n" +
                    "4. Выберите сохранённый файл здесь.\n\n" +
                    "После загрузки удалите файл из «Загрузок»: по нему можно войти в ваш аккаунт."
            )
            .setPositiveButton("Выбрать файл") { _, _ ->
                startActivityForResult(
                    Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("text/*"),
                    REQ_COOKIES,
                )
            }
            .setNegativeButton("Отмена", null)
            .show()
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != REQ_COOKIES || resultCode != RESULT_OK) return
        val uri = data?.data ?: return
        val n = try {
            contentResolver.openInputStream(uri)!!.bufferedReader().use { Cookies.import(this, it.readText()) }
        } catch (e: Exception) {
            0
        }
        Toast.makeText(this, if (n > 0) "Вход сохранён" else "В файле нет данных для входа", Toast.LENGTH_LONG).show()
        onResume()
    }

    private fun logoutAll() {
        AlertDialog.Builder(this)
            .setMessage("Удалить все сохранённые входы в аккаунты?")
            .setPositiveButton("Удалить") { _, _ ->
                Cookies.clear(this)
                onResume()
            }
            .setNegativeButton("Отмена", null)
            .show()
    }

    private fun askNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1)
        }
    }

    companion object {
        private const val REQ_COOKIES = 10
    }
}
