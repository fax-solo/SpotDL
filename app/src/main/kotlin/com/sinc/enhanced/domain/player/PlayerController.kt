package com.sinc.enhanced.domain.player

import com.sinc.enhanced.data.model.Track
import kotlinx.coroutines.flow.StateFlow

enum class RepeatMode {
    OFF, ONE, ALL
}

enum class ShuffleMode {
    OFF, ON
}

data class PlayerState(
    val currentTrack: Track? = null,
    val currentAudioSource: String? = null,
    val isPlaying: Boolean = false,
    val position: Long = 0,
    val duration: Long = 0,
    val queue: List<Track> = emptyList(),
    val repeatMode: RepeatMode = RepeatMode.ALL,
    val shuffleMode: ShuffleMode = ShuffleMode.OFF,
    val speed: Float = 1.0f,
    val sleepTimerMinutes: Int = 0
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
    fun setRepeatMode(mode: RepeatMode)
    fun setShuffleMode(mode: ShuffleMode)
    fun setSpeed(speed: Float)
    fun setSleepTimer(minutes: Int)
    fun cancelSleepTimer()
    fun reorderQueue(fromIndex: Int, toIndex: Int)
    fun clearQueue()
    fun removeFromQueue(trackId: String)
    fun previewTrack(track: Track, audioUrl: String)
    fun release()
}