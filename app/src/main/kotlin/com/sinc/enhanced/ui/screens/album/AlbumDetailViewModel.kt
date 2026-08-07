package com.sinc.enhanced.ui.screens.album

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.sinc.enhanced.SincApp
import com.sinc.enhanced.data.model.Album
import com.sinc.enhanced.data.model.Track
import com.sinc.enhanced.data.repository.SearchRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

data class AlbumUiState(
    val album: Album? = null,
    val tracks: List<Track> = emptyList(),
    val resolvedAudioUrls: Map<String, String> = emptyMap(),
    val isLoading: Boolean = true,
    val error: String? = null
)

class AlbumDetailViewModel(
    private val albumId: String,
    private val searchRepository: SearchRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(AlbumUiState())
    val uiState: StateFlow<AlbumUiState> = _uiState.asStateFlow()

    init {
        loadAlbum()
    }

    private fun loadAlbum() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, error = null)
            try {
                val album = searchRepository.getAlbum(albumId)
                if (album == null) {
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        error = "Could not load album. Make sure you have a working internet connection."
                    )
                    return@launch
                }
                val loadedTracks = album.tracks
                val audioUrls = withContext(Dispatchers.IO) {
                    loadedTracks.map { track ->
                        async { track.id to searchRepository.findBestAudioForTrack(track)?.first }
                    }.mapNotNull { deferred ->
                        val (id, url) = deferred.await()
                        if (url != null) id to url else null
                    }.toMap()
                }
                _uiState.value = AlbumUiState(
                    album = album,
                    tracks = loadedTracks,
                    resolvedAudioUrls = audioUrls,
                    isLoading = false
                )
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    error = e.message ?: "Failed to load album"
                )
            }
        }
    }

    class Factory(private val albumId: String) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            return AlbumDetailViewModel(albumId, SincApp.instance.container.searchRepository) as T
        }
    }
}
