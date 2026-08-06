package com.sinc.enhanced.data.repository

import com.sinc.enhanced.data.local.SettingsManager
import com.sinc.enhanced.data.model.Track
import com.sinc.enhanced.data.remote.SoundCloudClient
import com.sinc.enhanced.domain.music.SearchResult
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.withContext

class SoundCloudSearchSource(
    private val soundCloudClient: SoundCloudClient
) : SearchSource {
    override val name = "soundcloud"
    override val priority = 4
    
    override suspend fun search(query: String): List<SearchResult> {
        val results = soundCloudClient.search(query, limit = 5) ?: return emptyList()
        return results.map { sc ->
            val track = Track(
                id = "sc_${sc.trackId}",
                title = sc.title,
                artist = sc.uploader,
                album = sc.uploader,
                durationMs = sc.duration * 1000,
                artworkUrl = sc.thumbnailUrl,
                source = "soundcloud"
            )
            SearchResult(
                track = track,
                audioUrl = null, // Requires separate stream fetch
                audioSource = name,
                confidence = 0.6f
            )
        }
    }
    
    override fun searchStreaming(query: String): Flow<List<SearchResult>> = flow {
        val results = soundCloudClient.search(query, limit = 5) ?: emptyList()
        emit(results.map { sc ->
            val track = Track(
                id = "sc_${sc.trackId}",
                title = sc.title,
                artist = sc.uploader,
                album = sc.uploader,
                durationMs = sc.duration * 1000,
                artworkUrl = sc.thumbnailUrl,
                source = "soundcloud"
            )
            SearchResult(
                track = track,
                audioUrl = null,
                audioSource = name,
                confidence = 0.6f
            )
        })
    }
    
    override suspend fun isEnabled(settingsManager: SettingsManager): Boolean = true
}