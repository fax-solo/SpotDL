package com.sinc.enhanced.data.repository

import com.sinc.enhanced.data.local.SettingsManager
import com.sinc.enhanced.data.model.Track
import com.sinc.enhanced.data.remote.FreeMusicArchiveClient
import com.sinc.enhanced.domain.music.SearchResult
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flow

class FmaSearchSource(
    private val fmaClient: FreeMusicArchiveClient
) : SearchSource {
    override val name = "fma"
    override val priority = 7
    
    override suspend fun search(query: String): List<SearchResult> {
        val results = fmaClient.search(query, limit = 5) ?: return emptyList()
        return results.mapNotNull { f ->
            if (f.audioUrl == null) return@mapNotNull null
            val track = Track(
                id = "fma_${f.id}",
                title = f.title,
                artist = f.artist,
                album = f.album ?: f.artist,
                durationMs = f.duration * 1000,
                artworkUrl = f.artworkUrl,
                source = "fma"
            )
            SearchResult(
                track = track,
                audioUrl = f.audioUrl,
                audioSource = name,
                confidence = 0.8f
            )
        }
    }
    
    override fun searchStreaming(query: String): Flow<List<SearchResult>> = flow {
        val results = fmaClient.search(query, limit = 5) ?: emptyList()
        emit(results.mapNotNull { f ->
            if (f.audioUrl == null) return@mapNotNull null
            val track = Track(
                id = "fma_${f.id}",
                title = f.title,
                artist = f.artist,
                album = f.album ?: f.artist,
                durationMs = f.duration * 1000,
                artworkUrl = f.artworkUrl,
                source = "fma"
            )
            SearchResult(
                track = track,
                audioUrl = f.audioUrl,
                audioSource = name,
                confidence = 0.8f
            )
        })
    }
    
    override suspend fun isEnabled(settingsManager: SettingsManager): Boolean = settingsManager.fmaEnabled.first()
}