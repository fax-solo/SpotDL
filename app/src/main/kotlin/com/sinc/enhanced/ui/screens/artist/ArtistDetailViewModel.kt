package com.sinc.enhanced.ui.screens.artist

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.sinc.enhanced.SincApp
import com.sinc.enhanced.data.model.Album
import com.sinc.enhanced.data.model.Artist
import com.sinc.enhanced.data.model.Track
import com.sinc.enhanced.data.repository.SearchRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

data class ArtistUiState(
    val artist: Artist? = null,
    val topTracks: List<Track> = emptyList(),
    val albums: List<Album> = emptyList(),
    val relatedArtists: List<Artist> = emptyList(),
    val resolvedAudioUrls: Map<String, String> = emptyMap(),
    val isLoading: Boolean = true,
    val error: String? = null
)

class ArtistDetailViewModel(
    private val artistId: String,
    private val searchRepository: SearchRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(ArtistUiState())
    val uiState: StateFlow<ArtistUiState> = _uiState.asStateFlow()

    init {
        loadArtist()
    }

    private fun loadArtist() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, error = null)
            try {
                val artist = searchRepository.getArtist(artistId)
                if (artist == null) {
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        error = "Could not load artist. Make sure you have a working internet connection."
                    )
                    return@launch
                }
                val topTracks = searchRepository.getArtistTopTracks(artistId)
                val related = searchRepository.getRelatedArtists(artistId)
                val audioUrls = withContext(Dispatchers.IO) {
                    topTracks.map { track ->
                        async { track.id to searchRepository.findBestAudioForTrack(track)?.first }
                    }.mapNotNull { deferred ->
                        val (id, url) = deferred.await()
                        if (url != null) id to url else null
                    }.toMap()
                }
                _uiState.value = ArtistUiState(
                    artist = artist,
                    topTracks = topTracks,
                    albums = artist.albums,
                    relatedArtists = related,
                    resolvedAudioUrls = audioUrls,
                    isLoading = false
                )
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    error = e.message ?: "Failed to load artist"
                )
            }
        }
    }

    class Factory(private val artistId: String) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            return ArtistDetailViewModel(artistId, SincApp.instance.container.searchRepository) as T
        }
    }
}
