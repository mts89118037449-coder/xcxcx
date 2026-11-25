package com.zagruzchik.app

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

/**
 * Вход в ВК через встроенный браузер — как на сайте m.vk.ru. После входа забираем куки сессии,
 * и «Музыка из ВК» ищет песни так же, как это делает сам сайт. Пароль приложению не нужен и не виден.
 */
class VkLoginActivity : Activity() {

    private lateinit var status: TextView
    private lateinit var out: Button
    private var web: WebView? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        VkSource.init(this)
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.rgb(18, 18, 22))
        }
        status = TextView(this).apply {
            textSize = 14f; setTextColor(Color.WHITE)
            setPadding(dp(16), dp(12), dp(16), dp(4))
        }
        out = Button(this).apply {
            text = "Выйти из ВК"
            visibility = android.view.View.GONE
            setOnClickListener {
                CookieManager.getInstance().removeAllCookies(null)
                CookieManager.getInstance().flush()
                VkSource.logout()
                finish()
            }
        }
        val webView = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.userAgentString = UA
            CookieManager.getInstance().setAcceptCookie(true)
            CookieManager.getInstance().setAcceptThirdPartyCookies(this, true)
            webViewClient = object : WebViewClient() {
                override fun onPageFinished(view: WebView, url: String) {
                    checkLogin(view)
                }
            }
        }
        web = webView
        root.addView(status, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        root.addView(webView, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
        root.addView(out, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        setContentView(root)
        render()
        webView.loadUrl("https://m.vk.ru/")
    }

    private fun checkLogin(web: WebView) {
        val cm = CookieManager.getInstance()
        val sid = cm.getCookie("https://m.vk.ru")?.contains("remixsid") == true ||
            cm.getCookie("https://vk.ru")?.contains("remixsid") == true
        if (!sid) return
        VkSource.saveCookies(cm)
        // ВК привязывает сессию к браузеру: запоминаем UA браузера, запросы пойдут с ним же.
        VkSource.saveUa(web.settings.userAgentString)
        cm.flush()
        render()
        // id аккаунта — в фоне, страницу не держим
        Thread {
            runCatching { VkSource.ensureUserId() }
            runOnUiThread { render() }
        }.start()
    }

    private fun render() {
        if (VkSource.loggedIn) {
            status.text = "Подключён" + (VkSource.userId.takeIf { it != 0L }?.let { " · id$it" } ?: "") +
                "\nПоиск ВК работает, пока жива сессия в этом браузере."
            out.visibility = android.view.View.VISIBLE
        } else {
            status.text = "Войдите в свой аккаунт ВК — как в обычном браузере. Приложение видит только куки сессии, пароль — нет."
            out.visibility = android.view.View.GONE
        }
    }

    override fun onDestroy() {
        (web?.parent as? ViewGroup)?.removeView(web)
        web?.destroy()
        web = null
        super.onDestroy()
    }

    companion object {
        private const val UA = "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36"
        fun open(a: Activity) = a.startActivity(Intent(a, VkLoginActivity::class.java))
    }
}
