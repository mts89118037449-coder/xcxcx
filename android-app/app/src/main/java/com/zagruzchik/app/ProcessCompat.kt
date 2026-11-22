package com.zagruzchik.app

import android.os.Build
import java.io.File
import java.io.IOException
import kotlin.concurrent.thread

internal fun Process.isRunning(): Boolean = try {
    exitValue()
    false
} catch (_: IllegalThreadStateException) {
    true
}

internal fun ProcessBuilder.startWithSilentStderr(): Process {
    val sink = File("/dev/null")
    if (Build.VERSION.SDK_INT >= 26) return redirectError(sink).start()
    val process = start()
    thread(isDaemon = true, name = "stderr") {
        try {
            process.errorStream.use { input -> sink.outputStream().use { input.copyTo(it) } }
        } catch (_: IOException) {
            // The process was stopped and its pipe closed.
        }
    }
    return process
}
