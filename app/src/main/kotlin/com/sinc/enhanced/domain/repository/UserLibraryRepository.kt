package com.sinc.enhanced.domain.repository

import com.sinc.enhanced.data.local.entity.HistoryEntity
import com.sinc.enhanced.data.local.entity.LikedTrackEntity
import com.sinc.enhanced.data.local.entity.PlaylistTrackEntity
import com.sinc.enhanced.data.local.entity.SavedTrackEntity
import com.sinc.enhanced.data.model.Track
import kotlinx.coroutines.flow.Flow

interface UserLibraryRepository {
    val allLikedTracks: Flow<List<LikedTrackEntity>>
    val allSavedTracks: Flow<List<SavedTrackEntity>>

    suspend fun isTrackLiked(trackId: String): Boolean
    suspend fun likeTrack(track: Track)
    suspend fun unlikeTrack(trackId: String)

    suspend fun isTrackSaved(trackId: String): Boolean
    suspend fun saveTrack(track: Track)
    suspend fun unsaveTrack(trackId: String)

    suspend fun addToRecentlyPlayed(track: Track)
    suspend fun getRecentlyPlayed(limit: Int = 50): List<HistoryEntity>

    suspend fun addTrackToPlaylist(playlistId: Int, track: Track, filePath: String?)
    suspend fun removeTrackFromPlaylist(playlistId: Int, trackId: String)
    suspend fun reorderPlaylistTracks(playlistId: Int, fromIndex: Int, toIndex: Int)
}