package com.sinc.enhanced.domain.repository

import com.sinc.enhanced.data.local.entity.PlaylistEntity
import com.sinc.enhanced.data.local.entity.PlaylistTrackEntity
import com.sinc.enhanced.data.model.Track
import kotlinx.coroutines.flow.Flow

interface PlaylistRepository {
    val allPlaylists: Flow<List<PlaylistEntity>>
    suspend fun create(name: String, description: String = ""): String
    suspend fun get(id: String): PlaylistEntity?
    suspend fun getTracks(playlistId: String): List<PlaylistTrackEntity>
    fun getTracksFlow(playlistId: String): Flow<List<PlaylistTrackEntity>>
    suspend fun update(playlist: PlaylistEntity)
    suspend fun addTrack(playlistId: String, track: Track, filePath: String? = null)
    suspend fun removeTrack(playlistId: String, trackId: String)
    suspend fun delete(id: String)
    suspend fun rename(id: String, name: String)
    suspend fun reorderTracks(playlistId: String, trackIds: List<String>)
}
