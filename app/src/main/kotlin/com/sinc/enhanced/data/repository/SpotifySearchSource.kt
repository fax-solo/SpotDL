package com.sinc.enhanced.data.repository

import com.sinc.enhanced.data.local.SettingsManager
import com.sinc.enhanced.data.model.Track
import com.sinc.enhanced.data.remote.SpotifyClient
import com.sinc.enhanced.domain.music.SearchResult
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow

class SpotifySearchSource(
    private val spotifyClient: SpotifyClient
) : SearchSource {
    override val name = "spotify"
    override val priority = 1
    
    override suspend fun search(query: String): List<SearchResult> {
        val tracks = spotifyClient.searchTracks(query, limit = 20)
        return tracks.map { track ->
            SearchResult(
                track = track,
                audioUrl = track.previewUrl,
                audioSource = name,
                confidence = 1.0f
            )
        }
    }
    
    override fun searchStreaming(query: String): Flow<List<SearchResult>> = flow {
        val tracks = spotifyClient.searchTracks(query, limit = 20)
        emit(tracks.map { track ->
            SearchResult(
                track = track,
                audioUrl = track.previewUrl,
                audioSource = name,
                confidence = 1.0f
            )
        })
    }
    
    override suspend fun isEnabled(settingsManager: SettingsManager): Boolean = true
}