package com.zagruzchik.app

import android.annotation.SuppressLint
import android.os.Bundle
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import android.view.ViewGroup
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.isVisible
import com.google.android.material.appbar.MaterialToolbar
import com.google.android.material.progressindicator.LinearProgressIndicator
import com.google.android.material.snackbar.Snackbar
import kotlin.concurrent.thread

/** Встроенное окно входа: человек входит на сайт как обычно, а мы сохраняем вход для загрузчика. */
class LoginActivity : AppCompatActivity() {

    private lateinit var site: Cookies.Site
    private lateinit var web: WebView

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        site = Cookies.SITES.getOrNull(intent.getIntExtra(EXTRA_SITE, -1)) ?: return finish()
        setContentView(R.layout.activity_login)

        val toolbar = findViewById<MaterialToolbar>(R.id.toolbar)
        toolbar.title = "Вход: ${site.name}"
        toolbar.setNavigationOnClickListener { finish() }
        toolbar.inflateMenu(R.menu.login)
        toolbar.setOnMenuItemClickListener { save(); true }

        val progress = findViewById<LinearProgressIndicator>(R.id.progress)
        web = findViewById(R.id.web)
        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true
        web.webViewClient = WebViewClient()
        web.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView?, newProgress: Int) {
                progress.isVisible = newProgress < 100
                progress.setProgressCompat(newProgress, true)
            }
        }
        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true)

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (web.canGoBack()) web.goBack() else finish()
            }
        })
        web.loadUrl(site.loginUrl)
    }

    private fun save() {
        val app = applicationContext
        thread {
            val n = Cookies.saveFromWebView(app, site)
            runOnUiThread {
                if (isFinishing || isDestroyed) return@runOnUiThread
                if (n == 0) {
                    Snackbar.make(web, "Вход не найден. Сначала войдите в аккаунт на этой странице.", Snackbar.LENGTH_LONG).show()
                } else {
                    Toast.makeText(this, "Вход в ${site.name} сохранён", Toast.LENGTH_SHORT).show()
                    finish()
                }
            }
        }
    }

    override fun onDestroy() {
        if (::web.isInitialized) {
            web.stopLoading()
            (web.parent as? ViewGroup)?.removeView(web)
            web.destroy()
        }
        super.onDestroy()
    }

    companion object {
        const val EXTRA_SITE = "site"
    }
}
