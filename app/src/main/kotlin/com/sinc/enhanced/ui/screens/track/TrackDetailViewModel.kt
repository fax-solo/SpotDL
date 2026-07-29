package com.sinc.enhanced.ui.screens.track

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.sinc.enhanced.SincApp
import com.sinc.enhanced.data.local.entity.DownloadEntity
import com.sinc.enhanced.data.model.Artist
import com.sinc.enhanced.data.model.Track
import com.sinc.enhanced.data.repository.DownloadRepository
import com.sinc.enhanced.data.repository.SearchRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

data class TrackDetailUiState(
    val track: Track? = null,
    val artist: Artist? = null,
    val audioUrl: String? = null,
    val isLoading: Boolean = true,
    val isDownloading: Boolean = false,
    val isResolving: Boolean = false,
    val error: String? = null
)

class TrackDetailViewModel(
    private val trackId: String,
    private val searchRepository: SearchRepository,
    private val downloadRepository: DownloadRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(TrackDetailUiState())
    val uiState: StateFlow<TrackDetailUiState> = _uiState.asStateFlow()

    init {
        loadTrack()
    }

    fun retryLoad() {
        loadTrack()
    }

    fun download(audioUrl: String) {
        val track = _uiState.value.track ?: return
        _uiState.value = _uiState.value.copy(isDownloading = true)
        viewModelScope.launch {
            downloadRepository.addToQueue(track, audioUrl) 
            _uiState.value = _uiState.value.copy(isDownloading = false)
        }
    }

    fun playOrResolve(onPlay: (Track, String) -> Unit) {
        val state = _uiState.value
        val track = state.track ?: return
        val url = state.audioUrl ?: track.previewUrl
        if (url != null) {
            onPlay(track, url)
        } else {
            _uiState.value = state.copy(isResolving = true)
            viewModelScope.launch {
                try {
                    val resolved = withContext(Dispatchers.IO) {
                        searchRepository.findBestAudioForTrack(track)
                    }
                    if (resolved != null) {
                        _uiState.value = _uiState.value.copy(audioUrl = resolved.first, isResolving = false)
                        onPlay(track, resolved.first)
                    } else {
                        _uiState.value = _uiState.value.copy(isResolving = false)
                    }
                } catch (_: Exception) {
                    _uiState.value = _uiState.value.copy(isResolving = false)
                }
            }
        }
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

                val trackRef = track
                val artistDeferred = async {
                    withContext(Dispatchers.IO) {
                        searchRepository.searchArtists(trackRef.artist).firstOrNull()
                    }
                }
                val audioDeferred = async {
                    withContext(Dispatchers.IO) {
                        searchRepository.findBestAudioForTrack(trackRef)?.first
                    }
                }

                val artist = artistDeferred.await()
                val audioUrl = audioDeferred.await()

                _uiState.value = TrackDetailUiState(
                    track = track,
                    artist = artist,
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
            return TrackDetailViewModel(trackId, container.searchRepository, container.downloadRepository) as T
        }
    }
}
