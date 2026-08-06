package com.sinc.enhanced.data.repository

import com.sinc.enhanced.data.local.SettingsManager
import com.sinc.enhanced.data.model.Track
import com.sinc.enhanced.data.remote.BandcampClient
import com.sinc.enhanced.domain.music.SearchResult
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.withContext

class BandcampSearchSource(
    private val bandcampClient: BandcampClient
) : SearchSource {
    override val name = "bandcamp"
    override val priority = 8
    
    override suspend fun search(query: String): List<SearchResult> {
        val results = bandcampClient.search(query, limit = 5) ?: return emptyList()
        return results.map { bc ->
            val track = Track(
                id = "bc_${bc.id}",
                title = bc.title,
                artist = bc.artist,
                album = bc.album ?: bc.artist,
                durationMs = (bc.duration ?: 0L) * 1000,
                artworkUrl = bc.artworkUrl,
                source = "bandcamp"
            )
            SearchResult(
                track = track,
                audioUrl = null, // Requires separate stream fetch
                audioSource = name,
                confidence = 0.5f
            )
        }
    }
    
    override fun searchStreaming(query: String): Flow<List<SearchResult>> = flow {
        val results = bandcampClient.search(query, limit = 5) ?: emptyList()
        emit(results.map { bc ->
            val track = Track(
                id = "bc_${bc.id}",
                title = bc.title,
                artist = bc.artist,
                album = bc.album ?: bc.artist,
                durationMs = (bc.duration ?: 0L) * 1000,
                artworkUrl = bc.artworkUrl,
                source = "bandcamp"
            )
            SearchResult(
                track = track,
                audioUrl = null,
                audioSource = name,
                confidence = 0.5f
            )
        })
    }
    
    override suspend fun isEnabled(settingsManager: SettingsManager): Boolean = settingsManager.bandcampEnabled.first()
}