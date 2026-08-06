package com.sinc.enhanced.data.repository

import com.sinc.enhanced.data.local.SettingsManager
import com.sinc.enhanced.data.model.Track
import com.sinc.enhanced.data.remote.DeezerClient
import com.sinc.enhanced.domain.music.SearchResult
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow

class DeezerSearchSource(
    private val deezerClient: DeezerClient
) : SearchSource {
    override val name = "deezer"
    override val priority = 2
    
    override suspend fun search(query: String): List<SearchResult> {
        val results = deezerClient.searchTracks(query)
        return results.map { d ->
            val track = Track(
                id = "dz_${d.id}",
                title = d.title,
                artist = d.artist,
                album = d.album,
                durationMs = d.duration * 1000L,
                artworkUrl = d.artworkUrl,
                isrc = d.isrc,
                source = "deezer"
            )
            SearchResult(
                track = track,
                audioUrl = d.previewUrl,
                audioSource = name,
                confidence = 0.7f
            )
        }
    }
    
    override fun searchStreaming(query: String): Flow<List<SearchResult>> = flow {
        val results = deezerClient.searchTracks(query)
        emit(results.map { d ->
            val track = Track(
                id = "dz_${d.id}",
                title = d.title,
                artist = d.artist,
                album = d.album,
                durationMs = d.duration * 1000L,
                artworkUrl = d.artworkUrl,
                isrc = d.isrc,
                source = "deezer"
            )
            SearchResult(
                track = track,
                audioUrl = d.previewUrl,
                audioSource = name,
                confidence = 0.7f
            )
        })
    }
    
    override suspend fun isEnabled(settingsManager: SettingsManager): Boolean = true
}