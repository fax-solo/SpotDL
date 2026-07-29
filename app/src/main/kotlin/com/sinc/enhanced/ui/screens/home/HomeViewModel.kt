package com.sinc.enhanced.ui.screens.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.sinc.enhanced.SincApp
import com.sinc.enhanced.data.local.dao.SearchHistoryDao
import com.sinc.enhanced.data.local.entity.DownloadEntity
import com.sinc.enhanced.data.model.Track
import com.sinc.enhanced.data.repository.DownloadRepository
import com.sinc.enhanced.data.repository.SearchRepository
import com.sinc.enhanced.player.MusicPlayer
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.util.Calendar

data class HomeUiState(
    val recentSearches: List<String> = emptyList(),
    val recommendations: List<Track> = emptyList(),
    val recentlyPlayed: List<Track> = emptyList(),
    val recentlyDownloaded: List<DownloadEntity> = emptyList(),
    val newReleases: List<Track> = emptyList(),
    val isLoading: Boolean = true,
    val error: String? = null
)

class HomeViewModel(
    private val searchHistoryDao: SearchHistoryDao,
    private val searchRepository: SearchRepository,
    private val musicPlayer: MusicPlayer,
    private val downloadRepository: DownloadRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(HomeUiState())
    val uiState: StateFlow<HomeUiState> = _uiState.asStateFlow()

    init {
        observePlayerAndDownloads()
        loadRecentSearches()
        loadNewReleases()
    }

    private fun observePlayerAndDownloads() {
        viewModelScope.launch {
            try {
                combine(
                    musicPlayer.recentlyPlayed,
                    downloadRepository.completedDownloads
                ) { recent, downloaded ->
                    recent to downloaded
                }.collect { (recent, downloaded) ->
                    val current = _uiState.value
                    if (current.recentlyPlayed != recent || current.recentlyDownloaded != downloaded) {
                        _uiState.value = current.copy(
                            recentlyPlayed = recent,
                            recentlyDownloaded = downloaded,
                            error = null,
                            isLoading = false
                        )
                    }
                }
            } catch (_: Exception) {
                _uiState.value = _uiState.value.copy(isLoading = false)
            }
        }
    }

    private fun loadRecentSearches() {
        viewModelScope.launch {
            try {
                val recent = searchHistoryDao.getRecentQueries()
                val safe = recent.filterNotNull().take(10).distinct()
                _uiState.value = _uiState.value.copy(recentSearches = safe)

                val keywords = safe.flatMap { it.split(Regex("\\s+")) }
                    .filter { it.length > 3 }
                    .distinct()
                    .shuffled()
                    .take(5)
                loadRecommendations(keywords)
            } catch (_: Exception) {
                _uiState.value = _uiState.value.copy(isLoading = false, error = "Failed to load data")
            }
        }
    }

    private suspend fun loadRecommendations(keywords: List<String>) {
        if (keywords.isEmpty()) {
            _uiState.value = _uiState.value.copy(isLoading = false)
            return
        }
        val allTracks = mutableListOf<Track>()
        val seen = mutableSetOf<String>()
        coroutineScope {
            val deferreds = keywords.take(3).map { keyword ->
                async {
                    try {
                        searchRepository.searchYouTubeOnly(keyword).map { it.track }
                            .filter { it.artworkUrl != null }
                    } catch (_: Exception) { emptyList() }
                }
            }
            for (deferred in deferreds) {
                for (t in deferred.await()) {
                    if (t.id !in seen) {
                        seen.add(t.id)
                        allTracks.add(t)
                        if (allTracks.size >= 12) break
                    }
                }
                if (allTracks.size >= 12) break
            }
        }
        _uiState.value = _uiState.value.copy(
            recommendations = allTracks,
            isLoading = false
        )
    }

    suspend fun resolveAudioUrl(track: Track): Pair<String, String>? {
        return searchRepository.findBestAudioForTrack(track)
    }

    private fun loadNewReleases() {
        viewModelScope.launch {
            try {
                val year = Calendar.getInstance().get(Calendar.YEAR)
                val results = withContext(Dispatchers.IO) {
                    searchRepository.searchYouTubeOnly("new music releases $year")
                }
                val tracks = results.map { it.track }.filter { it.artworkUrl != null }.take(10)
                _uiState.value = _uiState.value.copy(newReleases = tracks)
            } catch (_: Exception) {}
        }
    }

    fun refresh() {
        _uiState.value = _uiState.value.copy(error = null, isLoading = true)
        loadRecentSearches()
    }

    class Factory : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            val container = SincApp.instance.container
            return HomeViewModel(
                container.database.searchHistoryDao(),
                container.searchRepository,
                container.musicPlayer,
                container.downloadRepository
            ) as T
        }
    }
}
