package com.sinc.enhanced.data.repository

import com.sinc.enhanced.data.local.SettingsManager
import com.sinc.enhanced.data.model.Track
import com.sinc.enhanced.data.remote.AudiusClient
import com.sinc.enhanced.domain.music.SearchResult
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flow

class AudiusSearchSource(
    private val audiusClient: AudiusClient
) : SearchSource {
    override val name = "audius"
    override val priority = 5
    
    override suspend fun search(query: String): List<SearchResult> {
        val results = audiusClient.search(query, limit = 5) ?: return emptyList()
        return results.mapNotNull { a ->
            if (a.streamUrl == null) return@mapNotNull null
            val track = Track(
                id = "aud_${a.id}",
                title = a.title,
                artist = a.artist,
                album = a.artist,
                durationMs = a.duration * 1000,
                artworkUrl = a.artworkUrl,
                source = "audius"
            )
            SearchResult(
                track = track,
                audioUrl = a.streamUrl,
                audioSource = name,
                confidence = 0.8f
            )
        }
    }
    
    override fun searchStreaming(query: String): Flow<List<SearchResult>> = flow {
        val results = audiusClient.search(query, limit = 5) ?: emptyList()
        emit(results.mapNotNull { a ->
            if (a.streamUrl == null) return@mapNotNull null
            val track = Track(
                id = "aud_${a.id}",
                title = a.title,
                artist = a.artist,
                album = a.artist,
                durationMs = a.duration * 1000,
                artworkUrl = a.artworkUrl,
                source = "audius"
            )
            SearchResult(
                track = track,
                audioUrl = a.streamUrl,
                audioSource = name,
                confidence = 0.8f
            )
        })
    }
    
    override suspend fun isEnabled(settingsManager: SettingsManager): Boolean = settingsManager.audiusEnabled.first()
}