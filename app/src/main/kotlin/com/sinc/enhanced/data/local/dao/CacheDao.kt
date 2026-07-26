package com.sinc.enhanced.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.sinc.enhanced.data.local.entity.CacheEntryEntity

@Dao
interface CacheDao {
    @Query("SELECT * FROM cache_entries WHERE key = :key AND expiresAt > :now")
    suspend fun get(key: String, now: Long = System.currentTimeMillis()): CacheEntryEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun put(entry: CacheEntryEntity)

    @Query("DELETE FROM cache_entries WHERE key = :key")
    suspend fun remove(key: String)

    @Query("DELETE FROM cache_entries WHERE expiresAt <= :now")
    suspend fun cleanExpired(now: Long = System.currentTimeMillis())

    @Query("DELETE FROM cache_entries")
    suspend fun clearAll()
}
