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
import com.sinc.enhanced.data.util.SearchCache
import com.sinc.enhanced.domain.music.SearchResult
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.launch

private const val PAGE_SIZE = 20

data class SearchUiState(
    val query: String = "",
    val queryType: QueryType = QueryType.GENERIC,
    val results: List<SearchResult> = emptyList(),
    val artists: List<Artist> = emptyList(),
    val albums: List<Album> = emptyList(),
    val topResult: SearchResult? = null,
    val expandedAlbum: Album? = null,
    val albumTracks: List<Track> = emptyList(),
    val albumAudioUrls: Map<String, String> = emptyMap(),
    val isSearching: Boolean = false,
    val isLoadingMore: Boolean = false,
    val hasMore: Boolean = false,
    val error: String? = null,
    val resolvedAudioUrls: Map<String, Pair<String, String>> = emptyMap()
)

class SearchViewModel(
    private val searchRepository: SearchRepository,
    private val searchHistoryDao: SearchHistoryDao,
    private val initialQuery: String = ""
) : ViewModel() {
    init {
        if (initialQuery.isNotBlank()) {
            onSearch(initialQuery)
        }
    }

    private val _uiState = MutableStateFlow(SearchUiState())
    val uiState: StateFlow<SearchUiState> = _uiState.asStateFlow()

    private var searchJob: Job? = null
    private var allResults: List<SearchResult> = emptyList()
    private var allAlbums: List<Album> = emptyList()
    private val searchResultCache = SearchCache<SearchResult>()
    private val albumAudioCache = mutableMapOf<String, Pair<List<Track>, Map<String, String>>>()
    private val seenHistoryQueries = mutableSetOf<String>()

    init {
        viewModelScope.launch {
            SincApp.instance.container.connectivityMonitor.networkState
                .distinctUntilChanged()
                .collect { online ->
                    if (online) {
                        searchRepository.invalidateCache()
                        searchResultCache.invalidateAll()
                    }
                }
        }
    }

    fun onQueryChange(query: String) {
        _uiState.value = _uiState.value.copy(query = query)
        searchJob?.cancel()
        if (query.isBlank()) {
            _uiState.value = SearchUiState()
            return
        }
        searchJob = viewModelScope.launch {
            delay(300)
            searchRepository.searchAllStreaming(query).collectLatest { streamingResults ->
                if (streamingResults.isNotEmpty() && _uiState.value.isSearching) {
                    val grouped = streamingResults
                    val topResult = pickTopResult(query, grouped)
                    _uiState.value = _uiState.value.copy(
                        results = grouped.take(PAGE_SIZE),
                        topResult = topResult,
                        hasMore = grouped.size > PAGE_SIZE,
                        isSearching = false
                    )
                }
            }
            performSearch(query)
        }
    }

    fun onSearch(query: String) {
        searchJob?.cancel()
        _uiState.value = _uiState.value.copy(query = query)
        if (query.isNotBlank()) {
            searchJob = viewModelScope.launch { performSearch(query) }
        }
    }

    fun loadMore() {
        val state = _uiState.value
        if (state.isLoadingMore || !state.hasMore || state.isSearching) return
        _uiState.value = state.copy(isLoadingMore = true)

        val currentCount = state.results.size
        if (currentCount >= allResults.size) {
            _uiState.value = _uiState.value.copy(isLoadingMore = false, hasMore = false)
            return
        }
        val nextCount = minOf(currentCount + PAGE_SIZE, allResults.size)
        val newResults = allResults.take(nextCount)
        _uiState.value = _uiState.value.copy(
            results = newResults,
            isLoadingMore = false,
            hasMore = nextCount < allResults.size
        )
    }

    fun selectAlbum(album: Album) {
        if (_uiState.value.expandedAlbum?.id == album.id) {
            _uiState.value = _uiState.value.copy(expandedAlbum = null, albumTracks = emptyList())
            return
        }
        viewModelScope.launch {
            val cached = albumAudioCache[album.id]
            if (cached != null) {
                val (tracks, audioUrls) = cached
                _uiState.value = _uiState.value.copy(
                    expandedAlbum = album,
                    albumTracks = tracks,
                    albumAudioUrls = audioUrls
                )
                return@launch
            }
            val albumWithTracks = searchRepository.getAlbum(album.id)
            val tracks = albumWithTracks?.tracks ?: emptyList()
            val audioUrls = coroutineScope {
                tracks.map { track ->
                    async { track.id to searchRepository.findBestAudioForTrack(track) }
                }.mapNotNull { deferred ->
                    val (id, result) = deferred.await()
                    if (result != null) id to result.first else null
                }.toMap()
            }
            albumAudioCache[album.id] = tracks to audioUrls
            _uiState.value = _uiState.value.copy(
                expandedAlbum = albumWithTracks ?: album,
                albumTracks = tracks,
                albumAudioUrls = audioUrls
            )
        }
    }

    fun dismissAlbum() {
        _uiState.value = _uiState.value.copy(expandedAlbum = null, albumTracks = emptyList())
    }

    private fun pickTopResult(query: String, results: List<SearchResult>): SearchResult? {
        if (results.isEmpty()) return null
        val lowerQ = query.lowercase().trim()
        val qTokens = lowerQ.split(Regex("\\s+")).toSet()

        val scored = results.map { r ->
            val t = r.track
            var score = r.confidence * 10f
            val titleLower = t.title.lowercase()
            val artistLower = t.artist.lowercase()
            val combinedLower = "$titleLower $artistLower"

            if (combinedLower.contains(lowerQ)) score += 5f
            val tTokens = titleLower.split(Regex("\\s+")).toSet()
            val aTokens = artistLower.split(Regex("\\s+")).toSet()
            val matchCount = (qTokens intersect tTokens).size + (qTokens intersect aTokens).size
            score += matchCount * 2f

            if (t.source == "spotify") score += 1f

            r to score
        }
        return scored.maxByOrNull { it.second }?.first
    }

    private suspend fun performSearch(query: String) {
        val isOnline = SincApp.instance.container.connectivityMonitor.isOnline
        _uiState.value = _uiState.value.copy(isSearching = true, error = null, topResult = null)

        val cached = searchResultCache.get(query)
        if (cached != null && !isOnline) {
            val grouped = cached
            val topResult = pickTopResult(query, grouped)
            val initialCount = minOf(PAGE_SIZE, grouped.size)
            _uiState.value = _uiState.value.copy(
                results = grouped.take(initialCount),
                topResult = topResult,
                isSearching = false,
                hasMore = initialCount < grouped.size
            )
            return
        }

        try {
            val queryType = searchRepository.classifyQuery(query)
            if (seenHistoryQueries.add(query.lowercase().trim())) {
                searchHistoryDao.insert(SearchHistoryEntity(query = query, resultType = queryType.name.lowercase()))
            }
            allResults = searchRepository.searchAll(query)
            val albums = searchRepository.searchAlbums(query)
            allAlbums = albums
            val artists = if (queryType == QueryType.ARTIST) {
                searchRepository.searchArtists(query)
            } else emptyList()

            val spotifyResults = allResults.filter { it.track.source == "spotify" }
            val nonSpotifyResults = allResults.filter { it.track.source != "spotify" }
            val grouped = spotifyResults + nonSpotifyResults

            searchResultCache.put(query, grouped)

            if (!_uiState.value.isSearching) return

            val topResult = pickTopResult(query, grouped)

            val initialCount = minOf(PAGE_SIZE, grouped.size)
            _uiState.value = _uiState.value.copy(
                queryType = queryType,
                results = grouped.take(initialCount),
                artists = artists,
                albums = albums,
                topResult = topResult,
                isSearching = false,
                hasMore = initialCount < grouped.size
            )

        } catch (e: Exception) {
            if (!isOnline && cached != null) {
                val grouped = cached
                val topResult = pickTopResult(query, grouped)
                val initialCount = minOf(PAGE_SIZE, grouped.size)
                _uiState.value = _uiState.value.copy(
                    results = grouped.take(initialCount),
                    topResult = topResult,
                    isSearching = false,
                    hasMore = initialCount < grouped.size
                )
            } else {
                _uiState.value = _uiState.value.copy(
                    isSearching = false,
                    error = e.message ?: "Search failed"
                )
            }
        }
    }

    class Factory(private val initialQuery: String = "") : ViewModelProvider.Factory {
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            @Suppress("UNCHECKED_CAST")
            return SearchViewModel(
                SincApp.instance.container.searchRepository,
                SincApp.instance.container.database.searchHistoryDao(),
                initialQuery
            ) as T
        }
    }
}