package com.sinc.enhanced.data.repository

import com.sinc.enhanced.data.local.SettingsManager
import com.sinc.enhanced.data.model.Track
import com.sinc.enhanced.data.remote.JamendoClient
import com.sinc.enhanced.domain.music.SearchResult
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flow

class JamendoSearchSource(
    private val jamendoClient: JamendoClient
) : SearchSource {
    override val name = "jamendo"
    override val priority = 6
    
    override suspend fun search(query: String): List<SearchResult> {
        val results = jamendoClient.search(query, limit = 5) ?: return emptyList()
        return results.mapNotNull { j ->
            if (j.audioUrl == null) return@mapNotNull null
            val track = Track(
                id = "jam_${j.id}",
                title = j.title,
                artist = j.artist,
                album = j.album,
                durationMs = j.duration * 1000L,
                artworkUrl = j.artworkUrl,
                source = "jamendo"
            )
            SearchResult(
                track = track,
                audioUrl = j.audioUrl,
                audioSource = name,
                confidence = 0.8f
            )
        }
    }
    
    override fun searchStreaming(query: String): Flow<List<SearchResult>> = flow {
        val results = jamendoClient.search(query, limit = 5) ?: emptyList()
        emit(results.mapNotNull { j ->
            if (j.audioUrl == null) return@mapNotNull null
            val track = Track(
                id = "jam_${j.id}",
                title = j.title,
                artist = j.artist,
                album = j.album,
                durationMs = j.duration * 1000L,
                artworkUrl = j.artworkUrl,
                source = "jamendo"
            )
            SearchResult(
                track = track,
                audioUrl = j.audioUrl,
                audioSource = name,
                confidence = 0.8f
            )
        })
    }
    
    override suspend fun isEnabled(settingsManager: SettingsManager): Boolean = settingsManager.jamendoEnabled.first()
}