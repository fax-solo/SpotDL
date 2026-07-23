package com.sinc.enhanced.domain.repository

import com.sinc.enhanced.data.local.entity.PlaylistEntity
import com.sinc.enhanced.data.local.entity.PlaylistTrackEntity
import com.sinc.enhanced.data.model.Track
import kotlinx.coroutines.flow.Flow

interface PlaylistRepository {
    val allPlaylists: Flow<List<PlaylistEntity>>
    suspend fun create(name: String, description: String = ""): Int
    suspend fun get(id: Int): PlaylistEntity?
    suspend fun getTracks(playlistId: Int): List<PlaylistTrackEntity>
    fun getTracksFlow(playlistId: Int): Flow<List<PlaylistTrackEntity>>
    suspend fun update(playlist: PlaylistEntity)
    suspend fun addTrack(playlistId: Int, track: Track, filePath: String? = null)
    suspend fun removeTrack(playlistId: Int, trackId: String)
    suspend fun delete(id: Int)
    suspend fun rename(id: Int, name: String)
}
