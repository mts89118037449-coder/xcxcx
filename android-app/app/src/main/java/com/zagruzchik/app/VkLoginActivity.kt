package com.zagruzchik.app

import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast

/**
 * Вход в ВК через встроенный браузер или внешний браузер (Kate Mobile OAuth).
 * Приложение сохраняет только токен доступа (или куки сессии), пароль не виден.
 */
class VkLoginActivity : Activity() {

    private lateinit var status: TextView
    private lateinit var progressBar: ProgressBar
    private lateinit var mirrorBtn: Button
    private lateinit var out: Button
    private var web: WebView? = null
    private var useMirror = false

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
        progressBar = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
            max = 100
            isIndeterminate = false
            visibility = View.VISIBLE
        }
        mirrorBtn = Button(this).apply {
            text = "Зеркало vk.ru"
            textSize = 12f
            setOnClickListener {
                useMirror = !useMirror
                text = if (useMirror) "Основной vk.com" else "Зеркало vk.ru"
                progressBar.visibility = View.VISIBLE
                render()
                web?.loadUrl(currentOAuthUrl())
            }
        }
        val browserBtn = Button(this).apply {
            text = "Через браузер"
            textSize = 12f
            setOnClickListener {
                runCatching {
                    startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(currentOAuthUrl())))
                }.onFailure {
                    Toast.makeText(this@VkLoginActivity, "Не удалось открыть браузер", Toast.LENGTH_SHORT).show()
                }
            }
        }
        val pasteBtn = Button(this).apply {
            text = "Вставить ссылку"
            textSize = 12f
            setOnClickListener { showPasteDialog() }
        }
        val actionsRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(dp(8), dp(2), dp(8), dp(4))
            val btnLp = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply {
                marginStart = dp(4); marginEnd = dp(4)
            }
            addView(mirrorBtn, btnLp)
            addView(browserBtn, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply {
                marginStart = dp(4); marginEnd = dp(4)
            })
            addView(pasteBtn, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply {
                marginStart = dp(4); marginEnd = dp(4)
            })
        }
        out = Button(this).apply {
            text = "Выйти из ВК"
            visibility = View.GONE
            setOnClickListener {
                CookieManager.getInstance().removeAllCookies(null)
                CookieManager.getInstance().flush()
                VkSource.logout()
                finish()
            }
        }
        val webView = WebView(this).apply {
            setBackgroundColor(Color.rgb(18, 18, 22))
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                databaseEnabled = true
                javaScriptCanOpenWindowsAutomatically = true
                useWideViewPort = true
                loadWithOverviewMode = true
                mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
                userAgentString = UA
            }
            CookieManager.getInstance().setAcceptCookie(true)
            CookieManager.getInstance().setAcceptThirdPartyCookies(this, true)
            webChromeClient = object : WebChromeClient() {
                override fun onProgressChanged(view: WebView?, newProgress: Int) {
                    progressBar.progress = newProgress
                    if (newProgress >= 100) progressBar.visibility = View.GONE
                }
            }
            webViewClient = object : WebViewClient() {
                override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                    progressBar.visibility = View.VISIBLE
                    progressBar.progress = 10
                }

                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                    val url = request.url.toString()
                    if (handleOAuthUrl(url)) return true
                    val lower = url.lowercase()
                    if (!lower.startsWith("http://") && !lower.startsWith("https://")) return true
                    return false
                }

                override fun onPageFinished(view: WebView, url: String) {
                    progressBar.visibility = View.GONE
                    if (!handleOAuthUrl(url)) checkLogin(view)
                }

                override fun onReceivedError(view: WebView?, request: WebResourceRequest?, error: WebResourceError?) {
                    if (request?.isForMainFrame != true) return
                    progressBar.visibility = View.GONE
                    val desc = error?.description?.toString()?.takeIf { it.isNotBlank() } ?: "сеть/VPN недоступны"
                    status.text = "Ошибка загрузки (${error?.errorCode ?: -1}): $desc\nПопробуйте «Зеркало vk.ru» или «Через браузер»."
                }

                override fun onReceivedHttpError(view: WebView?, request: WebResourceRequest?, errorResponse: WebResourceResponse?) {
                    if (request?.isForMainFrame != true) return
                    val code = errorResponse?.statusCode ?: return
                    if (code < 400) return
                    progressBar.visibility = View.GONE
                    status.text = "Ошибка HTTP $code: ${errorResponse.reasonPhrase.orEmpty()}\nПопробуйте «Зеркало vk.ru» или «Через браузер»."
                }
            }
        }
        web = webView
        root.addView(status, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        root.addView(progressBar, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(3)))
        root.addView(actionsRow, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        root.addView(webView, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
        root.addView(out, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        setContentView(root)
        render()
        webView.loadUrl(currentOAuthUrl())
    }

    private fun currentOAuthUrl(): String = if (useMirror) OAUTH_URL_MIRROR else OAUTH_URL

    private fun showPasteDialog() {
        val input = EditText(this).apply {
            hint = "https://oauth.vk.com/blank.html#access_token=... или токен"
            setSingleLine(false)
            maxLines = 4
        }
        AlertDialog.Builder(this)
            .setTitle("Вставить ссылку или токен")
            .setMessage("После входа в браузере скопируйте адресную строку (blank.html#access_token=...) и вставьте сюда:")
            .setView(input)
            .setPositiveButton("Сохранить") { _, _ ->
                val raw = input.text?.toString()?.trim().orEmpty()
                val parsed = VkSource.parseOAuthRedirect(raw)
                    ?: raw.takeIf { it.isNotBlank() && !it.contains(' ') && !it.contains("://") && !it.contains("error=") }?.let { it to 0L }
                if (parsed == null) {
                    Toast.makeText(this, "Не найден access_token в ссылке", Toast.LENGTH_SHORT).show()
                } else {
                    VkSource.saveToken(parsed.first, parsed.second)
                    render()
                    if (VkSource.userId == 0L) {
                        Thread {
                            runCatching { VkSource.ensureUserId() }
                            runOnUiThread { render() }
                        }.start()
                    }
                    Toast.makeText(this, "Токен ВК сохранён", Toast.LENGTH_SHORT).show()
                }
            }
            .setNegativeButton("Отмена", null)
            .show()
    }

    private fun handleOAuthUrl(url: String): Boolean {
        if (!url.startsWith("https://oauth.vk.com/blank.html") &&
            !url.startsWith("https://oauth.vk.ru/blank.html") &&
            !url.contains("access_token=")
        ) return false
        val parsed = VkSource.parseOAuthRedirect(url) ?: return false
        VkSource.saveToken(parsed.first, parsed.second)
        render()
        return true
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
            val mode = if (VkSource.hasToken) "Kate API" else "Web"
            status.text = "Подключён" + (VkSource.userId.takeIf { it != 0L }?.let { " · id$it" } ?: "") + " · $mode" +
                "\nПоиск и музыка ВК работают."
            out.visibility = View.VISIBLE
        } else {
            status.text = "Войдите в свой аккаунт ВК через Kate Mobile OAuth. Приложение сохраняет только токен доступа, пароль — нет."
            out.visibility = View.GONE
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
        private const val OAUTH_URL = "https://oauth.vk.com/authorize?client_id=2685278&scope=65544&redirect_uri=https://oauth.vk.com/blank.html&display=page&response_type=token&revoke=1"
        private const val OAUTH_URL_MIRROR = "https://oauth.vk.ru/authorize?client_id=2685278&scope=65544&redirect_uri=https://oauth.vk.ru/blank.html&display=page&response_type=token&revoke=1"
        fun open(a: Activity) = a.startActivity(Intent(a, VkLoginActivity::class.java))
    }
}
