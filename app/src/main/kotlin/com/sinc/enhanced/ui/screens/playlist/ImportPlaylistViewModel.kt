package com.sinc.enhanced.ui.screens.playlist

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.sinc.enhanced.SincApp
import com.sinc.enhanced.data.model.Track
import com.sinc.enhanced.data.remote.SpotifyClient
import com.sinc.enhanced.data.repository.DownloadRepository
import com.sinc.enhanced.data.repository.SearchRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

data class ImportPlaylistUiState(
    val url: String = "",
    val isLoading: Boolean = false,
    val playlistName: String? = null,
    val playlistDescription: String? = null,
    val playlistImage: String? = null,
    val playlistOwner: String? = null,
    val tracks: List<Track> = emptyList(),
    val trackAudioUrls: Map<String, String> = emptyMap(),
    val isDownloading: Boolean = false,
    val downloadProgress: String = "",
    val error: String? = null
)

class ImportPlaylistViewModel(
    private val spotifyClient: SpotifyClient,
    private val searchRepository: SearchRepository,
    private val downloadRepository: DownloadRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(ImportPlaylistUiState())
    val uiState: StateFlow<ImportPlaylistUiState> = _uiState.asStateFlow()

    fun onUrlChange(url: String) {
        _uiState.value = _uiState.value.copy(url = url, error = null)
    }

    fun fetchPlaylist() {
        val playlistId = parsePlaylistId(_uiState.value.url.trim())
        if (playlistId == null) {
            _uiState.value = _uiState.value.copy(error = "Invalid Spotify playlist URL")
            return
        }

        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, error = null, tracks = emptyList())
            try {
                val playlist = withContext(Dispatchers.IO) { spotifyClient.getPlaylist(playlistId) }
                if (playlist == null) {
                    _uiState.value = _uiState.value.copy(isLoading = false, error = "Could not fetch playlist. Check the URL and try again.")
                    return@launch
                }

                var allTracks = mutableListOf<Track>()
                var offset = 0
                val limit = 100
                var hasMore = true

                while (hasMore) {
                    val batch = withContext(Dispatchers.IO) {
                        spotifyClient.getPlaylistTracks(playlistId, offset, limit)
                    }
                    allTracks.addAll(batch)
                    offset += limit
                    hasMore = batch.size >= limit
                }

                val audioUrls = withContext(Dispatchers.IO) {
                    allTracks.map { track ->
                        async { track.id to searchRepository.findBestAudioForTrack(track) }
                    }.mapNotNull { deferred ->
                        val (id, result) = deferred.await()
                        if (result != null) id to result.first else null
                    }.toMap()
                }

                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    playlistName = playlist["name"] as? String,
                    playlistDescription = playlist["description"] as? String,
                    playlistImage = playlist["imageUrl"] as? String,
                    playlistOwner = playlist["owner"] as? String,
                    tracks = allTracks,
                    trackAudioUrls = audioUrls
                )
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    error = e.message ?: "Failed to fetch playlist"
                )
            }
        }
    }

    fun downloadAll(onQueueComplete: () -> Unit = {}) {
        val state = _uiState.value
        val available = state.tracks.filter { state.trackAudioUrls.containsKey(it.id) }
        if (available.isEmpty()) return

        _uiState.value = state.copy(isDownloading = true, downloadProgress = "Queuing downloads...")
        viewModelScope.launch {
            var count = 0
            val total = available.size
            for (track in available) {
                val audioUrl = state.trackAudioUrls[track.id]
                if (audioUrl != null) {
                    downloadRepository.addToQueue(track, audioUrl)
                }
                count++
                _uiState.value = _uiState.value.copy(
                    downloadProgress = "Queued $count of $total"
                )
            }
            _uiState.value = _uiState.value.copy(
                isDownloading = false,
                downloadProgress = "$count tracks queued for download"
            )
            onQueueComplete()
        }
    }

    fun parsePlaylistId(input: String): String? {
        val trimmed = input.trim()
        if (trimmed.isEmpty()) return null

        val patterns = listOf(
            Regex("""open\.spotify\.com/playlist/([a-zA-Z0-9]+)"""),
            Regex("""spotify\.com/playlist/([a-zA-Z0-9]+)"""),
            Regex("""spotify:playlist:([a-zA-Z0-9]+)"""),
            Regex("""^([a-zA-Z0-9]{22})$""")
        )
        
        for (pattern in patterns) {
            val match = pattern.find(trimmed)
            if (match != null) {
                val id = match.groupValues[1]
                if (pattern == patterns.last() && id.length != 22) return null
                return id
            }
        }
        return null
    }

    class Factory : ViewModelProvider.Factory {
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            @Suppress("UNCHECKED_CAST")
            val c = SincApp.instance.container
            return ImportPlaylistViewModel(c.spotifyClient, c.searchRepository, c.downloadRepository) as T
        }
    }
}
