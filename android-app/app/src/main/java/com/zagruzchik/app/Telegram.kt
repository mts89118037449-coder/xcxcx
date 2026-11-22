package com.zagruzchik.app

import android.content.Context
import android.os.Build
import org.drinkless.tdlib.Client
import org.drinkless.tdlib.TdApi
import java.io.File
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * Telegram как источник музыки. Вход — в свой аккаунт, со своими ключами приложения (my.telegram.org).
 * Ищем так же, как официальное приложение: через встроенного аудио-бота Telegram (поиск музыки для историй и вложений).
 * Работает на TDLib — официальной библиотеке Telegram.
 */
object Telegram {
    enum class State { NO_KEYS, STARTING, PHONE, CODE, PASSWORD, READY, ERROR }

    @Volatile var state = State.NO_KEYS; private set
    /** Подсказка к текущему шагу (куда пришёл код, подсказка пароля) или текст ошибки. */
    @Volatile var hint: String = ""; private set
    @Volatile var error: String? = null; private set
    @Volatile var me: String = ""; private set

    private val listeners = java.util.concurrent.CopyOnWriteArraySet<() -> Unit>()
    fun listen(l: () -> Unit) { listeners += l }
    fun unlisten(l: () -> Unit) { listeners -= l }
    private val main = android.os.Handler(android.os.Looper.getMainLooper())
    private fun changed() { main.post { listeners.forEach { it() } } }

    private lateinit var app: Context
    private val prefs by lazy { app.getSharedPreferences("telegram", Context.MODE_PRIVATE) }
    @Volatile private var client: Client? = null
    private val files = ConcurrentHashMap<Int, TdApi.File>()

    val ready get() = state == State.READY
    fun hasKeys(ctx: Context): Boolean { init(ctx); return prefs.getInt("api_id", 0) != 0 && !prefs.getString("api_hash", null).isNullOrBlank() }

    private fun init(ctx: Context) { if (!::app.isInitialized) app = ctx.applicationContext }

    /** Запустить, если ключи уже введены (при старте приложения — тихо, без ошибок на экране). */
    @Synchronized fun start(ctx: Context) {
        init(ctx)
        if (client != null || !hasKeys(ctx)) return
        state = State.STARTING; error = null; changed()
        try {
            runCatching { Client.execute(TdApi.SetLogVerbosityLevel(0)) }
            client = Client.create({ onUpdate(it) }, null, null).also { it.send(TdApi.GetOption("version")) { } } // первый запрос запускает клиент
        } catch (t: Throwable) {
            state = State.ERROR; error = "Библиотека Telegram не запустилась: ${t.message}"; changed()
        }
    }

    fun setKeys(ctx: Context, apiId: Int, apiHash: String) {
        init(ctx)
        prefs.edit().putInt("api_id", apiId).putString("api_hash", apiHash.trim()).apply()
        start(ctx)
    }

    /** Выйти из аккаунта и стереть ключи: сессия на телефоне удаляется. */
    fun logout(forgetKeys: Boolean) {
        val c = client
        if (forgetKeys) prefs.edit().clear().apply()
        botUser = 0; botChat = 0; me = ""
        // Вошли — выходим из аккаунта (сессия закрывается и на сервере); ещё не вошли — просто закрываем.
        if (c != null) c.send(if (state == State.READY) TdApi.LogOut() else TdApi.Close()) { } else { state = if (::app.isInitialized && hasKeys(app)) State.STARTING else State.NO_KEYS; changed() }
    }

    fun sendPhone(phone: String) = step(TdApi.SetAuthenticationPhoneNumber(phone.filter { it.isDigit() || it == '+' }, null))
    fun sendCode(code: String) = step(TdApi.CheckAuthenticationCode(code.filter { it.isLetterOrDigit() }))
    fun sendPassword(password: String) = step(TdApi.CheckAuthenticationPassword(password))

    private fun step(f: TdApi.Function<*>) {
        val c = client ?: return
        error = null; changed()
        c.send(f) { r -> if (r is TdApi.Error) { error = explain(r); changed() } }
    }

