package com.sinc.enhanced.ui.screens.track

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.sinc.enhanced.SincApp
import com.sinc.enhanced.data.model.Artist
import com.sinc.enhanced.data.model.Track
import com.sinc.enhanced.data.remote.LyricsClient
import com.sinc.enhanced.data.repository.SearchRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

data class TrackDetailUiState(
    val track: Track? = null,
    val artist: Artist? = null,
    val lyrics: String? = null,
    val audioUrl: String? = null,
    val isLoading: Boolean = true,
    val error: String? = null
)

class TrackDetailViewModel(
    private val trackId: String,
    private val searchRepository: SearchRepository,
    private val lyricsClient: LyricsClient
) : ViewModel() {

    private val _uiState = MutableStateFlow(TrackDetailUiState())
    val uiState: StateFlow<TrackDetailUiState> = _uiState.asStateFlow()

    init {
        loadTrack()
    }

    private fun loadTrack() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, error = null)
            try {
                var track: Track? = null
                val sourcePrefix = listOf("yt_", "dz_", "sc_", "aud_", "jam_", "fma_", "bc_")
                    .firstOrNull { trackId.startsWith(it) }
                if (sourcePrefix != null) {
                    track = withContext(Dispatchers.IO) {
                        try {
                            val keyword = trackId.removePrefix(sourcePrefix).replace("_", " ")
                            searchRepository.searchYouTubeOnly(keyword).firstOrNull()?.track
                        } catch (_: Exception) { null }
                    }
                    if (track == null) {
                        track = Track(id = trackId, title = "Track", artist = "Unknown", album = "")
                    }
                } else {
                    track = withContext(Dispatchers.IO) { searchRepository.getTrack(trackId) }
                }
                if (track == null) {
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        error = "Could not load track details."
                    )
                    return@launch
                }
                val lyrics = withContext(Dispatchers.IO) { lyricsClient.getLyrics(track.artist, track.title, track.album) }
                val artist = withContext(Dispatchers.IO) { searchRepository.searchArtists(track.artist).firstOrNull() }
                val audioUrl = withContext(Dispatchers.IO) {
                    searchRepository.findBestAudioForTrack(track)?.first
                }
                _uiState.value = TrackDetailUiState(
                    track = track,
                    artist = artist,
                    lyrics = lyrics?.plainLyrics ?: lyrics?.syncedLyrics,
                    audioUrl = audioUrl,
                    isLoading = false
                )
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    error = e.message ?: "Failed to load track"
                )
            }
        }
    }

    class Factory(private val trackId: String) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            val container = SincApp.instance.container
            return TrackDetailViewModel(trackId, container.searchRepository, container.lyricsClient) as T
        }
    }
}
