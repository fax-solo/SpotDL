package com.sinc.enhanced.ui.screens.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.sinc.enhanced.SincApp
import com.sinc.enhanced.data.local.dao.SearchHistoryDao
import com.sinc.enhanced.data.local.entity.DownloadEntity
import com.sinc.enhanced.data.model.Track
import com.sinc.enhanced.data.recommendation.RecommendationEngine
import com.sinc.enhanced.data.recommendation.RecommendedPlaylist
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
    val recommendedPlaylists: List<RecommendedPlaylist> = emptyList(),
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
    private val downloadRepository: DownloadRepository,
    private val recommendationEngine: RecommendationEngine
) : ViewModel() {

    private val _uiState = MutableStateFlow(HomeUiState())
    val uiState: StateFlow<HomeUiState> = _uiState.asStateFlow()

    init {
        observePlayerAndDownloads()
        loadHomeContent()
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

    private fun loadHomeContent() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, error = null)
            try {
                val recentSearches = searchHistoryDao.getRecentQueries().filterNotNull().take(10).distinct()
                val playlists = withContext(Dispatchers.Default) {
                    recommendationEngine.generateHomePlaylists()
                }
                _uiState.value = _uiState.value.copy(
                    recentSearches = recentSearches,
                    recommendedPlaylists = playlists,
                    error = null,
                    isLoading = false
                )
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(
                    error = "Could not load recommendations",
                    isLoading = false
                )
            }
        }
    }

    suspend fun resolveAudioUrl(track: Track): Pair<String, String>? {
        return searchRepository.findBestAudioForTrack(track)
    }

    fun refresh() {
        _uiState.value = _uiState.value.copy(error = null, isLoading = true)
        loadHomeContent()
    }

    class Factory : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            val container = SincApp.instance.container
            return HomeViewModel(
                container.database.searchHistoryDao(),
                container.searchRepository,
                container.musicPlayer,
                container.downloadRepository,
                container.recommendationEngine
            ) as T
        }
    }
}
