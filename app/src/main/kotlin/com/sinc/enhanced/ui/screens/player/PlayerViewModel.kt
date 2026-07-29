package com.sinc.enhanced.ui.screens.player

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.sinc.enhanced.SincApp
import com.sinc.enhanced.data.model.Track
import com.sinc.enhanced.data.remote.LyricsClient
import com.sinc.enhanced.domain.player.PlayerController
import com.sinc.enhanced.domain.player.PlayerState
import com.sinc.enhanced.domain.player.RepeatMode
import com.sinc.enhanced.domain.player.ShuffleMode
import com.sinc.enhanced.player.MusicPlayer
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

data class PlayerUiState(
    val currentTrack: Track? = null,
    val isPlaying: Boolean = false,
    val position: Long = 0,
    val duration: Long = 0,
    val lyrics: String? = null,
    val isLoadingLyrics: Boolean = false,
    val speed: Float = 1.0f,
    val sleepTimerMinutes: Int = 0,
    val queue: List<Track> = emptyList(),
    val currentQueueIndex: Int = 0,
    val repeatMode: RepeatMode = RepeatMode.ALL,
    val shuffleMode: ShuffleMode = ShuffleMode.OFF,
    val isLiked: Boolean = false
)

class PlayerViewModel(
    private val musicPlayer: MusicPlayer,
    private val lyricsClient: LyricsClient
) : ViewModel() {

    private val _uiState = MutableStateFlow(PlayerUiState())
    val uiState: StateFlow<PlayerUiState> = _uiState.asStateFlow()
    private val userLibraryRepository = SincApp.instance.container.userLibraryRepository

    init {
        viewModelScope.launch {
            var previousTrackId: String? = null
            musicPlayer.state
                .debounce(200)
                .collect { playerState ->
                _uiState.value = _uiState.value.copy(
                    currentTrack = playerState.currentTrack,
                    isPlaying = playerState.isPlaying,
                    position = playerState.position,
                    duration = playerState.duration,
                    queue = playerState.queue,
                    currentQueueIndex = playerState.queue.indexOfFirst { it.id == playerState.currentTrack?.id }.coerceAtLeast(0),
                    repeatMode = playerState.repeatMode,
                    shuffleMode = playerState.shuffleMode,
                    speed = playerState.speed,
                    sleepTimerMinutes = playerState.sleepTimerMinutes
                )
                val track = playerState.currentTrack
                if (track != null && track.id != previousTrackId) {
                    previousTrackId = track.id
                    _uiState.value = _uiState.value.copy(
                        lyrics = null, isLoadingLyrics = false,
                        isLiked = userLibraryRepository.isTrackLiked(track.id)
                    )
                    loadLyrics(track)
                }
            }
        }
    }

    fun toggleLike() {
        val track = _uiState.value.currentTrack ?: return
        viewModelScope.launch {
            if (_uiState.value.isLiked) {
                userLibraryRepository.unlikeTrack(track.id)
                _uiState.value = _uiState.value.copy(isLiked = false)
            } else {
                userLibraryRepository.likeTrack(track)
                _uiState.value = _uiState.value.copy(isLiked = true)
            }
        }
    }

    fun togglePlayPause() {
        musicPlayer.togglePlayPause()
    }

    fun seekTo(positionMs: Long) {
        musicPlayer.seekTo(positionMs)
    }

    fun skipToNext() {
        musicPlayer.skipToNext()
    }

    fun skipToPrevious() {
        musicPlayer.skipToPrevious()
    }

    fun setSpeed(speed: Float) {
        musicPlayer.setSpeed(speed)
    }

    fun setRepeatMode(mode: RepeatMode) {
        musicPlayer.setRepeatMode(mode)
    }

    fun setShuffleMode(mode: ShuffleMode) {
        musicPlayer.setShuffleMode(mode)
    }

    fun setSleepTimer(minutes: Int) {
        musicPlayer.setSleepTimer(minutes)
    }

    fun cancelSleepTimer() {
        musicPlayer.cancelSleepTimer()
    }

    fun clearQueue() {
        musicPlayer.clearQueue()
    }

    fun removeFromQueue(trackId: String) {
        musicPlayer.removeFromQueue(trackId)
    }

    fun reorderQueue(fromIndex: Int, toIndex: Int) {
        musicPlayer.reorderQueue(fromIndex, toIndex)
    }

    private fun loadLyrics(track: Track) {
        if (_uiState.value.isLoadingLyrics) return
        _uiState.value = _uiState.value.copy(isLoadingLyrics = true)
        viewModelScope.launch {
            try {
                val result = withContext(Dispatchers.IO) {
                    lyricsClient.getLyrics(track.artist, track.title, track.album)
                }
                _uiState.value = _uiState.value.copy(
                    lyrics = result?.plainLyrics ?: result?.syncedLyrics,
                    isLoadingLyrics = false
                )
            } catch (_: Exception) {
                _uiState.value = _uiState.value.copy(isLoadingLyrics = false)
            }
        }
    }

    class Factory : ViewModelProvider.Factory {
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            val container = SincApp.instance.container
            @Suppress("UNCHECKED_CAST")
            return PlayerViewModel(container.musicPlayer, container.lyricsClient) as T
        }
    }
}
