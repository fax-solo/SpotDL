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

    @Query("UPDATE downloads SET status = :status, progress = :progress WHERE trackId = :trackId")
    suspend fun updateStatus(trackId: String, status: String, progress: Float = 0f)

    @Query("UPDATE downloads SET filePath = :filePath, fileSize = :fileSize, status = 'completed', completedAt = :completedAt WHERE trackId = :trackId")
    suspend fun markComplete(trackId: String, filePath: String, fileSize: Long, completedAt: Long = System.currentTimeMillis())

    @Query("UPDATE downloads SET status = 'error', errorMessage = :error WHERE trackId = :trackId")
    suspend fun markError(trackId: String, error: String)

    @Query("DELETE FROM downloads WHERE trackId = :trackId")
    suspend fun delete(trackId: String)

    @Query("DELETE FROM downloads")
    suspend fun deleteAll()
}
