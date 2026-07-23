package com.sinc.enhanced.domain.player

import com.sinc.enhanced.data.model.Track
import kotlinx.coroutines.flow.StateFlow

data class PlayerState(
    val currentTrack: Track? = null,
    val isPlaying: Boolean = false,
    val position: Long = 0,
    val duration: Long = 0,
    val queue: List<Track> = emptyList()
)

interface PlayerController {
    val state: StateFlow<PlayerState>
    val recentlyPlayed: StateFlow<List<Track>>

    fun play(track: Track)
    fun playUrl(track: Track, url: String)
    fun playAll(tracks: List<Track>)
    fun togglePlayPause()
    fun seekTo(positionMs: Long)
    fun skipToNext()
    fun skipToPrevious()
    fun setVolume(volume: Float)
    fun release()
}
