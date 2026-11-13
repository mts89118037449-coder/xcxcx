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
    private var local: ExoPlayer? = null
    private var cast: androidx.media3.cast.CastPlayer? = null

    override fun onCreate() {
        super.onCreate()
        val player = ExoPlayer.Builder(this)
            // «aura://head/…» — начало песни с телефона, продолжение из сети (мгновенный старт); остальное — как обычно.
            .setMediaSourceFactory(MergingFactory(DefaultMediaSourceFactory(AuraDataSourceFactory(this))))
            // Начинаем играть, как только есть 0,7 с звука (по умолчанию ждёт 2,5 с), и держим запас на минуту вперёд.
            .setLoadControl(androidx.media3.exoplayer.DefaultLoadControl.Builder()
                .setBufferDurationsMs(30_000, 90_000, 700, 2_000).build())
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
        // Эквалайзер, бас и объём — к звуку проигрывателя (и заново, если сменился аудиопоток).
        AudioFx.attach(this, player.audioSessionId)
        player.addAnalyticsListener(object : androidx.media3.exoplayer.analytics.AnalyticsListener {
            override fun onAudioSessionIdChanged(eventTime: androidx.media3.exoplayer.analytics.AnalyticsListener.EventTime, audioSessionId: Int) {
                AudioFx.attach(this@PlaybackService, audioSessionId)
            }
        })
        local = player
        session = MediaSession.Builder(this, player)
            .setSessionActivity(open)
            .setCallback(object : MediaSession.Callback {
                // Адрес файла/потока может не дойти от экрана до проигрывателя — восстанавливаем его.
                override fun onAddMediaItems(
                    mediaSession: MediaSession, controller: MediaSession.ControllerInfo, mediaItems: MutableList<MediaItem>,
                ): ListenableFuture<MutableList<MediaItem>> {
                    val restored = mediaItems.map { item ->
                        if (item.localConfiguration != null) item
                        else item.buildUpon().setUri(item.requestMetadata.mediaUri ?: Uri.parse(item.mediaId)).build()
                    }
                    // Идёт трансляция — сразу готовим для телевизора.
                    val ready = if (mediaSession.player === cast) restored.mapNotNull { Cast.castable(this@PlaybackService, it) } else restored
                    return Futures.immediateFuture(ready.toMutableList())
                }
            })
            .build()
        setupCast()
    }

    /**
     * Трансляция на ТВ/колонку (Chromecast): когда подключились — переносим очередь и позицию
     * на телевизор, телефон становится пультом; отключились — играем дальше на телефоне.
     */
    private fun setupCast() {
        val ctx = Cast.context(this) ?: return // нет сервисов Google Play — без трансляции
        val cp = androidx.media3.cast.CastPlayer(ctx)
        cast = cp
        cp.setSessionAvailabilityListener(object : androidx.media3.cast.SessionAvailabilityListener {
            override fun onCastSessionAvailable() { local?.let { switchPlayer(it, cp) } }
            override fun onCastSessionUnavailable() { local?.let { switchPlayer(cp, it) } }
        })
        if (cp.isCastSessionAvailable) local?.let { switchPlayer(it, cp) }
    }

    private fun switchPlayer(from: androidx.media3.common.Player, to: androidx.media3.common.Player) {
        val s = session ?: return
        if (s.player === to) return
        val items = (0 until from.mediaItemCount).map { from.getMediaItemAt(it) }
        val index = from.currentMediaItemIndex
        val position = from.currentPosition
        val play = from.playWhenReady
        from.stop()
        val prepared = if (to === cast) items.mapNotNull { Cast.castable(this, it) } else items
        if (prepared.isNotEmpty()) {
            to.setMediaItems(prepared, index.coerceIn(0, prepared.lastIndex), position)
            to.playWhenReady = play
            to.prepare()
        }
        s.player = to
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo) = session

    // Смахнули приложение из недавних: если ничего не играет — закрываемся.
    override fun onTaskRemoved(rootIntent: Intent?) {
        val p = session?.player
        if (p == null || !p.playWhenReady || p.mediaItemCount == 0) stopSelf()
    }

    override fun onDestroy() {
        cast?.setSessionAvailabilityListener(null)
        cast?.release()
        AudioFx.release()
        local?.release()
        session?.release()
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
