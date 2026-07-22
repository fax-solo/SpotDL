package com.sinc.enhanced.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.Query
import com.sinc.enhanced.data.local.entity.SearchHistoryEntity

@Dao
interface SearchHistoryDao {
    @Query("SELECT * FROM search_history ORDER BY searchedAt DESC LIMIT :limit")
    suspend fun getRecent(limit: Int = 30): List<SearchHistoryEntity>

    @Query("SELECT DISTINCT query FROM search_history ORDER BY searchedAt DESC LIMIT 50")
    suspend fun getRecentQueries(): List<String>

    @Query("SELECT COUNT(*) FROM search_history")
    suspend fun count(): Int

    @Insert
    suspend fun insert(entry: SearchHistoryEntity)

    @Query("DELETE FROM search_history")
    suspend fun deleteAll()
}
