package com.sinc.enhanced.data.repository

import com.sinc.enhanced.data.local.SettingsManager
import com.sinc.enhanced.data.model.Track
import com.sinc.enhanced.data.remote.PipedClient
import com.sinc.enhanced.domain.music.SearchResult
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow

class PipedSearchSource(
    private val pipedClient: PipedClient
) : SearchSource {
    override val name = "piped"
    override val priority = 3
    
    override suspend fun search(query: String): List<SearchResult> {
        val results = pipedClient.search(query, limit = 10)
        return results.map { yt ->
            val track = Track(
                id = "yt_${yt.videoId}",
                title = yt.title,
                artist = yt.uploader,
                album = yt.uploader,
                durationMs = yt.duration * 1000,
                artworkUrl = yt.thumbnailUrl,
                source = "youtube"
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
        val results = pipedClient.search(query, limit = 10)
        emit(results.map { yt ->
            val track = Track(
                id = "yt_${yt.videoId}",
                title = yt.title,
                artist = yt.uploader,
                album = yt.uploader,
                durationMs = yt.duration * 1000,
                artworkUrl = yt.thumbnailUrl,
                source = "youtube"
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