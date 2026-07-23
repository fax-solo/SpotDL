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
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

data class HomeUiState(
    val recentSearches: List<String> = emptyList(),
    val recommendations: List<Track> = emptyList(),
    val recentlyPlayed: List<Track> = emptyList(),
    val recentlyDownloaded: List<DownloadEntity> = emptyList(),
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
        viewModelScope.launch {
            combine(
                musicPlayer.recentlyPlayed,
                downloadRepository.completedDownloads
            ) { recent, downloaded ->
                recent to downloaded
            }.collect { (recent, downloaded) ->
                val current = _uiState.value
                _uiState.value = current.copy(
                    recentlyPlayed = recent,
                    recentlyDownloaded = downloaded,
                    error = null,
                    isLoading = false
                )
            }
        }
        loadRecentSearches()
    }

    private fun loadRecentSearches() {
        viewModelScope.launch {
            try {
                val recent = searchHistoryDao.getRecentQueries()
                val keywords = recent.flatMap { it.split(Regex("\\s+")) }
                    .filter { it.length > 3 }
                    .distinct()
                    .shuffled()
                    .take(5)
                _uiState.value = _uiState.value.copy(
                    recentSearches = recent.take(10)
                )
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
        for (keyword in keywords.take(3)) {
            try {
                val results = searchRepository.searchYouTubeOnly(keyword)
                for (enriched in results) {
                    val t = enriched.track
                    if (t.id !in seen && t.artworkUrl != null) {
                        seen.add(t.id)
                        allTracks.add(t)
                        if (allTracks.size >= 12) break
                    }
                }
            } catch (_: Exception) {}
            if (allTracks.size >= 12) break
        }
        _uiState.value = _uiState.value.copy(
            recommendations = allTracks,
            isLoading = false
        )
    }

    suspend fun resolveAudioUrl(track: Track): Pair<String, String>? {
        return withContext(Dispatchers.IO) {
            searchRepository.findBestAudioForTrack(track)
        }
    }

    fun refresh() {
        _uiState.value = _uiState.value.copy(error = null)
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
