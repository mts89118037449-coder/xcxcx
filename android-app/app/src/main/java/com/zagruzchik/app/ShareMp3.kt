package com.zagruzchik.app

import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.core.content.FileProvider
import java.io.File
import java.util.UUID

internal object ShareMp3 {
    fun intent(ctx: Context, track: Track, audio: String?): Intent {
        val root = File(ctx.cacheDir, "share/mp3").apply { mkdirs() }
        val cutoff = System.currentTimeMillis() - 86_400_000L
        root.listFiles()?.filter { it.lastModified() < cutoff }?.forEach { it.deleteRecursively() }
        val dir = File(root, UUID.randomUUID().toString()).apply { check(mkdir()) }
        val temp = File(dir, "input.tmp")
        try {
            val source = audio ?: MediaCache.fileFor(track)?.absolutePath ?: Streams.resolve(track).url
            val uri = Uri.parse(source)
            val input = when (uri.scheme) {
                "content" -> {
                    requireNotNull(ctx.contentResolver.openInputStream(uri)).use { stream ->
                        temp.outputStream().use { stream.copyTo(it) }
                    }
                    temp.absolutePath
                }
                "file" -> requireNotNull(uri.path)
                else -> source
            }
            val name = track.label.filter { it.isLetterOrDigit() || it in " -_()" }.take(58).trim().ifEmpty { "Песня" }
            val output = File(dir, "$name.mp3")
            App.awaitReady()
            val pkgs = File(ctx.noBackupFilesDir, "youtubedl-android/packages")
            val args = mutableListOf(File(ctx.applicationInfo.nativeLibraryDir, "libffmpeg.so").absolutePath, "-nostdin", "-loglevel", "error")
            if (input.startsWith("http")) args.addAll(listOf("-rw_timeout", "20000000", "-user_agent", Http.DESKTOP_UA))
            args.addAll(listOf("-i", input, "-map", "0:a:0", "-c:a", "libmp3lame", "-q:a", "2", output.absolutePath))
            val process = ProcessBuilder(args).apply {
                environment()["LD_LIBRARY_PATH"] = "$pkgs/ffmpeg/usr/lib:$pkgs/python/usr/lib"
                environment()["SSL_CERT_FILE"] = "$pkgs/python/usr/etc/tls/cert.pem"
            }.startWithSilentStderr()
            try {
                check(process.waitFor() == 0 && output.length() > 0)
            } finally {
                process.destroy()
            }
            val shared = FileProvider.getUriForFile(ctx, ctx.packageName + ".files", output)
            return Intent(Intent.ACTION_SEND).setType("audio/mpeg").putExtra(Intent.EXTRA_STREAM, shared)
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION).apply { clipData = ClipData.newRawUri(name, shared) }
        } catch (e: Exception) {
            dir.deleteRecursively()
            throw e
        } finally {
            temp.delete()
        }
    }
}
