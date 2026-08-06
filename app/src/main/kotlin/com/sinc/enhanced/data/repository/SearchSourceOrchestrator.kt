package com.sinc.enhanced.data.repository

import android.util.Log
import com.sinc.enhanced.data.local.SettingsManager
import com.sinc.enhanced.data.util.retry.CircuitBreaker
import com.sinc.enhanced.data.util.retry.RetryPolicy
import com.sinc.enhanced.data.util.retry.retryCall
import com.sinc.enhanced.domain.music.SearchResult
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.withContext

class SearchSourceOrchestrator(
    private val sources: List<SearchSource>,
    private val settingsManager: SettingsManager
) {

    companion object {
        const val MIN_RESULTS = 5
    }

    private val breaker = CircuitBreaker()

    // Source priorities: 1-2 primary (Spotify, Deezer), 3 secondary (Piped),
    // 4+ fallbacks (SoundCloud, Audius, Jamendo, FMA, Bandcamp)
    private suspend fun sourcesInRange(minPriority: Int, maxPriority: Int): List<SearchSource> =
        sources.filter { it.priority in minPriority..maxPriority && it.isEnabled(settingsManager) }
            .sortedBy { it.priority }

    private suspend fun searchTier(minPriority: Int, maxPriority: Int, query: String): List<SearchResult> = coroutineScope {
        sourcesInRange(minPriority, maxPriority).map { source ->
            async(Dispatchers.IO) {
                try {
                    retryCall(
                        key = source.name,
                        policy = RetryPolicy(timeoutMs = 12000),
                        breaker = breaker,
                        label = "search_${source.name}"
                    ) { source.search(query) }.orEmpty()
                } catch (e: Exception) {
                    Log.w("SearchSourceOrchestrator", "Search failed for source '${source.name}' query '$query'", e)
                    emptyList()
                }
            }
        }.awaitAll().flatten()
    }

    suspend fun searchAll(query: String): List<SearchResult> {
        val normalized = query.trim()
        if (normalized.isEmpty()) return emptyList()

        val collected = mutableListOf<SearchResult>()

        // Primary sources (Spotify, Deezer) always run
        collected.addAll(searchTier(1, 2, normalized))
        // Secondary sources (Piped) only when primary results are thin
        if (collected.size < MIN_RESULTS) {
            collected.addAll(searchTier(3, 3, normalized))
        }
        // Fallback sources only when everything above came up short
        if (collected.size < MIN_RESULTS) {
            collected.addAll(searchTier(4, Int.MAX_VALUE, normalized))
        }

        val seenIds = mutableSetOf<String>()
        val seenTitleArtist = mutableSetOf<String>()
        val deduped = collected.filter { result ->
            val idKey = result.track.id
            if (idKey in seenIds) return@filter false
            val taKey = "${result.track.title.lowercase().trim()}|${result.track.artist.lowercase().trim()}"
            if (taKey in seenTitleArtist) return@filter false
            seenIds.add(idKey)
            seenTitleArtist.add(taKey)
            true
        }

        return deduped.sortedByDescending { it.confidence }
    }

    fun searchAllStreaming(query: String): Flow<List<SearchResult>> = flow {
        emit(searchAll(query))
    }

    suspend fun isSourceEnabled(name: String): Boolean =
        sources.any { it.name == name && it.isEnabled(settingsManager) }
}
