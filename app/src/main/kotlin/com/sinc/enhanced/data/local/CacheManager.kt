package com.sinc.enhanced.data.local

import com.sinc.enhanced.data.local.dao.CacheDao
import com.sinc.enhanced.data.local.dao.LyricsCacheDao
import com.sinc.enhanced.data.local.entity.CacheEntryEntity
import com.sinc.enhanced.data.local.entity.LyricsCacheEntity
import com.sinc.enhanced.data.remote.LyricsCacheDb
import com.sinc.enhanced.data.remote.LyricsClient

class RoomLyricsCache(
    private val lyricsCacheDao: LyricsCacheDao
) : LyricsCacheDb {
    override suspend fun read(key: String): LyricsClient.LyricsResult? {
        val entity = lyricsCacheDao.get(key) ?: return null
        return LyricsClient.LyricsResult(
            plainLyrics = entity.plainLyrics.takeIf { it.isNotEmpty() },
            syncedLyrics = entity.syncedLyrics.takeIf { it.isNotEmpty() },
            source = entity.source
        )
    }

    override suspend fun write(key: String, result: LyricsClient.LyricsResult) {
        lyricsCacheDao.put(LyricsCacheEntity(
            id = key,
            plainLyrics = result.plainLyrics ?: "",
            syncedLyrics = result.syncedLyrics ?: "",
            source = result.source
        ))
    }
}

class CacheManager(private val cacheDao: CacheDao) {

    suspend fun get(key: String, now: Long = System.currentTimeMillis()): String? {
        return cacheDao.get(key, now)?.value
    }

    suspend fun put(key: String, value: String, ttlMs: Long = 3600000L) {
        cacheDao.put(CacheEntryEntity(
            key = key,
            value = value,
            expiresAt = System.currentTimeMillis() + ttlMs
        ))
    }

    suspend fun invalidate(key: String) {
        cacheDao.remove(key)
    }

    suspend fun invalidateAll() {
        cacheDao.clearAll()
    }

    suspend fun cleanExpired() {
        cacheDao.cleanExpired()
    }
}