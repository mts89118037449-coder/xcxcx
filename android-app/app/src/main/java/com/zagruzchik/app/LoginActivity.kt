package com.zagruzchik.app

import android.annotation.SuppressLint
import android.app.Activity
import android.os.Bundle
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.LinearLayout
import android.widget.Toast

/** Встроенное окно входа: человек входит на сайт как обычно, а мы сохраняем вход для загрузчика. */
class LoginActivity : Activity() {

    private lateinit var site: Cookies.Site
    private lateinit var web: WebView

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        site = Cookies.SITES.getOrNull(intent.getIntExtra(EXTRA_SITE, -1)) ?: return finish()
        title = "Вход: ${site.name}"

        web = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            webViewClient = WebViewClient()
            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f)
        }
        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true)

        val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        val bar = column(12).apply {
            addView(text("Войдите в аккаунт ${site.name}, затем нажмите кнопку ниже.", 14f))
            addView(button("Готово — сохранить вход") { save() })
        }
        root.addView(bar)
        root.addView(web)
        setContentView(root)
        web.loadUrl(site.loginUrl)
    }

    private fun save() {
        val n = Cookies.saveFromWebView(this, site)
        if (n == 0) {
            Toast.makeText(this, "Вход не найден. Сначала войдите в аккаунт на этой странице.", Toast.LENGTH_LONG).show()
            return
        }
        Toast.makeText(this, "Вход в ${site.name} сохранён", Toast.LENGTH_SHORT).show()
        finish()
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (web.canGoBack()) web.goBack() else super.onBackPressed()
    }

    companion object {
        const val EXTRA_SITE = "site"
    }
}
