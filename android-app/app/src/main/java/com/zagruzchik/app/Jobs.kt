package com.zagruzchik.app

import android.content.Context
import android.net.Uri
import android.os.Handler
import android.os.Looper
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.UUID

enum class Status { QUEUED, RUNNING, DONE, FAILED, CANCELLED }

class SavedFile(val uri: String, val name: String, val mime: String)

class Job(
    val id: String,
    val url: String,
    val format: Format,
    var title: String,
    var status: Status = Status.QUEUED,
    var progress: Float = 0f,
    var detail: String = "",
    var error: String = "",
    var files: List<SavedFile> = emptyList(),
    val createdAt: Long = System.currentTimeMillis(),
    /** Текст, которым поделились вместе со ссылкой: подсказка с названием трека. */
    val hint: String? = null,
) {
    val active get() = status == Status.QUEUED || status == Status.RUNNING
}

/**
 * Список загрузок. Все изменения и уведомления слушателей — только в главном потоке.
 * Список сохраняется в файл, чтобы история не пропадала после закрытия приложения.
 */
object Jobs {
    private const val MAX_HISTORY = 100
    private val main = Handler(Looper.getMainLooper())
    private val list = mutableListOf<Job>()
    private val tokens = mutableMapOf<String, CancelToken>()
    private val listeners = mutableSetOf<(Job?) -> Unit>()
    private lateinit var file: File

    fun init(ctx: Context) {
        file = File(ctx.filesDir, "jobs.json")
        load()
    }

    val all: List<Job> get() = list.toList()
    fun get(id: String) = list.firstOrNull { it.id == id }
    fun token(id: String) = tokens.getOrPut(id) { CancelToken() }

    /** Слушатель получает изменённую загрузку или null, если поменялся весь список. */
    fun listen(l: (Job?) -> Unit) { listeners += l }
    fun unlisten(l: (Job?) -> Unit) { listeners -= l }

    fun create(url: String, format: Format, hint: String? = null): Job {
        val job = Job(UUID.randomUUID().toString(), url, format, title = url, hint = hint?.takeIf { it.isNotBlank() && it.trim() != url })
        list.add(0, job)
        while (list.size > MAX_HISTORY) {
            val old = list.lastOrNull { !it.active } ?: break
            list.remove(old)
        }
        changed(null, save = true)
        return job
    }

    /** Изменить загрузку из любого потока. save=true — записать на диск (смена статуса, а не каждый процент). */
    fun update(id: String, save: Boolean = false, block: Job.() -> Unit) {
        val run = Runnable { get(id)?.let { it.block(); changed(it, save) } }
        if (Looper.myLooper() == Looper.getMainLooper()) run.run() else main.post(run)
    }

    fun cancel(id: String) {
        token(id).cancel()
        update(id, save = true) {
            if (active) {
                status = Status.CANCELLED
                detail = ""
            }
        }
    }

    fun remove(id: String) {
        list.removeAll { it.id == id && !it.active }
        tokens.remove(id)
        changed(null, save = true)
    }

    /** Вернуть убранную из списка загрузку (кнопка «Вернуть» после смахивания). */
    fun restore(job: Job, index: Int) {
        if (get(job.id) != null) return
        list.add(index.coerceIn(0, list.size), job)
        changed(null, save = true)
    }

    fun clearFinished() {
        list.removeAll { !it.active }
        changed(null, save = true)
    }

    fun forget(id: String) { tokens.remove(id) }

    /** Удаляет сами файлы из «Загрузок». Возвращает, сколько удалось удалить. */
    fun deleteFiles(ctx: Context, job: Job): Int {
        var ok = 0
        for (f in job.files) {
            ok += runCatching { ctx.contentResolver.delete(Uri.parse(f.uri), null, null) }.getOrDefault(0)
        }
        list.remove(job)
        changed(null, save = true)
        return ok
    }

    private fun changed(job: Job?, save: Boolean) {
        if (save) save()
        listeners.toList().forEach { it(job) }
    }

    private fun save() {
        val arr = JSONArray()
        list.forEach { j ->
            arr.put(JSONObject().apply {
                put("id", j.id); put("url", j.url); put("format", j.format.name); put("title", j.title)
                put("status", j.status.name); put("error", j.error); put("createdAt", j.createdAt); put("hint", j.hint ?: "")
                put("files", JSONArray().apply {
                    j.files.forEach { put(JSONObject().put("uri", it.uri).put("name", it.name).put("mime", it.mime)) }
                })
            })
        }
        runCatching {
            val tmp = File(file.path + ".tmp")
            tmp.writeText(arr.toString())
            tmp.renameTo(file)
        }
    }

    private fun load() {
        list.clear()
        val arr = runCatching { JSONArray(file.readText()) }.getOrNull() ?: return
        for (i in 0 until arr.length()) {
            val o = arr.getJSONObject(i)
            val files = o.optJSONArray("files") ?: JSONArray()
            val job = Job(
                id = o.getString("id"),
                url = o.getString("url"),
                format = runCatching { Format.valueOf(o.getString("format")) }.getOrDefault(Format.BEST),
                title = o.optString("title"),
                status = runCatching { Status.valueOf(o.getString("status")) }.getOrDefault(Status.FAILED),
                error = o.optString("error"),
                files = (0 until files.length()).map { k ->
                    files.getJSONObject(k).let { SavedFile(it.getString("uri"), it.getString("name"), it.getString("mime")) }
                },
                createdAt = o.optLong("createdAt"),
                hint = o.optString("hint").takeIf { it.isNotEmpty() },
            )
            // Приложение закрыли посреди загрузки — показываем, что её надо повторить.
            if (job.active) {
                job.status = Status.FAILED
                job.error = "Загрузка прервалась. Нажмите «Повторить»."
            }
            job.progress = if (job.status == Status.DONE) 100f else 0f
            list.add(job)
        }
    }
}
