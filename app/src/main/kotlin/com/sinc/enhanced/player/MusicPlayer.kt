package com.sinc.enhanced.player

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.util.Log
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.session.MediaSession
import com.sinc.enhanced.MainActivity
import com.sinc.enhanced.SincApp
import com.sinc.enhanced.data.audio.AudioResolverPipeline
import com.sinc.enhanced.data.model.Track
import com.sinc.enhanced.domain.player.PlayerController
import com.sinc.enhanced.domain.player.PlayerState
import com.sinc.enhanced.domain.player.RepeatMode
import com.sinc.enhanced.domain.player.ShuffleMode
import com.sinc.enhanced.service.MediaPlaybackService
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class MusicPlayer(private val context: Context) : PlayerController {

    private val _state = MutableStateFlow(PlayerState())
    override val state: StateFlow<PlayerState> = _state.asStateFlow()

    private val _recentlyPlayed = MutableStateFlow<List<Track>>(emptyList())
    override val recentlyPlayed: StateFlow<List<Track>> = _recentlyPlayed.asStateFlow()

    private val player: ExoPlayer = ExoPlayer.Builder(context)
        .setAudioAttributes(
            androidx.media3.common.AudioAttributes.Builder()
                .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
                .setUsage(C.USAGE_MEDIA)
                .build(),
            true
        )
        .setHandleAudioBecomingNoisy(true)
        .build()

    private val mediaSession: MediaSession
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private val fallbackPipeline: AudioResolverPipeline? by lazy {
        try { (context.applicationContext as SincApp).container.audioPipeline } catch (_: Exception) { null }
    }
    private var positionJob: Job? = null
    private var sleepTimerJob: Job? = null
    private var previewJob: Job? = null
    private var loadTimeoutJob: Job? = null
    private var _speed: Float = 1.0f
    private var _repeatMode: RepeatMode = RepeatMode.ALL
    private var _shuffleMode: ShuffleMode = ShuffleMode.OFF
    private var currentAudioUrl: String? = null

    private val playerListener = object : Player.Listener {
        override fun onPlaybackStateChanged(playbackState: Int) {
            updateState()
            updatePositionPolling()
            if (playbackState == Player.STATE_READY || playbackState == Player.STATE_ENDED || playbackState == Player.STATE_IDLE) {
                loadTimeoutJob?.cancel()
            }
        }

        override fun onIsPlayingChanged(isPlaying: Boolean) {
            updateState()
            updatePositionPolling()
            if (isPlaying) loadTimeoutJob?.cancel()
        }

        override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
            updateState()
            updatePositionPolling()
        }

        override fun onPlaybackSuppressionReasonChanged(playbackSuppressionReason: Int) {
            updateState()
        }

        override fun onPlayerError(error: androidx.media3.common.PlaybackException) {
            Log.e("MusicPlayer", "Playback error: ${error.message}")
            loadTimeoutJob?.cancel()
            val track = _state.value.currentTrack ?: return
            scope.launch {
                tryFallback(track)
            }
        }
    }

    init {
        val sessionIntent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            context, 0, sessionIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        mediaSession = MediaSession.Builder(context, player)
            .setSessionActivity(pendingIntent)
            .build()

        (context.applicationContext as SincApp).mediaSession = mediaSession

        player.addListener(playerListener)
    }

    private suspend fun tryFallback(track: Track) {
        val pipeline = fallbackPipeline ?: return
        try {
            val fallbackUrl = withContext(Dispatchers.IO) {
                pipeline.resolveWithLowerThreshold(track)
            }
            if (fallbackUrl != null) {
                currentAudioUrl = fallbackUrl.first
                val fbItem = buildMediaItem(track, fallbackUrl.first) ?: return
                player.stop()
                player.clearMediaItems()
                player.setMediaItems(listOf(fbItem))
                player.prepare()
                player.playWhenReady = true
                startService()
            }
        } catch (_: Exception) {
            _state.value = _state.value.copy(currentAudioSource = null)
        }
    }

    private fun addToRecentlyPlayed(track: Track) {
        val current = _recentlyPlayed.value.toMutableList()
        current.removeAll { it.id == track.id }
        current.add(0, track)
        _recentlyPlayed.value = current.take(20)
    }

    override fun play(track: Track) {
        previewJob?.cancel()
        loadTimeoutJob?.cancel()
        addToRecentlyPlayed(track)
        val updatedQueue = if (_state.value.queue.none { it.id == track.id }) {
            _state.value.queue + track
        } else _state.value.queue

        currentAudioUrl = track.previewUrl
        _state.value = _state.value.copy(
            currentTrack = track,
            currentAudioSource = track.previewUrl,
            queue = updatedQueue
        )

        val mediaItems = updatedQueue.mapNotNull { buildMediaItem(it) }
        val index = updatedQueue.indexOfFirst { it.id == track.id }.coerceAtLeast(0)
        player.setMediaItems(mediaItems, index, C.TIME_UNSET)
        player.prepare()
        player.playWhenReady = true
        startService()

        loadTimeoutJob = scope.launch {
            delay(12_000)
            val current = _state.value.currentTrack ?: return@launch
            if (!player.isPlaying && player.playbackState != Player.STATE_ENDED) {
                Log.w("MusicPlayer", "Track stalled, resolving fallback: ${current.title}")
                player.stop()
                tryFallback(current)
            }
        }
    }

    override fun playUrl(track: Track, url: String) {
        previewJob?.cancel()
        loadTimeoutJob?.cancel()
        addToRecentlyPlayed(track)
        val newQueue = listOf(track)
        currentAudioUrl = url
        _state.value = _state.value.copy(currentTrack = track, currentAudioSource = url, queue = newQueue)

        val mediaItem = buildMediaItem(track, url) ?: return
        player.setMediaItems(listOf(mediaItem))
        player.prepare()
        player.playWhenReady = true

        startService()

        loadTimeoutJob = scope.launch {
            delay(12_000)
            if (!player.isPlaying && player.playbackState != Player.STATE_ENDED) {
                Log.w("MusicPlayer", "playUrl stalled, resolving fallback: ${track.title}")
                player.stop()
                tryFallback(track)
            }
        }
    }

    override fun playAll(tracks: List<Track>) {
        previewJob?.cancel()
        loadTimeoutJob?.cancel()
        if (tracks.isEmpty()) return
        tracks.forEach { addToRecentlyPlayed(it) }
        _state.value = _state.value.copy(
            currentTrack = tracks.first(),
            queue = tracks
        )
        val mediaItems = tracks.mapNotNull { buildMediaItem(it) }
        player.setMediaItems(mediaItems)
        player.prepare()
        player.playWhenReady = true
        startService()
    }

    private fun buildMediaItem(track: Track, urlOverride: String? = null): MediaItem? {
        val uri = urlOverride ?: track.previewUrl
        if (uri.isNullOrEmpty()) return null
        val builder = MediaItem.Builder()
            .setMediaId(track.id)
            .setUri(uri)
            .setMediaMetadata(
                androidx.media3.common.MediaMetadata.Builder()
                    .setTitle(track.title)
                    .setArtist(track.artist)
                    .setAlbumTitle(track.album)
                    .apply {
                        track.artworkUrl?.let { url ->
                            val uri = Uri.parse(url)
                            if (uri.scheme != null) {
                                setArtworkUri(uri)
                            }
                        }
                    }
                    .build()
            )
        return builder.build()
    }

    override fun togglePlayPause() {
        if (player.playWhenReady) {
            player.pause()
        } else {
            player.play()
        }
    }

    override fun seekTo(positionMs: Long) {
        player.seekTo(positionMs)
        updateState()
    }

    override fun skipToNext() {
        player.seekToNextMediaItem()
    }

    override fun skipToPrevious() {
        player.seekToPreviousMediaItem()
    }

    override fun setVolume(volume: Float) {
        player.volume = volume
    }

    override fun setRepeatMode(mode: RepeatMode) {
        _repeatMode = mode
        when (mode) {
            RepeatMode.OFF -> player.repeatMode = Player.REPEAT_MODE_OFF
            RepeatMode.ONE -> player.repeatMode = Player.REPEAT_MODE_ONE
            RepeatMode.ALL -> player.repeatMode = Player.REPEAT_MODE_ALL
        }
        _state.value = _state.value.copy(repeatMode = mode)
    }

    override fun setShuffleMode(mode: ShuffleMode) {
        _shuffleMode = mode
        player.shuffleModeEnabled = mode == ShuffleMode.ON
        _state.value = _state.value.copy(shuffleMode = mode)
    }

    override fun setSpeed(speed: Float) {
        _speed = speed.coerceIn(0.5f, 2.0f)
        _state.value = _state.value.copy(speed = _speed)
        player.setPlaybackSpeed(_speed)
    }

    override fun reorderQueue(fromIndex: Int, toIndex: Int) {
        val queue = _state.value.queue.toMutableList()
        if (fromIndex < 0 || fromIndex >= queue.size || toIndex < 0 || toIndex >= queue.size) return
        val item = queue.removeAt(fromIndex)
        queue.add(toIndex, item)
        _state.value = _state.value.copy(queue = queue)
        val mediaItems = queue.mapNotNull { buildMediaItem(it) }
        val currentIndex = queue.indexOfFirst { it.id == _state.value.currentTrack?.id }.coerceAtLeast(0)
        player.setMediaItems(mediaItems, currentIndex, C.TIME_UNSET)
    }

    override fun clearQueue() {
        _state.value = _state.value.copy(queue = emptyList())
        player.stop()
        player.clearMediaItems()
    }

    override fun removeFromQueue(trackId: String) {
        val queue = _state.value.queue.filter { it.id != trackId }
        _state.value = _state.value.copy(queue = queue)
        player.setMediaItems(queue.mapNotNull { buildMediaItem(it) })
    }

    override fun previewTrack(track: Track, audioUrl: String) {
        previewJob?.cancel()
        currentAudioUrl = audioUrl
        _state.value = _state.value.copy(currentTrack = track, currentAudioSource = audioUrl)
        val mediaItem = buildMediaItem(track, audioUrl) ?: return
        player.stop()
        player.setMediaItems(listOf(mediaItem))
        player.prepare()
        player.playWhenReady = true
        startService()
        previewJob = scope.launch {
            delay(30_000)
            if (player.isPlaying) {
                player.stop()
            }
        }
    }

    override fun setSleepTimer(minutes: Int) {
        sleepTimerJob?.cancel()
        if (minutes > 0) {
            sleepTimerJob = scope.launch {
                delay(minutes * 60 * 1000L)
                if (isActive) {
                    player.pause()
                }
            }
        }
    }

    override fun cancelSleepTimer() {
        sleepTimerJob?.cancel()
        sleepTimerJob = null
    }

    override fun release() {
        positionJob?.cancel()
        sleepTimerJob?.cancel()
        previewJob?.cancel()
        loadTimeoutJob?.cancel()
        scope.coroutineContext[Job]?.cancel()
        player.removeListener(playerListener)
        player.release()
        mediaSession.release()
        (context.applicationContext as SincApp).mediaSession = null
    }

    private fun updatePositionPolling() {
        positionJob?.cancel()
        if (player.playWhenReady && player.playbackState != Player.STATE_ENDED) {
            positionJob = scope.launch {
                while (isActive) {
                    updateState()
                    delay(250)
                }
            }
        }
    }

    private fun updateState() {
        val currentIndex = player.currentMediaItemIndex
        val queue = _state.value.queue
        val currentTrack = if (currentIndex >= 0 && currentIndex < queue.size) {
            queue[currentIndex]
        } else _state.value.currentTrack

        _state.value = _state.value.copy(
            currentTrack = currentTrack,
            currentAudioSource = currentAudioUrl,
            isPlaying = player.playWhenReady,
            position = player.currentPosition,
            duration = player.duration.coerceAtLeast(0)
        )
    }

    private fun startService() {
        val intent = Intent(context, MediaPlaybackService::class.java)
        context.startForegroundService(intent)
    }
}
