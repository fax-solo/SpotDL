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

    @Query("SELECT * FROM liked_tracks WHERE trackId = :trackId")
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
    @Query("SELECT * FROM saved_tracks WHERE trackId = :trackId")
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

@Entity(tableName = "saved_tracks")
data class SavedTrackEntity(
    @PrimaryKey
    val trackId: String,
    val title: String,
    val artist: String,
    val album: String = "",
    val artworkUrl: String? = null,
    val durationMs: Long = 0,
    val source: String = "spotify",
    val filePath: String? = null,
    val addedAt: Long = System.currentTimeMillis()
)

@Entity(tableName = "history")
data class HistoryEntity(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0,
    val trackId: String,
    val title: String,
    val artist: String,
    val album: String = "",
    val artworkUrl: String? = null,
    val durationMs: Long = 0,
    val source: String = "spotify",
    val filePath: String? = null,
    val playedAt: Long = System.currentTimeMillis()
)