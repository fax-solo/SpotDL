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
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

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

    private val playerListener = object : Player.Listener {
        override fun onPlaybackStateChanged(playbackState: Int) {
            updateState()
        }

        override fun onIsPlayingChanged(isPlaying: Boolean) {
            updateState()
        }

        override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
            updateState()
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

    fun play(track: Track) {
        val updatedQueue = if (_state.value.queue.none { it.id == track.id }) {
            _state.value.queue + track
        } else _state.value.queue

        _state.value = _state.value.copy(
            currentTrack = track,
            queue = updatedQueue
        )

        val mediaItem = buildMediaItem(track)
        player.setMediaItem(mediaItem)
        player.prepare()
        player.play()

        startService()
    }

    fun playUrl(track: Track, url: String) {
        _state.value = _state.value.copy(currentTrack = track)

        val mediaItem = buildMediaItem(track, url)
        player.setMediaItem(mediaItem)
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
        player.removeListener(playerListener)
        player.release()
        mediaSession.release()
        (context.applicationContext as SincApp).mediaSession = null
    }

    private fun updateState() {
        _state.value = _state.value.copy(
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
