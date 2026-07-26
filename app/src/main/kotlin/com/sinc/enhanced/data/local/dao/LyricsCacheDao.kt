package com.sinc.enhanced.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.sinc.enhanced.data.local.entity.LyricsCacheEntity

@Dao
interface LyricsCacheDao {
    @Query("SELECT * FROM lyrics_cache WHERE id = :key")
    suspend fun get(key: String): LyricsCacheEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun put(entry: LyricsCacheEntity)

    @Query("DELETE FROM lyrics_cache WHERE id = :key")
    suspend fun remove(key: String)

    @Query("DELETE FROM lyrics_cache")
    suspend fun clearAll()
}
