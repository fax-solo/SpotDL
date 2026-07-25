package com.sinc.enhanced.data.local.dao

import androidx.room.*
import com.sinc.enhanced.data.local.entity.DownloadEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface DownloadDao {
    @Query("SELECT * FROM downloads ORDER BY addedAt DESC")
    fun getAllDownloads(): Flow<List<DownloadEntity>>

    @Query("SELECT * FROM downloads WHERE status = :status ORDER BY addedAt DESC")
    fun getDownloadsByStatus(status: String): Flow<List<DownloadEntity>>

    @Query("SELECT * FROM downloads WHERE status = 'completed' ORDER BY completedAt DESC")
    fun getCompletedDownloads(): Flow<List<DownloadEntity>>

    @Query("SELECT * FROM downloads WHERE trackId = :trackId")
    suspend fun getDownload(trackId: String): DownloadEntity?

    @Query("SELECT * FROM downloads WHERE status = 'downloading' OR status = 'queued'")
    fun getActiveDownloads(): Flow<List<DownloadEntity>>

    @Query("SELECT COUNT(*) FROM downloads WHERE status = 'completed'")
    suspend fun totalCompleted(): Int

    @Query("SELECT COUNT(*) FROM downloads WHERE status = 'completed' AND completedAt >= :since")
    suspend fun completedSince(since: Long): Int

    @Query("SELECT source, COUNT(*) as count FROM downloads WHERE status = 'completed' GROUP BY source ORDER BY count DESC")
    suspend fun completedBySource(): List<SourceCount>

    data class SourceCount(val source: String, val count: Int)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(download: DownloadEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertBatch(downloads: List<DownloadEntity>)

    @Query("UPDATE downloads SET status = :status, progress = :progress WHERE trackId = :trackId")
    suspend fun updateStatus(trackId: String, status: String, progress: Float = 0f)

    @Query("UPDATE downloads SET isPaused = :isPaused WHERE trackId = :trackId")
    suspend fun updateIsPaused(trackId: String, isPaused: Boolean)

    @Query("UPDATE downloads SET filePath = :filePath, fileSize = :fileSize, status = 'completed', completedAt = :completedAt, source = :source WHERE trackId = :trackId")
    suspend fun markComplete(trackId: String, filePath: String, fileSize: Long, source: String, completedAt: Long = System.currentTimeMillis())

    @Query("UPDATE downloads SET status = 'error', errorMessage = :error WHERE trackId = :trackId")
    suspend fun markError(trackId: String, error: String)

    @Query("UPDATE downloads SET progress = :progress, downloadSpeed = :speed WHERE trackId = :trackId")
    suspend fun updateProgress(trackId: String, progress: Float, speed: Float)

    @Query("DELETE FROM downloads WHERE trackId = :trackId")
    suspend fun delete(trackId: String)

    @Query("DELETE FROM downloads")
    suspend fun deleteAll()

    @Query("DELETE FROM downloads WHERE status = 'completed'")
    suspend fun deleteCompleted()
}