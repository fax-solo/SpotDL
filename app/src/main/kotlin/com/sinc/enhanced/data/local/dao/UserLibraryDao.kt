package com.sinc.enhanced.data.local.dao

import androidx.room.*
import com.sinc.enhanced.data.local.entity.LikedTrackEntity
import com.sinc.enhanced.data.local.entity.PlaylistEntity
import com.sinc.enhanced.data.local.entity.PlaylistTrackEntity
import com.sinc.enhanced.data.local.entity.HistoryEntity
import com.sinc.enhanced.data.local.entity.SavedTrackEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface UserLibraryDao {

    // Liked tracks
    @Query("SELECT * FROM liked_tracks ORDER BY addedAt DESC")
    fun getAllLikedTracks(): Flow<List<LikedTrackEntity>>

    @Query("SELECT COUNT(*) FROM liked_tracks")
    suspend fun getLikedCount(): Int

    @Query("SELECT EXISTS(SELECT 1 FROM liked_tracks WHERE trackId = :trackId LIMIT 1)")
    suspend fun isTrackLiked(trackId: String): Boolean

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertLikedTrack(track: LikedTrackEntity)

    @Query("DELETE FROM liked_tracks WHERE trackId = :trackId")
    suspend fun removeLikedTrack(trackId: String)

    @Query("DELETE FROM liked_tracks")
    suspend fun clearAllLikedTracks()

    // Recently played
    @Query("SELECT * FROM history ORDER BY playedAt DESC LIMIT 50")
    suspend fun getRecentlyPlayed(): List<HistoryEntity>

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insertHistory(entity: HistoryEntity)

    // Save/unsave track (for library)
    @Query("SELECT EXISTS(SELECT 1 FROM saved_tracks WHERE trackId = :trackId LIMIT 1)")
    suspend fun isTrackSaved(trackId: String): Boolean

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun saveTrack(track: SavedTrackEntity)

    @Query("DELETE FROM saved_tracks WHERE trackId = :trackId")
    suspend fun unsaveTrack(trackId: String)

    @Query("SELECT * FROM saved_tracks ORDER BY addedAt DESC")
    fun getAllSavedTracks(): Flow<List<SavedTrackEntity>>

    @Query("SELECT COUNT(*) FROM saved_tracks")
    suspend fun getSavedCount(): Int
}