    private fun explain(e: TdApi.Error): String = when {
        e.message.contains("API_ID_INVALID") || e.message.contains("API_ID_PUBLISHED_FLOOD") -> "Ключи приложения не подошли. Проверьте api_id и api_hash на my.telegram.org."
        e.message.contains("PHONE_NUMBER_INVALID") -> "Номер не подошёл. Введите в международном виде: +7…"
        e.message.contains("PHONE_CODE_INVALID") -> "Код неверный."
        e.message.contains("PHONE_CODE_EXPIRED") -> "Код устарел — запросите новый."
        e.message.contains("PASSWORD_HASH_INVALID") -> "Пароль неверный."
        e.message.contains("FLOOD_WAIT") || e.code == 429 -> "Telegram просит подождать: ${wait(e)} с."
        else -> "Telegram: ${e.message}"
    }

    private fun wait(e: TdApi.Error) = Regex("""(\d+)""").find(e.message)?.value?.toLongOrNull() ?: 60

    private fun onUpdate(o: TdApi.Object) {
        when (o) {
            is TdApi.UpdateFile -> files[o.file.id] = o.file
            is TdApi.UpdateAuthorizationState -> when (val s = o.authorizationState) {
                is TdApi.AuthorizationStateWaitTdlibParameters -> {
                    val db = File(app.filesDir, "tdlib").apply { mkdirs() }
                    val fd = File(app.cacheDir, "tdlib-files").apply { mkdirs() } // музыка — в кэше, система может чистить
                    val version = runCatching { app.packageManager.getPackageInfo(app.packageName, 0).versionName }.getOrNull() ?: "1"
                    client?.send(TdApi.SetTdlibParameters(false, db.absolutePath, fd.absolutePath, null, true, false, false, false,
                        prefs.getInt("api_id", 0), prefs.getString("api_hash", ""), "ru", Build.MODEL ?: "Android", Build.VERSION.RELEASE ?: "", version)) { r ->
                        if (r is TdApi.Error) { state = State.ERROR; error = explain(r); changed() }
                    }
                }
                is TdApi.AuthorizationStateWaitPhoneNumber -> set(State.PHONE, "")
                is TdApi.AuthorizationStateWaitCode -> set(State.CODE, when (s.codeInfo.type) {
                    is TdApi.AuthenticationCodeTypeTelegramMessage -> "Код пришёл сообщением в Telegram на другом вашем устройстве."
                    is TdApi.AuthenticationCodeTypeSms -> "Код придёт по SMS на ${s.codeInfo.phoneNumber}."
                    is TdApi.AuthenticationCodeTypeCall -> "Код продиктуют по телефону."
                    else -> "Введите код подтверждения."
                })
                is TdApi.AuthorizationStateWaitPassword -> set(State.PASSWORD,
                    "У аккаунта включён облачный пароль." + if (s.passwordHint.isNullOrBlank()) "" else " Подсказка: ${s.passwordHint}")
                is TdApi.AuthorizationStateReady -> {
                    set(State.READY, "")
                    Streams.forgetFailures() // появился новый источник — «не нашлось» стоит проверить заново
                    client?.send(TdApi.GetMe()) { r -> if (r is TdApi.User) { me = listOf(r.firstName, r.lastName).filter { it.isNotBlank() }.joinToString(" "); changed() } }
                }
                is TdApi.AuthorizationStateWaitRegistration -> { state = State.ERROR; error = "Этот номер не зарегистрирован в Telegram."; changed() }
                is TdApi.AuthorizationStateWaitEmailAddress, is TdApi.AuthorizationStateWaitEmailCode ->
                    { state = State.ERROR; error = "Telegram просит подтверждение по почте — завершите его в официальном приложении и войдите снова."; changed() }
                is TdApi.AuthorizationStateClosed -> {
                    client = null; files.clear()
                    // После выхода — заново (если ключи остались): появится шаг «номер телефона».
                    if (hasKeys(app)) start(app) else set(State.NO_KEYS, "")
                }
                else -> {}
            }
            else -> {}
        }
    }

    private fun set(s: State, h: String) { state = s; hint = h; error = null; changed() }

    // ---------------- Запросы ----------------

