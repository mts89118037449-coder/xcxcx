package com.zagruzchik.app

import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Bundle
import android.text.InputType
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
 * Вход в ВК через нативный VK Android API, встроенный браузер (m.vk.ru / OAuth) или внешний браузер.
 * Приложение сохраняет только токен доступа (или куки сессии), пароль не сохраняется.
 */
class VkLoginActivity : Activity() {

    private lateinit var status: TextView
    private lateinit var progressBar: ProgressBar
    private lateinit var mirrorBtn: Button
    private lateinit var out: Button
    private var web: WebView? = null
    private var useMirror = false

    private fun styledButton(label: String, accent: Boolean = false, onClick: Button.() -> Unit): Button =
        Button(this).apply {
            text = label
            textSize = 12.5f
            isAllCaps = false
            setTextColor(Color.WHITE)
            minHeight = 0
            minimumHeight = 0
            setPadding(dp(10), dp(9), dp(10), dp(9))
            background = GradientDrawable().apply {
                cornerRadius = dp(12).toFloat()
                if (accent) {
                    setColor(Color.parseColor("#7C4DFF"))
                } else {
                    setColor(Color.parseColor("#26262E"))
                    setStroke(dp(1), Color.parseColor("#383844"))
                }
            }
            setOnClickListener { onClick() }
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        VkSource.init(this)
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.rgb(18, 18, 22))
        }
        status = TextView(this).apply {
            textSize = 14f; setTextColor(Color.WHITE)
            setPadding(dp(16), dp(14), dp(16), dp(6))
            setLineSpacing(dp(2).toFloat(), 1f)
        }
        progressBar = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
            max = 100
            isIndeterminate = false
            visibility = View.VISIBLE
        }
        val vkApiBtn = styledButton("Логин ВК (API)", accent = true) {
            showVkAndroidLoginDialog()
        }
        val siteBtn = styledButton("Сайт m.vk.ru") {
            progressBar.isIndeterminate = false
            progressBar.visibility = View.VISIBLE
            progressBar.progress = 10
            web?.loadUrl("https://m.vk.ru/")
        }
        mirrorBtn = styledButton("Зеркало vk.ru") {
            useMirror = !useMirror
            text = if (useMirror) "Основной vk.com" else "Зеркало vk.ru"
            progressBar.isIndeterminate = false
            progressBar.visibility = View.VISIBLE
            render()
            web?.loadUrl(currentOAuthUrl())
        }
        val browserBtn = styledButton("Через браузер") {
            runCatching {
                startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(currentOAuthUrl())))
            }.onFailure {
                Toast.makeText(this@VkLoginActivity, "Не удалось открыть браузер", Toast.LENGTH_SHORT).show()
            }
        }
        val pasteBtn = styledButton("Вставить ссылку") {
            showPasteDialog()
        }
        val rowWeightLp = {
            LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply {
                marginStart = dp(4); marginEnd = dp(4)
            }
        }
        val primaryRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(dp(10), dp(6), dp(10), dp(4))
            addView(vkApiBtn, rowWeightLp())
            addView(siteBtn, rowWeightLp())
        }
        val actionsRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(dp(10), dp(2), dp(10), dp(8))
            addView(mirrorBtn, rowWeightLp())
            addView(browserBtn, rowWeightLp())
            addView(pasteBtn, rowWeightLp())
        }
        out = styledButton("Выйти из ВК") {
            CookieManager.getInstance().removeAllCookies(null)
            CookieManager.getInstance().flush()
            VkSource.logout()
            finish()
        }.apply {
            visibility = View.GONE
            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
                setMargins(dp(14), dp(8), dp(14), dp(12))
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
                    progressBar.isIndeterminate = false
                    progressBar.visibility = View.VISIBLE
                    progressBar.progress = 10
                }

                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                    val url = request.url.toString()
                    if (handleOAuthUrl(url, view)) return true
                    val lower = url.lowercase()
                    if (!lower.startsWith("http://") && !lower.startsWith("https://")) return true
                    return false
                }

                override fun onPageFinished(view: WebView, url: String) {
                    progressBar.visibility = View.GONE
                    if (!handleOAuthUrl(url, view)) checkLogin(view)
                }

                override fun onReceivedError(view: WebView?, request: WebResourceRequest?, error: WebResourceError?) {
                    if (request?.isForMainFrame != true) return
                    progressBar.visibility = View.GONE
                    val desc = error?.description?.toString()?.takeIf { it.isNotBlank() } ?: "сеть/VPN недоступны"
                    status.text = "Ошибка загрузки (${error?.errorCode ?: -1}): $desc\nПопробуйте «Логин ВК (API)», «Сайт m.vk.ru» или «Зеркало vk.ru»."
                }

                override fun onReceivedHttpError(view: WebView?, request: WebResourceRequest?, errorResponse: WebResourceResponse?) {
                    if (request?.isForMainFrame != true) return
                    val code = errorResponse?.statusCode ?: return
                    if (code < 400) return
                    progressBar.visibility = View.GONE
                    status.text = "Ошибка HTTP $code: ${errorResponse.reasonPhrase.orEmpty()}\nПопробуйте «Логин ВК (API)», «Сайт m.vk.ru» или «Зеркало vk.ru»."
                }
            }
        }
        web = webView
        root.addView(status, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        root.addView(progressBar, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(3)))
        root.addView(primaryRow, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        root.addView(actionsRow, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        root.addView(webView, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
        root.addView(out, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        setContentView(root)
        render()
        webView.loadUrl(currentOAuthUrl())
    }

    private fun currentOAuthUrl(): String = if (useMirror) OAUTH_URL_MIRROR else OAUTH_URL

    private fun showVkAndroidLoginDialog(
        prefillLogin: String = "",
        prefillPass: String = "",
        pendingOtp: VkSource.VkAndroidAuthResult.NeedOtp? = null
    ) {
        val box = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(12), dp(20), dp(4))
        }
        val loginInput = EditText(this).apply {
            hint = "Телефон или почта"
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS
            setText(prefillLogin)
        }
        val passInput = EditText(this).apply {
            hint = "Пароль"
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
            setText(prefillPass)
        }
        box.addView(loginInput)
        box.addView(passInput)
        val otpInput = if (pendingOtp != null) {
            EditText(this).apply {
                hint = "Код подтверждения (2FA / СМС / пуш)"
                inputType = InputType.TYPE_CLASS_TEXT
            }.also { box.addView(it) }
        } else null

        val builder = AlertDialog.Builder(this)
            .setTitle(if (pendingOtp != null) "Подтверждение входа ВК" else "Логин ВК (API)")
            .setMessage(pendingOtp?.description ?: "Нативный вход официального клиента VK Android. Пароль используется только для получения токена и не сохраняется.")
            .setView(box)
            .setPositiveButton("Войти") { _, _ ->
                val login = loginInput.text?.toString()?.trim().orEmpty()
                val pass = passInput.text?.toString().orEmpty()
                val code = otpInput?.text?.toString()?.trim().orEmpty()
                if (login.isBlank() || pass.isBlank()) {
                    Toast.makeText(this, "Введите телефон/почту и пароль", Toast.LENGTH_SHORT).show()
                    return@setPositiveButton
                }
                if (pendingOtp != null && code.isBlank()) {
                    Toast.makeText(this, "Введите код подтверждения", Toast.LENGTH_SHORT).show()
                    return@setPositiveButton
                }
                progressBar.isIndeterminate = true
                progressBar.visibility = View.VISIBLE
                status.text = "Вход в ВК (VK Android API)..."
                Thread {
                    val outcome = runCatching {
                        if (pendingOtp != null) {
                            VkSource.completeVkAndroidOtp(pendingOtp.sid, pendingOtp.anonymToken, login, pass, code)
                        } else {
                            VkSource.loginVkAndroid(login, pass)
                        }
                    }
                    runOnUiThread {
                        progressBar.isIndeterminate = false
                        progressBar.visibility = View.GONE
                        outcome.onSuccess { res ->
                            when (res) {
                                is VkSource.VkAndroidAuthResult.Success -> {
                                    render()
                                    Toast.makeText(this, "Вход в ВК выполнен", Toast.LENGTH_SHORT).show()
                                }
                                is VkSource.VkAndroidAuthResult.NeedOtp -> {
                                    render()
                                    showVkAndroidLoginDialog(login, pass, res)
                                }
                            }
                        }.onFailure { err ->
                            val msg = (err as? UserError)?.message ?: err.message ?: "ошибка входа"
                            status.text = "Ошибка входа ВК (API): $msg"
                            Toast.makeText(this, msg, Toast.LENGTH_LONG).show()
                        }
                    }
                }.start()
            }
            .setNegativeButton("Отмена", null)
        builder.show()
    }

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

    private fun handleOAuthUrl(url: String, view: WebView? = web): Boolean {
        if (!url.startsWith("https://oauth.vk.com/blank.html") &&
            !url.startsWith("https://oauth.vk.ru/blank.html") &&
            !url.contains("access_token=")
        ) return false
        val parsed = VkSource.parseOAuthRedirect(url) ?: return false
        VkSource.saveToken(parsed.first, parsed.second)
        view?.let { checkLogin(it) }
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
            val mode = when {
                VkSource.isApiUsable && VkSource.tokenType == VkSource.TOKEN_TYPE_VK_ANDROID -> "VK Android API"
                VkSource.isApiUsable -> "Kate API"
                else -> "Web"
            }
            status.text = "Подключён" + (VkSource.userId.takeIf { it != 0L }?.let { " · id$it" } ?: "") + " · $mode" +
                "\nПоиск и музыка ВК работают."
            out.visibility = View.VISIBLE
        } else {
            status.text = "Войдите через «Логин ВК (API)» или «Сайт m.vk.ru» (классический вход по кукам). Приложение не хранит пароль."
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
