package com.sinc.enhanced.ui.screens.player

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.sinc.enhanced.SincApp
import com.sinc.enhanced.data.model.Track
import com.sinc.enhanced.data.remote.LyricsClient
import com.sinc.enhanced.player.MusicPlayer
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class PlayerUiState(
    val currentTrack: Track? = null,
    val isPlaying: Boolean = false,
    val position: Long = 0,
    val duration: Long = 0,
    val lyrics: String? = null,
    val isLoadingLyrics: Boolean = false
)

class PlayerViewModel(
    private val musicPlayer: MusicPlayer,
    private val lyricsClient: LyricsClient
) : ViewModel() {

    private val _uiState = MutableStateFlow(PlayerUiState())
    val uiState: StateFlow<PlayerUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            musicPlayer.state.collect { playerState ->
                _uiState.value = _uiState.value.copy(
                    currentTrack = playerState.currentTrack,
                    isPlaying = playerState.isPlaying,
                    position = playerState.position,
                    duration = playerState.duration
                )
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

    private fun loadLyrics() {
        val track = _uiState.value.currentTrack ?: return
        _uiState.value = _uiState.value.copy(isLoadingLyrics = true)
        viewModelScope.launch {
            try {
                val result = lyricsClient.getLyrics(track.artist, track.title, track.album)
                _uiState.value = _uiState.value.copy(
                    lyrics = result.plainLyrics ?: result.syncedLyrics,
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