    /** Запрос с ожиданием ответа. Не из главного потока. */
    @Suppress("UNCHECKED_CAST")
    fun <T : TdApi.Object> call(f: TdApi.Function<T>, timeoutMs: Long = 10_000): T {
        val c = client ?: throw UserError("Telegram не подключён")
        val latch = CountDownLatch(1)
        var res: TdApi.Object? = null
        c.send(f) { r -> res = r; latch.countDown() }
        if (!latch.await(timeoutMs, TimeUnit.MILLISECONDS)) throw UserError("Telegram не ответил за ${timeoutMs / 1000} с")
        val r = res
        if (r is TdApi.Error) {
            if (r.message.contains("FLOOD_WAIT") || r.code == 429) pausedUntil = System.currentTimeMillis() + wait(r) * 1000
            throw UserError(explain(r))
        }
        return r as T
    }

    // ---------------- Поиск музыки ----------------

    class Found(val remoteId: String, val title: String, val artist: String, val durationSec: Int, val size: Long, val mime: String) {
        val kbps: Int get() = if (durationSec > 0) (size * 8 / durationSec / 1000).toInt() else 0
        val format: String get() = when {
            mime.contains("flac") -> "FLAC"
            mime.contains("mp4") || mime.contains("m4a") || mime.contains("aac") -> "M4A"
            mime.contains("ogg") || mime.contains("opus") -> "OGG"
            else -> "MP3"
        }
        val label: String get() = "Telegram · $format" + if (kbps > 0) " $kbps" else ""
    }

    @Volatile private var botUser = 0L
    @Volatile private var botChat = 0L
    /** Telegram попросил подождать (слишком частые запросы) — до этого времени к нему не ходим. */
    @Volatile var pausedUntil = 0L; private set

    val available get() = ready && System.currentTimeMillis() >= pausedUntil

    /** Аудио-бот Telegram: его имя сервер сообщает приложениям (тот же, что ищет музыку в историях и вложениях). */
    private fun bot(): Pair<Long, Long> {
        if (botUser != 0L) return botUser to botChat
        var name = runCatching { (call(TdApi.GetOption("audio_search_bot_username")) as? TdApi.OptionValueString)?.value }.getOrNull()
        if (name.isNullOrBlank()) {
            val cfg = call(TdApi.GetApplicationConfig(), 15_000) as? TdApi.JsonValueObject
            name = (cfg?.members?.firstOrNull { it.key == "music_search_username" }?.value as? TdApi.JsonValueString)?.value
        }
        if (name.isNullOrBlank()) throw UserError("Telegram не сообщил, где искать музыку (поиск музыки для этого аккаунта недоступен)")
        val chat = call(TdApi.SearchPublicChat(name.removePrefix("@")))
        val user = (chat.type as? TdApi.ChatTypePrivate)?.userId ?: throw UserError("Поиск музыки Telegram недоступен")
        botUser = user; botChat = chat.id
        return user to chat.id
    }

    fun search(query: String): List<Found> {
        val (user, chat) = bot()
        val res = call(TdApi.GetInlineQueryResults(user, chat, null, query, ""), 8000)
        return res.results.mapNotNull { r ->
            val a = (r as? TdApi.InlineQueryResultAudio)?.audio ?: return@mapNotNull null
            val f = a.audio ?: return@mapNotNull null
            files[f.id] = f
            Found(f.remote?.id?.takeIf { it.isNotBlank() } ?: return@mapNotNull null,
                a.title?.takeIf { it.isNotBlank() } ?: a.fileName.orEmpty().substringBeforeLast('.'),
                a.performer.orEmpty(), a.duration, if (f.size > 0) f.size else f.expectedSize, a.mimeType.orEmpty())
        }
    }

    /** Адрес для проигрывателя: встроенный сервер отдаёт файл по мере скачивания из Telegram. */
    fun streamUrl(remoteId: String): String = Server.url(remoteId)

    // ---------------- Встроенный сервер: файл Telegram → проигрыватель ----------------

    private object Server {
        private val token = java.util.UUID.randomUUID().toString().replace("-", "")
        private val socket: ServerSocket by lazy {
            ServerSocket(0, 16, InetAddress.getByName("127.0.0.1")).also { s ->
                Thread({ while (true) { val c = runCatching { s.accept() }.getOrNull() ?: break; pool.execute { runCatching { serve(c) }; runCatching { c.close() } } } }, "tg-server")
                    .apply { isDaemon = true }.start()
            }
        }
        private val pool = java.util.concurrent.Executors.newCachedThreadPool()

