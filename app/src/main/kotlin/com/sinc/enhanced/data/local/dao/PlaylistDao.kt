package com.sinc.enhanced.data.local.dao

import androidx.room.*
import com.sinc.enhanced.data.local.entity.PlaylistEntity
import com.sinc.enhanced.data.local.entity.PlaylistTrackEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface PlaylistDao {
    @Query("SELECT * FROM playlists ORDER BY updatedAt DESC")
    fun getAllPlaylists(): Flow<List<PlaylistEntity>>

    @Query("SELECT * FROM playlists WHERE id = :id")
    suspend fun getPlaylist(id: Int): PlaylistEntity?

    @Query("SELECT * FROM playlist_tracks WHERE playlistId = :playlistId ORDER BY position ASC")
    suspend fun getPlaylistTracks(playlistId: Int): List<PlaylistTrackEntity>

    @Query("SELECT * FROM playlist_tracks WHERE playlistId = :playlistId ORDER BY position ASC")
    fun getPlaylistTracksFlow(playlistId: Int): Flow<List<PlaylistTrackEntity>>

    @Query("SELECT pt.* FROM playlist_tracks pt INNER JOIN playlists p ON p.id = pt.playlistId WHERE pt.trackId = :trackId")
    suspend fun getPlaylistsContainingTrack(trackId: String): List<PlaylistTrackEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertPlaylist(playlist: PlaylistEntity): Long

    @Update
    suspend fun updatePlaylist(playlist: PlaylistEntity)

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun addTrack(track: PlaylistTrackEntity)

    @Query("DELETE FROM playlist_tracks WHERE id = :id")
    suspend fun removeTrack(id: Int)

    @Query("DELETE FROM playlist_tracks WHERE playlistId = :playlistId AND trackId = :trackId")
    suspend fun removeTrackByKey(playlistId: Int, trackId: String)

    @Query("UPDATE playlist_tracks SET position = :position WHERE id = :id")
    suspend fun updateTrackPosition(id: Int, position: Int)

    @Query("UPDATE playlist_tracks SET position = :position WHERE playlistId = :playlistId AND trackId = :trackId")
    suspend fun setTrackPosition(playlistId: Int, trackId: String, position: Int)

    @Query("SELECT COALESCE(MAX(position), -1) + 1 FROM playlist_tracks WHERE playlistId = :playlistId")
    suspend fun nextPosition(playlistId: Int): Int

    @Query("SELECT COUNT(*) FROM playlist_tracks WHERE playlistId = :playlistId")
    suspend fun trackCount(playlistId: Int): Int

    @Query("UPDATE playlists SET trackCount = (SELECT COUNT(*) FROM playlist_tracks WHERE playlistId = :playlistId), updatedAt = :now WHERE id = :playlistId")
    suspend fun updateTrackCount(playlistId: Int, now: Long = System.currentTimeMillis())

    @Transaction
    suspend fun addTrackAndUpdateCount(track: PlaylistTrackEntity) {
        addTrack(track)
        updateTrackCount(track.playlistId)
    }

    @Query("DELETE FROM playlists WHERE id = :id")
    suspend fun deletePlaylist(id: Int)

    @Query("DELETE FROM playlists")
    suspend fun deleteAll()

    @Transaction
    suspend fun reorderTracks(playlistId: Int, trackIds: List<String>) {
        val tracks = getPlaylistTracks(playlistId)
        tracks.forEach { entity: PlaylistTrackEntity ->
            val newPos = trackIds.indexOf(entity.trackId)
            if (newPos >= 0 && newPos != entity.position) {
                setTrackPosition(playlistId, entity.trackId, newPos)
            }
        }
    }

    // New methods for reordering
    @Transaction
    suspend fun reorderByIndices(tracks: List<PlaylistTrackEntity>) {
        tracks.forEachIndexed { index, t ->
            setTrackPosition(t.playlistId, t.trackId, index)
        }
    }

    @Query("UPDATE playlist_tracks SET position = :newPosition WHERE id = :id")
    suspend fun updatePosition(id: Int, newPosition: Int)

    @Query("SELECT * FROM playlist_tracks WHERE playlistId = :playlistId ORDER BY position ASC")
    fun getPlaylistTracksForReorder(playlistId: Int): Flow<List<PlaylistTrackEntity>>
}