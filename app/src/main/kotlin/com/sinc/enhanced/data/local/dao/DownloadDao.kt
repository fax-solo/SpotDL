package com.sinc.enhanced.data.local.dao

import androidx.room.*
import com.sinc.enhanced.data.local.entity.DownloadEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface DownloadDao {
    companion object {
        const val STATUS_DOWNLOADING = "downloading"
        const val STATUS_QUEUED = "queued"
        const val STATUS_COMPLETED = "completed"
        const val STATUS_ERROR = "error"
        const val STATUS_PAUSED = "paused"
        const val STATUS_CANCELLED = "cancelled"
    }

    @Query("SELECT * FROM downloads ORDER BY addedAt DESC")
    fun getAllDownloads(): Flow<List<DownloadEntity>>

    @Query("SELECT * FROM downloads WHERE status = :status ORDER BY addedAt DESC")
    fun getDownloadsByStatus(status: String): Flow<List<DownloadEntity>>

    @Query("SELECT * FROM downloads WHERE status = '$STATUS_COMPLETED' ORDER BY completedAt DESC")
    fun getCompletedDownloads(): Flow<List<DownloadEntity>>

    @Query("SELECT * FROM downloads WHERE trackId = :trackId")
    suspend fun getDownload(trackId: String): DownloadEntity?

    @Query("SELECT * FROM downloads WHERE status = '$STATUS_DOWNLOADING' OR status = '$STATUS_QUEUED'")
    fun getActiveDownloads(): Flow<List<DownloadEntity>>

    @Query("SELECT COUNT(*) FROM downloads WHERE status = '$STATUS_COMPLETED'")
    suspend fun totalCompleted(): Int

    @Query("SELECT COUNT(*) FROM downloads WHERE status = '$STATUS_COMPLETED' AND completedAt >= :since")
    suspend fun completedSince(since: Long): Int

    @Query("SELECT source, COUNT(*) as count FROM downloads WHERE status = '$STATUS_COMPLETED' GROUP BY source ORDER BY count DESC")
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

    @Query("UPDATE downloads SET filePath = :filePath, fileSize = :fileSize, status = '$STATUS_COMPLETED', completedAt = :completedAt, source = :source WHERE trackId = :trackId")
    suspend fun markComplete(trackId: String, filePath: String, fileSize: Long, source: String, completedAt: Long = System.currentTimeMillis())

    @Query("UPDATE downloads SET status = '$STATUS_ERROR', errorMessage = :error WHERE trackId = :trackId")
    suspend fun markError(trackId: String, error: String)

    @Query("UPDATE downloads SET progress = :progress, downloadSpeed = :speed WHERE trackId = :trackId")
    suspend fun updateProgress(trackId: String, progress: Float, speed: Float)

    @Transaction
    suspend fun pauseDownload(trackId: String) {
        updateStatus(trackId, "paused", 0f)
        updateIsPaused(trackId, true)
    }

    @Transaction
    suspend fun resumeDownload(trackId: String) {
        updateStatus(trackId, "queued", 0f)
        updateIsPaused(trackId, false)
    }

    @Query("DELETE FROM downloads WHERE trackId = :trackId")
    suspend fun delete(trackId: String)

    @Query("DELETE FROM downloads")
    suspend fun deleteAll()

    @Query("DELETE FROM downloads WHERE status = '$STATUS_COMPLETED'")
    suspend fun deleteCompleted()
}