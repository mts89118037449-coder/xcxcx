package com.zagruzchik.app

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.InputStream

/** Portable profile. Only user-facing preferences and library records are included. */
object ProfileBackup {
    private const val FORMAT = "soundaura-profile"
    private const val VERSION = 1
    private const val MAX_BYTES = 16 * 1024 * 1024

    private val textKeys = setOf("playerStyle", "startMode", "warm", "theme", "playMode", "sync",
        "quality", "source", "myService", "fx_preset", "fx_gains")
    private val boolKeys = setOf("coverSmoke", "lyricsInPlayer", "radio", "saveLiked",
        "fx_on", "fx_protect_peaks", "fx_level", "fx_skip_silence", "followSystemNetwork")
    private val intLimits = mapOf("cacheMb" to 0..40960, "fx_exciter" to 0..2,
        "fx_bass" to 0..1000, "fx_virt" to 0..1000)

    internal fun publicUrl(raw: String?): String? {
        if (raw.isNullOrBlank() || raw.length > 4096) return null
        return runCatching {
            val url = java.net.URI(raw)
            raw.takeIf { url.scheme in setOf("http", "https") && !url.host.isNullOrBlank() && url.userInfo == null &&
                url.host.lowercase() !in setOf("localhost", "127.0.0.1", "[::1]") }
        }.getOrNull()
    }

    private fun portable(t: Track) = t.copy(url = publicUrl(t.url), cover = publicUrl(t.cover), preview = null)
    private fun art(album: Album) = JSONObject().put("id", album.id ?: 0L).put("title", album.title)
        .put("artist", album.artist).put("cover", publicUrl(album.cover).orEmpty())
        .put("year", album.year.orEmpty()).put("type", album.type).put("explicit", album.explicit)

    fun export(ctx: Context): String {
        val preferences = ctx.getSharedPreferences("app", 0).all
        val settings = JSONObject()
        (textKeys + boolKeys + intLimits.keys).forEach { key -> preferences[key]?.let { settings.put(key, it) } }
        val favorites = Library.favorites.map { track ->
            val pin = Streams.pinned(track)
            Library.trackJson(portable(track)).apply {
                publicUrl(pin?.removePrefix("direct:"))?.let {
                    put("source", it)
                    put("direct", pin?.startsWith("direct:") == true)
                }
            }
        }
        val playlists = Library.playlists.map { list ->
            JSONObject().put("id", list.id).put("name", list.name).put("created", list.created)
                .put("tracks", JSONArray(list.tracks.map { Library.trackJson(portable(it)) }))
        }
        val document = JSONObject().put("format", FORMAT).put("version", VERSION).put("settings", settings)
            .put("favorites", JSONArray(favorites)).put("playlists", JSONArray(playlists))
            .put("albums", JSONArray(Library.albums.map(::art))).put("taste", Taste.backup()).put("tags", Tags.backup()).toString()
        require(document.toByteArray(Charsets.UTF_8).size <= MAX_BYTES) { "Файл профиля слишком большой" }
        return document
    }

    data class Result(val added: Int, val settings: Int)

    fun restore(ctx: Context, input: InputStream): Result {
        val bytes = java.io.ByteArrayOutputStream()
        val buffer = ByteArray(8192)
        while (true) {
            val count = input.read(buffer)
            if (count < 0) break
            require(bytes.size() + count <= MAX_BYTES) { "Файл профиля слишком большой" }
            bytes.write(buffer, 0, count)
        }
        val root = JSONObject(bytes.toString(Charsets.UTF_8.name()))
        require(root.optString("format") == FORMAT && root.optInt("version") == VERSION) { "Неподдерживаемый файл профиля" }
        val songs = objects(root.getJSONArray("favorites")).map { o ->
            val url = publicUrl(o.optString("source"))
            val source = url?.let { if (o.optBoolean("direct") || Http.isDirectAudio(it)) "direct:$it" else it }
            portable(Library.trackFrom(o)).also { require(it.title.isNotBlank()) } to source
        }
        val lists = objects(root.getJSONArray("playlists")).map { o ->
            val tracks = objects(o.getJSONArray("tracks")).map { portable(Library.trackFrom(it)) }
            Library.Playlist(o.getString("id"), o.getString("name"), "Резервная копия", tracks, o.optLong("created"))
        }
        val albums = objects(root.getJSONArray("albums")).map { o ->
            Album(o.optLong("id").takeIf { it > 0 }, o.getString("title"), o.optString("artist"), publicUrl(o.optString("cover")),
                o.optString("year").ifBlank { null }, o.optBoolean("explicit"), o.optString("type", "album"))
        }
        val settings = root.getJSONObject("settings")
        val changes = ctx.getSharedPreferences("app", 0).edit()
        var imported = 0
        for (key in textKeys + boolKeys + intLimits.keys) {
            val value = settings.opt(key)
            when {
                key == "fx_gains" && value is String && validGains(value) -> changes.putString(key, value)
                key in textKeys && key != "fx_gains" && value is String && value.length <= 256 -> changes.putString(key, value)
                key in boolKeys && value is Boolean -> changes.putBoolean(key, value)
                value is Int && intLimits[key]?.contains(value) == true -> changes.putInt(key, value)
                else -> continue
            }
            imported++
        }
        check(changes.commit()) { "Не удалось сохранить настройки" }
        val added = Library.addFavorites(songs.map { it.first })
        songs.forEach { (track, source) ->
            if (source != null && Streams.pinned(track) == null) Streams.pin(track, source)
        }
        Library.mergeAlbums(albums)
        Library.mergePlaylists(lists)
        root.optJSONObject("taste")?.let(Taste::restore)
        root.optJSONObject("tags")?.let(Tags::restore)
        Recs.invalidate(ctx)
        return Result(added, imported)
    }

    private fun validGains(value: String): Boolean {
        val parts = value.split(',')
        return parts.size == 5 && parts.all { it.toFloatOrNull()?.let { gain -> gain in -AudioFx.MAX_DB..AudioFx.MAX_DB } == true }
    }

    private fun objects(array: JSONArray) = (0 until array.length()).map(array::getJSONObject)
}
