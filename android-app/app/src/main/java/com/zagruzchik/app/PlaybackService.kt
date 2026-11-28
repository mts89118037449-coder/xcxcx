package com.zagruzchik.app

import android.app.PendingIntent
import android.content.Intent
import android.net.Uri
import android.content.res.Configuration
import androidx.annotation.OptIn
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
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

    private data class QueueState(
        val items: List<MediaItem>, val index: Int, val position: Long, val play: Boolean,
    )

    private var castQueue: QueueState? = null

    override fun onCreate() {
        super.onCreate()
        // Свой обработчик звука («восстановление верхов») встраивается в вывод проигрывателя.
        val isTv = resources.configuration.uiMode and Configuration.UI_MODE_TYPE_MASK ==
            Configuration.UI_MODE_TYPE_TELEVISION
        val renderers = if (isTv) androidx.media3.exoplayer.DefaultRenderersFactory(this)
        else object : androidx.media3.exoplayer.DefaultRenderersFactory(this) {
            override fun buildAudioSink(context: android.content.Context, enableFloatOutput: Boolean, enableAudioTrackPlaybackParams: Boolean) =
                androidx.media3.exoplayer.audio.DefaultAudioSink.Builder(context)
                    .setAudioProcessors(arrayOf<androidx.media3.common.audio.AudioProcessor>(Exciter())).build()
                    .let { BeatSink(it) } // ритм для экрана — по часам самого звука
        }
        val hitmotopHttp = androidx.media3.datasource.DefaultHttpDataSource.Factory()
            .setUserAgent(Http.DESKTOP_UA)
            .setAllowCrossProtocolRedirects(true)
            .setDefaultRequestProperties(mapOf("Accept-Language" to "ru,en;q=0.8", "Referer" to "https://rus.hitmotop.com/"))
        val hitmotopFactory = DefaultMediaSourceFactory(androidx.media3.datasource.DefaultDataSource.Factory(this, hitmotopHttp))
        val player = ExoPlayer.Builder(this, renderers.setEnableDecoderFallback(true))
            // «aura://head/…» — начало песни с телефона, продолжение из сети (мгновенный старт); остальное — как обычно.
            .setMediaSourceFactory(MergingFactory(DefaultMediaSourceFactory(this), DefaultMediaSourceFactory(AuraDataSourceFactory(this)), hitmotopFactory))
            // Начинаем играть, как только есть 1 с звука (по умолчанию ждёт 2,5 с), и держим запас на минуту вперёд.
            .setLoadControl(androidx.media3.exoplayer.DefaultLoadControl.Builder()
                .setBufferDurationsMs(60_000, 60_000, 1_000, 2_200).build())
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
        // Музыке нужен только звук: картинку (если источник отдал ролик — Rutube, Dailymotion) не качаем и не декодируем.
        // Для своих видео (загрузки, история) картинка остаётся.
        fun videoOff(item: MediaItem?) {
            val x = item?.mediaMetadata?.extras
            val isVideo = x?.getBoolean(Playback.X_VIDEO) == true || x?.getString(Playback.X_LOCAL_MIME)?.startsWith("video") == true
            player.trackSelectionParameters = player.trackSelectionParameters.buildUpon().setTrackTypeDisabled(C.TRACK_TYPE_VIDEO, !isVideo).build()
        }
        player.addListener(object : androidx.media3.common.Player.Listener {
            override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) = videoOff(mediaItem)
        })
        // Тишина в начале и конце песен вырезается — следующая песня начинается без паузы.
        player.skipSilenceEnabled = AudioFx.skipSilence(this)
        AudioFx.onSkipSilence = { on -> android.os.Handler(android.os.Looper.getMainLooper()).post { runCatching { player.skipSilenceEnabled = on } } }
        Exciter.level = AudioFx.exciter(this)
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
        val cp = androidx.media3.cast.CastPlayer(ctx, SoundAuraCastConverter())
        cp.addListener(object : Player.Listener {
            override fun onEvents(player: Player, events: Player.Events) {
                if (session?.player === cp && cp.mediaItemCount > 0 && events.containsAny(
                        Player.EVENT_TIMELINE_CHANGED, Player.EVENT_MEDIA_ITEM_TRANSITION,
                        Player.EVENT_PLAY_WHEN_READY_CHANGED, Player.EVENT_POSITION_DISCONTINUITY,
                    )
                ) castQueue = queueState(cp)
            }
        })
        cast = cp
        cp.setSessionAvailabilityListener(object : androidx.media3.cast.SessionAvailabilityListener {
            override fun onCastSessionAvailable() { local?.let { switchPlayer(it, cp) } }
            override fun onCastSessionUnavailable() { local?.let { switchPlayer(cp, it) } }
        })
        if (cp.isCastSessionAvailable) local?.let { switchPlayer(it, cp) }
    }

    private fun queueState(player: Player) = QueueState(
        (0 until player.mediaItemCount).map(player::getMediaItemAt),
        player.currentMediaItemIndex,
        player.currentPosition,
        player.playWhenReady,
    )

    private fun switchPlayer(from: Player, to: Player) {
        val s = session ?: return
        if (s.player === to || s.player !== from) return
        val casting = to === cast
        val current = queueState(from)
        // CastPlayer clears its timeline before notifying us that the receiver disconnected.
        val state = if (!casting && current.items.isEmpty()) {
            castQueue?.let { it.copy(position = current.position.takeIf { position -> position > 0 } ?: it.position) } ?: current
        } else current
        val index = state.index.coerceAtLeast(0)
        val prepared = if (casting) {
            val mapped = state.items.map { Cast.castable(this, it) }
            if (state.items.isNotEmpty() && mapped.getOrNull(index) == null) return
            mapped.take(index).count { it != null } to mapped.filterNotNull()
        } else {
            index to state.items.map { item ->
                val originalUri = item.requestMetadata.mediaUri
                if (originalUri == null) item else item.buildUpon().setUri(originalUri).build()
            }
        }
        from.stop()
        castQueue = if (casting) state else null
        Cast.isPlayingRemotely = casting
        s.player = to
        if (prepared.second.isNotEmpty()) {
            to.setMediaItems(prepared.second, prepared.first.coerceAtMost(prepared.second.lastIndex), state.position.coerceAtLeast(0))
            to.prepare()
            to.playWhenReady = state.play
        } else {
            to.clearMediaItems()
        }
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo) = session

    // Смахнули приложение из недавних: если ничего не играет — закрываемся.
    override fun onTaskRemoved(rootIntent: Intent?) {
        val p = session?.player
        if (p == null || !p.playWhenReady || p.mediaItemCount == 0) stopSelf()
    }

    override fun onDestroy() {
        Cast.isPlayingRemotely = false
        cast?.setSessionAvailabilityListener(null)
        cast?.release()
        AudioFx.onSkipSilence = null
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
    private class MergingFactory(
        private val plain: DefaultMediaSourceFactory,
        private val aura: DefaultMediaSourceFactory,
        private val hitmotop: DefaultMediaSourceFactory,
    ) : MediaSource.Factory {
        override fun setDrmSessionManagerProvider(p: DrmSessionManagerProvider) = apply { plain.setDrmSessionManagerProvider(p); aura.setDrmSessionManagerProvider(p); hitmotop.setDrmSessionManagerProvider(p) }
        override fun setLoadErrorHandlingPolicy(p: LoadErrorHandlingPolicy) = apply { plain.setLoadErrorHandlingPolicy(p); aura.setLoadErrorHandlingPolicy(p); hitmotop.setLoadErrorHandlingPolicy(p) }
        override fun getSupportedTypes() = plain.supportedTypes

        override fun createMediaSource(mediaItem: MediaItem): MediaSource {
            // Свой источник данных — только для «начала с телефона» и для YouTube (чтение кусками).
            // Всё остальное (SoundCloud, файлы, Zaycev, Telegram) идёт стандартным путём проигрывателя.
            val u = mediaItem.localConfiguration?.uri
            val base = when {
                u?.scheme == "aura" || u?.host?.endsWith("googlevideo.com") == true -> aura
                u?.host?.contains("hitmotop") == true || u?.host?.contains("hitmcdn") == true -> hitmotop
                else -> plain
            }
            val audio = mediaItem.requestMetadata.extras?.getString(Playback.EXTRA_AUDIO_URL)
            val main = base.createMediaSource(mediaItem)
            if (audio.isNullOrEmpty()) return main
            val audioSource = base.createMediaSource(MediaItem.fromUri(audio))
            return MergingMediaSource(main, audioSource)
        }
    }
}
