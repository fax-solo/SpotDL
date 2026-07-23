package com.sinc.enhanced.player

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.session.MediaSession
import com.sinc.enhanced.MainActivity
import com.sinc.enhanced.SincApp
import com.sinc.enhanced.data.model.Track
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

class MusicPlayer(private val context: Context) {

    data class PlayerState(
        val currentTrack: Track? = null,
        val isPlaying: Boolean = false,
        val position: Long = 0,
        val duration: Long = 0,
        val queue: List<Track> = emptyList()
    )

    private val _state = MutableStateFlow(PlayerState())
    val state: StateFlow<PlayerState> = _state.asStateFlow()

    private val _recentlyPlayed = MutableStateFlow<List<Track>>(emptyList())
    val recentlyPlayed: StateFlow<List<Track>> = _recentlyPlayed.asStateFlow()

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
    private var positionJob: Job? = null

    private val playerListener = object : Player.Listener {
        override fun onPlaybackStateChanged(playbackState: Int) {
            updateState()
            updatePositionPolling()
        }

        override fun onIsPlayingChanged(isPlaying: Boolean) {
            updateState()
            updatePositionPolling()
        }

        override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
            updateState()
            updatePositionPolling()
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

    private fun addToRecentlyPlayed(track: Track) {
        val current = _recentlyPlayed.value.toMutableList()
        current.removeAll { it.id == track.id }
        current.add(0, track)
        _recentlyPlayed.value = current.take(20)
    }

    fun play(track: Track) {
        addToRecentlyPlayed(track)
        val updatedQueue = if (_state.value.queue.none { it.id == track.id }) {
            _state.value.queue + track
        } else _state.value.queue

        _state.value = _state.value.copy(
            currentTrack = track,
            queue = updatedQueue
        )

        val mediaItems = updatedQueue.map { buildMediaItem(it) }
        val index = updatedQueue.indexOfFirst { it.id == track.id }.coerceAtLeast(0)
        player.setMediaItems(mediaItems, index, C.TIME_UNSET)
        player.prepare()
        player.play()

        startService()
    }

    fun playUrl(track: Track, url: String) {
        addToRecentlyPlayed(track)
        val newQueue = listOf(track)
        _state.value = _state.value.copy(currentTrack = track, queue = newQueue)

        val mediaItem = buildMediaItem(track, url)
        player.setMediaItems(listOf(mediaItem))
        player.prepare()
        player.play()

        startService()
    }

    private fun buildMediaItem(track: Track, urlOverride: String? = null): MediaItem {
        val uri = urlOverride ?: track.previewUrl
        val builder = MediaItem.Builder()
            .setMediaId(track.id)
            .apply { if (uri != null && uri.isNotEmpty()) setUri(uri) }
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

    fun togglePlayPause() {
        if (player.isPlaying) {
            player.pause()
        } else {
            player.play()
        }
    }

    fun seekTo(positionMs: Long) {
        player.seekTo(positionMs)
        updateState()
    }

    fun skipToNext() {
        player.seekToNextMediaItem()
    }

    fun skipToPrevious() {
        player.seekToPreviousMediaItem()
    }

    fun setVolume(volume: Float) {
        player.volume = volume
    }

    fun release() {
        positionJob?.cancel()
        player.removeListener(playerListener)
        player.release()
        mediaSession.release()
        (context.applicationContext as SincApp).mediaSession = null
    }

    private fun updatePositionPolling() {
        positionJob?.cancel()
        if (player.isPlaying && player.playbackState != Player.STATE_ENDED) {
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
            isPlaying = player.isPlaying,
            position = player.currentPosition,
            duration = player.duration.coerceAtLeast(0)
        )
    }

    private fun startService() {
        val intent = Intent(context, MediaPlaybackService::class.java)
        context.startForegroundService(intent)
    }
}
