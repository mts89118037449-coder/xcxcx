package com.zagruzchik.app

import android.app.PendingIntent
import android.content.Intent
import android.net.Uri
import androidx.annotation.OptIn
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.drm.DrmSessionManagerProvider
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.exoplayer.source.MediaSource
import androidx.media3.exoplayer.source.MergingMediaSource
import androidx.media3.exoplayer.upstream.LoadErrorHandlingPolicy
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture

/**
 * Проигрыватель, который живёт отдельно от экрана: музыка играет в фоне,
 * управление — в уведомлении, на экране блокировки и с наушников.
 */
@OptIn(UnstableApi::class)
class PlaybackService : MediaSessionService() {
    private var session: MediaSession? = null

    override fun onCreate() {
        super.onCreate()
        val player = ExoPlayer.Builder(this)
            .setMediaSourceFactory(MergingFactory(DefaultMediaSourceFactory(this)))
            .setAudioAttributes(
                AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MUSIC).build(),
                true, // ставить на паузу при звонке и других приложениях
            )
            .setHandleAudioBecomingNoisy(true) // пауза, если выдернули наушники
            .build()
        val open = PendingIntent.getActivity(
            this, 0, Intent(this, NowPlayingActivity::class.java), // для видео он сам переключит на PlayerActivity
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        session = MediaSession.Builder(this, player)
            .setSessionActivity(open)
            .setCallback(object : MediaSession.Callback {
                // Адрес файла/потока может не дойти от экрана до проигрывателя — восстанавливаем его.
                override fun onAddMediaItems(
                    mediaSession: MediaSession, controller: MediaSession.ControllerInfo, mediaItems: MutableList<MediaItem>,
                ): ListenableFuture<MutableList<MediaItem>> = Futures.immediateFuture(
                    mediaItems.map { item ->
                        if (item.localConfiguration != null) item
                        else item.buildUpon().setUri(item.requestMetadata.mediaUri ?: Uri.parse(item.mediaId)).build()
                    }.toMutableList()
                )
            })
            .build()
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo) = session

    // Смахнули приложение из недавних: если ничего не играет — закрываемся.
    override fun onTaskRemoved(rootIntent: Intent?) {
        val p = session?.player
        if (p == null || !p.playWhenReady || p.mediaItemCount == 0) stopSelf()
    }

    override fun onDestroy() {
        session?.run {
            player.release()
            release()
        }
        session = null
        super.onDestroy()
    }

    /**
     * Видео с YouTube при просмотре во время загрузки приходит двумя потоками: картинка и звук.
     * Если у элемента есть ссылка на отдельный звук — склеиваем их на лету.
     */
    private class MergingFactory(private val base: DefaultMediaSourceFactory) : MediaSource.Factory {
        override fun setDrmSessionManagerProvider(p: DrmSessionManagerProvider) = apply { base.setDrmSessionManagerProvider(p) }
        override fun setLoadErrorHandlingPolicy(p: LoadErrorHandlingPolicy) = apply { base.setLoadErrorHandlingPolicy(p) }
        override fun getSupportedTypes() = base.supportedTypes

        override fun createMediaSource(mediaItem: MediaItem): MediaSource {
            val audio = mediaItem.requestMetadata.extras?.getString(Playback.EXTRA_AUDIO_URL)
            val main = base.createMediaSource(mediaItem)
            if (audio.isNullOrEmpty()) return main
            val audioSource = base.createMediaSource(MediaItem.fromUri(audio))
            return MergingMediaSource(main, audioSource)
        }
    }
}
