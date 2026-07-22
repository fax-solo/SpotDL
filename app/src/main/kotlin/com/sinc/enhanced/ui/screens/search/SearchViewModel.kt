package com.sinc.enhanced.ui.screens.search

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.sinc.enhanced.SincApp
import com.sinc.enhanced.data.local.dao.SearchHistoryDao
import com.sinc.enhanced.data.local.entity.SearchHistoryEntity
import com.sinc.enhanced.data.model.Album
import com.sinc.enhanced.data.model.Artist
import com.sinc.enhanced.data.model.Track
import com.sinc.enhanced.data.repository.QueryType
import com.sinc.enhanced.data.repository.SearchRepository
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

private const val PAGE_SIZE = 20

data class SearchUiState(
    val query: String = "",
    val queryType: QueryType = QueryType.GENERIC,
    val results: List<SearchRepository.EnrichedTrack> = emptyList(),
    val artists: List<Artist> = emptyList(),
    val albums: List<Album> = emptyList(),
    val selectedAlbum: Album? = null,
    val albumTracks: List<Track> = emptyList(),
    val isSearching: Boolean = false,
    val isLoadingMore: Boolean = false,
    val hasMore: Boolean = false,
    val error: String? = null
)

class SearchViewModel(
    private val searchRepository: SearchRepository,
    private val searchHistoryDao: SearchHistoryDao
) : ViewModel() {

    private val _uiState = MutableStateFlow(SearchUiState())
    val uiState: StateFlow<SearchUiState> = _uiState.asStateFlow()

    private var searchJob: Job? = null
    private var allResults: List<SearchRepository.EnrichedTrack> = emptyList()

    fun onQueryChange(query: String) {
        _uiState.value = _uiState.value.copy(query = query)
        searchJob?.cancel()
        if (query.isBlank()) {
            _uiState.value = SearchUiState()
            return
        }
        searchJob = viewModelScope.launch {
            delay(500)
            performSearch(query)
        }
    }

    fun onSearch(query: String) {
        searchJob?.cancel()
        _uiState.value = _uiState.value.copy(query = query)
        if (query.isNotBlank()) {
            viewModelScope.launch { performSearch(query) }
        }
    }

    fun loadMore() {
        val state = _uiState.value
        if (state.isLoadingMore || !state.hasMore) return
        _uiState.value = state.copy(isLoadingMore = true)

        val currentCount = state.results.size
        val nextCount = minOf(currentCount + PAGE_SIZE, allResults.size)
        val newResults = allResults.take(nextCount)

        _uiState.value = _uiState.value.copy(
            results = newResults,
            isLoadingMore = false,
            hasMore = nextCount < allResults.size
        )
    }

    fun selectAlbum(album: Album) {
        viewModelScope.launch {
            val albumWithTracks = searchRepository.getAlbum(album.id)
            _uiState.value = _uiState.value.copy(
                selectedAlbum = albumWithTracks ?: album,
                albumTracks = albumWithTracks?.tracks ?: emptyList()
            )
        }
    }

    fun dismissAlbum() {
        _uiState.value = _uiState.value.copy(selectedAlbum = null, albumTracks = emptyList())
    }

    private suspend fun performSearch(query: String) {
        _uiState.value = _uiState.value.copy(isSearching = true, error = null)
        try {
            val queryType = searchRepository.classifyQuery(query)
            searchHistoryDao.insert(SearchHistoryEntity(query = query, resultType = queryType.name.lowercase()))
            allResults = searchRepository.searchAll(query)
            val albums = searchRepository.searchAlbums(query)
            val artists = if (queryType == QueryType.ARTIST) {
                searchRepository.searchArtists(query)
            } else emptyList()

            val initialCount = minOf(PAGE_SIZE, allResults.size)
            _uiState.value = _uiState.value.copy(
                queryType = queryType,
                results = allResults.take(initialCount),
                artists = artists,
                albums = albums,
                isSearching = false,
                hasMore = initialCount < allResults.size
            )
        } catch (e: Exception) {
            _uiState.value = _uiState.value.copy(
                isSearching = false,
                error = e.message ?: "Search failed"
            )
        }
    }

    class Factory : ViewModelProvider.Factory {
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            @Suppress("UNCHECKED_CAST")
            return SearchViewModel(
                SincApp.instance.container.searchRepository,
                SincApp.instance.container.database.searchHistoryDao()
            ) as T
        }
    }
}
