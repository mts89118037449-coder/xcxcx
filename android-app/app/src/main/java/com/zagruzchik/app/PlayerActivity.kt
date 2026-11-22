package com.zagruzchik.app

import android.os.Bundle
import android.view.View
import android.view.WindowManager
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.core.view.isVisible
import androidx.media3.common.C
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import androidx.media3.common.Tracks
import androidx.media3.session.MediaController
import androidx.media3.ui.PlayerView

@androidx.annotation.OptIn(androidx.media3.common.util.UnstableApi::class)
/** Полноэкранный проигрыватель: для музыки — обложка и управление, для видео — видео на весь экран. */
class PlayerActivity : AppCompatActivity() {
    private lateinit var view: PlayerView
    private lateinit var title: TextView
    private lateinit var subtitle: TextView
    private lateinit var topBar: View
    private var controller: MediaController? = null

    private val listener = object : Player.Listener {
        override fun onTracksChanged(tracks: Tracks) = updateMode()
        override fun onMediaMetadataChanged(mediaMetadata: MediaMetadata) = updateTitle()
        override fun onIsPlayingChanged(isPlaying: Boolean) = updateMode()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_player)
        view = findViewById(R.id.playerView)
        title = findViewById(R.id.playerTitle)
        subtitle = findViewById(R.id.playerSubtitle)
        topBar = findViewById(R.id.playerTop)
        findViewById<View>(R.id.playerBack).setOnClickListener { finish() }
        setupCastButton(findViewById(R.id.playerCast))
        // Ссылки на эту песню во всех сервисах (установленные — первыми).
        findViewById<View>(R.id.playerWhere).setOnClickListener {
            val m = controller?.mediaMetadata ?: return@setOnClickListener
            val title = m.title?.toString() ?: return@setOnClickListener
            TransferActivity.openTrack(this, Track(title, m.artist?.toString().orEmpty()))
        }
        view.setShowShuffleButton(true)
        view.setRepeatToggleModes(Player.REPEAT_MODE_ALL or Player.REPEAT_MODE_ONE)
        view.setControllerVisibilityListener(PlayerView.ControllerVisibilityListener { v -> topBar.isVisible = v == View.VISIBLE })
    }

    override fun onStart() {
        super.onStart()
        Playback.controller(this) { c ->
            controller = c
            view.player = c
            c.addListener(listener)
            updateTitle()
            updateMode()
        }
    }

    override fun onStop() {
        controller?.removeListener(listener)
        view.player = null
        controller = null
        super.onStop()
    }

    private fun updateTitle() {
        val m = controller?.mediaMetadata ?: return
        title.text = m.title ?: ""
        subtitle.text = listOfNotNull(m.artist, m.albumTitle).joinToString(" · ")
    }

    /** Видео: элементы управления прячутся, экран не гаснет, системные панели скрыты. Музыка: всё всегда видно. */
    private fun updateMode() {
        val c = controller ?: return
        val video = c.currentTracks.isTypeSelected(C.TRACK_TYPE_VIDEO)
        findViewById<View>(R.id.playerWhere).isVisible = !video
        view.controllerShowTimeoutMs = if (video) 3000 else 0
        view.controllerHideOnTouch = video
        if (!video) view.showController()
        val keepOn = video && c.isPlaying
        if (keepOn) window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        else window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        val insets = WindowCompat.getInsetsController(window, window.decorView)
        if (video) {
            insets.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            insets.hide(WindowInsetsCompat.Type.systemBars())
        } else {
            insets.show(WindowInsetsCompat.Type.systemBars())
        }
    }
}
