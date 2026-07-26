package com.sinc.enhanced.ui.screens.playlist

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.sinc.enhanced.SincApp
import com.sinc.enhanced.data.model.Track
import com.sinc.enhanced.data.remote.DeezerClient
import com.sinc.enhanced.data.remote.SpotifyClient
import com.sinc.enhanced.data.repository.DownloadRepository
import com.sinc.enhanced.data.repository.SearchRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout

data class ImportPlaylistUiState(
    val url: String = "",
    val source: String = "spotify",
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
    private val deezerClient: DeezerClient,
    private val searchRepository: SearchRepository,
    private val downloadRepository: DownloadRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(ImportPlaylistUiState())
    val uiState: StateFlow<ImportPlaylistUiState> = _uiState.asStateFlow()

    fun onUrlChange(url: String) {
        _uiState.value = _uiState.value.copy(url = url, error = null)
    }

    fun fetchPlaylist() {
        val (source, playlistId) = parsePlaylistUrl(_uiState.value.url.trim())
        if (playlistId == null) {
            _uiState.value = _uiState.value.copy(error = "Invalid playlist URL. Supports Spotify and Deezer links.")
            return
        }

        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, error = null, tracks = emptyList())
            try {
                val result = withContext(Dispatchers.IO) { fetchFromSource(source, playlistId) }
                if (result == null) {
                    _uiState.value = _uiState.value.copy(isLoading = false, error = "Could not fetch playlist. Check the URL and try again.")
                    return@launch
                }

                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    source = result.source,
                    playlistName = result.name,
                    playlistDescription = result.description,
                    playlistImage = result.imageUrl,
                    playlistOwner = result.owner,
                    tracks = result.tracks,
                    trackAudioUrls = result.audioUrls
                )
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    error = e.message ?: "Failed to fetch playlist"
                )
            }
        }
    }

    private data class FetchResult(
        val source: String,
        val name: String,
        val description: String,
        val imageUrl: String?,
        val owner: String,
        val tracks: List<Track>,
        val audioUrls: Map<String, String>
    )

    private suspend fun fetchFromSource(source: String, playlistId: String): FetchResult? {
        return when (source) {
            "spotify" -> fetchFromSpotify(playlistId)
            "deezer" -> fetchFromDeezer(playlistId.toLongOrNull() ?: return null)
            else -> null
        }
    }

    private suspend fun fetchFromSpotify(playlistId: String): FetchResult? {
        val playlist = spotifyClient.getPlaylist(playlistId) ?: return null

        var allTracks = mutableListOf<Track>()
        var offset = 0
        val limit = 100

        while (true) {
            val result = spotifyClient.getPlaylistTracks(playlistId, offset, limit)
            allTracks.addAll(result.tracks)
            val nextOffset = result.nextOffset ?: break
            offset = nextOffset
        }

        val audioUrls = resolveAudioUrls(allTracks)

        return FetchResult(
            source = "spotify",
            name = playlist["name"] as? String ?: "Unknown",
            description = playlist["description"] as? String ?: "",
            imageUrl = playlist["imageUrl"] as? String,
            owner = playlist["owner"] as? String ?: "Unknown",
            tracks = allTracks,
            audioUrls = audioUrls
        )
    }

    private suspend fun fetchFromDeezer(deezerId: Long): FetchResult? {
        val playlist = deezerClient.getPlaylist(deezerId) ?: return null

        var allDzTracks = mutableListOf<com.sinc.enhanced.data.remote.DeezerClient.DeezerTrack>()
        var index = 0
        val limit = 100
        var hasMore = true

        while (hasMore) {
            val batch = deezerClient.getPlaylistTracks(deezerId, index, limit)
            allDzTracks.addAll(batch)
            index += limit
            hasMore = batch.size >= limit
        }

        val trackMap = mutableMapOf<String, Track>()
        val tracks = allDzTracks.map { dz ->
            val id = "dz_${dz.id}"
            val track = Track(
                id = id,
                title = dz.title,
                artist = dz.artist,
                album = dz.album,
                durationMs = dz.duration * 1000L,
                artworkUrl = dz.artworkUrl,
                isrc = dz.isrc,
                source = "deezer"
            )
            trackMap[id] = track
            track
        }

        val audioUrls = resolveAudioUrls(tracks)

        return FetchResult(
            source = "deezer",
            name = playlist.title,
            description = playlist.description,
            imageUrl = playlist.imageUrl,
            owner = playlist.creator,
            tracks = tracks,
            audioUrls = audioUrls
        )
    }

    private suspend fun resolveAudioUrls(tracks: List<Track>): Map<String, String> = coroutineScope {
        val results = mutableMapOf<String, String>()
        val deferreds = tracks.map { track ->
            async { track.id to searchRepository.findBestAudioForTrack(track) }
        }
        val deadline = System.currentTimeMillis() + 60000L
        for (deferred in deferreds) {
            val remaining = deadline - System.currentTimeMillis()
            if (remaining <= 0) break
            try {
                val (id, audioInfo) = withTimeout(remaining) { deferred.await() }
                if (audioInfo != null) results[id] = audioInfo.first
            } catch (_: Exception) {}
        }
        results
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

    fun parsePlaylistUrl(input: String): Pair<String, String?> {
        val trimmed = input.trim()
        if (trimmed.isEmpty()) return "" to null

        val spotifyPatterns = listOf(
            Regex("""open\.spotify\.com/playlist/([a-zA-Z0-9]+)"""),
            Regex("""spotify\.com/playlist/([a-zA-Z0-9]+)"""),
            Regex("""spotify:playlist:([a-zA-Z0-9]+)"""),
            Regex("""^([a-zA-Z0-9]{22})$""")
        )
        for (pattern in spotifyPatterns) {
            val match = pattern.find(trimmed)
            if (match != null) {
                val id = match.groupValues[1]
                if (pattern == spotifyPatterns.last() && id.length != 22) continue
                return "spotify" to id
            }
        }

        val deezerPatterns = listOf(
            Regex("""deezer\.com/(?:[a-z]{2}/)?playlist/(\d+)"""),
            Regex("""deezer:playlist:(\d+)"""),
            Regex("""^(\d+)$""")
        )
        for (pattern in deezerPatterns) {
            val match = pattern.find(trimmed)
            if (match != null) {
                return "deezer" to match.groupValues[1]
            }
        }

        return "" to null
    }

    class Factory : ViewModelProvider.Factory {
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            @Suppress("UNCHECKED_CAST")
            val c = SincApp.instance.container
            return ImportPlaylistViewModel(c.spotifyClient, c.deezerClient, c.searchRepository, c.downloadRepository) as T
        }
    }
}