        fun url(remoteId: String) = "http://127.0.0.1:${socket.localPort}/$token/${java.net.URLEncoder.encode(remoteId, "UTF-8")}"

        private fun serve(c: Socket) {
            c.soTimeout = 30_000
            val reader = c.getInputStream().bufferedReader(Charsets.ISO_8859_1)
            val request = reader.readLine() ?: return
            var range: String? = null
            while (true) { val l = reader.readLine() ?: break; if (l.isEmpty()) break; if (l.startsWith("Range:", true)) range = l.substringAfter(':').trim() }
            val out = c.getOutputStream()
            fun head(status: String, extra: String = "") = out.write("HTTP/1.1 $status\r\nConnection: close\r\nAccept-Ranges: bytes\r\n$extra\r\n".toByteArray())
            val path = request.split(' ').getOrNull(1).orEmpty().trimStart('/')
            if (path.substringBefore('/') != token) return head("403 Forbidden", "Content-Length: 0\r\n")
            val remoteId = java.net.URLDecoder.decode(path.substringAfter('/'), "UTF-8")
            val file = runCatching { call(TdApi.GetRemoteFile(remoteId, TdApi.FileTypeAudio())) }.getOrNull()
                ?: return head("404 Not Found", "Content-Length: 0\r\n")
            files[file.id] = file
            val size = if (file.size > 0) file.size else file.expectedSize
            if (size <= 0) return head("404 Not Found", "Content-Length: 0\r\n")
            val m = range?.let { Regex("""bytes=(\d+)-(\d*)""").find(it) }
            val start = m?.groupValues?.get(1)?.toLongOrNull() ?: 0L
            val end = (m?.groupValues?.get(2)?.toLongOrNull() ?: (size - 1)).coerceAtMost(size - 1)
            if (start > end) return head("416 Range Not Satisfiable", "Content-Range: bytes */$size\r\nContent-Length: 0\r\n")
            val type = "Content-Type: audio/mpeg\r\nContent-Length: ${end - start + 1}\r\n"
            if (m != null) head("206 Partial Content", type + "Content-Range: bytes $start-$end/$size\r\n") else head("200 OK", type)
            if (request.startsWith("HEAD")) return

            var pos = start
            var asked = -1L
            var idleSince = System.currentTimeMillis()
            while (pos <= end) {
                val f = files[file.id] ?: file
                val l = f.local
                val from = if (l.isDownloadingCompleted) 0L else l.downloadOffset
                val to = if (l.isDownloadingCompleted) size else l.downloadOffset + l.downloadedPrefixSize
                if (pos in from until to) {
                    val n = minOf(to - pos, end - pos + 1, 256 * 1024L)
                    val data = call(TdApi.ReadFilePart(file.id, pos, n), 15_000).data
                    if (data.isEmpty()) { Thread.sleep(40); continue }
                    out.write(data); pos += data.size
                    idleSince = System.currentTimeMillis()
                } else {
                    // По состоянию этого места нет — но оно могло скачаться раньше (другой кусок файла): пробуем прочитать.
                    val data = runCatching { call(TdApi.ReadFilePart(file.id, pos, minOf(64 * 1024L, end - pos + 1)), 5000).data }.getOrNull()
                    if (data != null && data.isNotEmpty()) { out.write(data); pos += data.size; idleSince = System.currentTimeMillis(); continue }
                    // Скачивание уже идёт и вот-вот дойдёт сюда — просто ждём; иначе просим Telegram качать с этого места (перемотка).
                    val soon = l.isDownloadingActive && pos >= to && pos - to < 3L * 1024 * 1024
                    if (!soon && asked != pos) {
                        client?.send(TdApi.DownloadFile(file.id, 32, pos, 0, false)) { r -> if (r is TdApi.File) files[r.id] = r }
                        asked = pos
                    }
                    if (System.currentTimeMillis() - idleSince > 30_000) return
                    Thread.sleep(100)
                }
            }
            out.flush()
        }
    }
}
