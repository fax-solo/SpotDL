package com.sinc.enhanced.data.local.dao

import androidx.room.*
import com.sinc.enhanced.data.local.entity.HistoryEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface HistoryDao {
    @Query("SELECT * FROM history ORDER BY downloadedAt DESC")
    fun getAllHistory(): Flow<List<HistoryEntity>>

    @Query("SELECT * FROM history WHERE trackId = :trackId")
    suspend fun getHistoryItem(trackId: String): HistoryEntity?

    @Query("SELECT COUNT(*) FROM history")
    suspend fun totalCount(): Int

    @Query("SELECT COUNT(*) FROM history WHERE downloadedAt >= :since")
    suspend fun countSince(since: Long): Int

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(history: HistoryEntity)

    @Query("DELETE FROM history WHERE id = :id")
    suspend fun delete(id: Long)

    @Query("DELETE FROM history")
    suspend fun deleteAll()
}
