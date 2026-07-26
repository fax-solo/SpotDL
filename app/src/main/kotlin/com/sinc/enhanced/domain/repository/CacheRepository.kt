package com.sinc.enhanced.domain.repository

import kotlinx.coroutines.flow.Flow

interface CacheRepository {
    val cacheEnabled: Flow<Boolean>
    val cacheMaxSizeMb: Flow<Int>
    val cacheOnlyWifi: Flow<Boolean>
    val preloadNextTrack: Flow<Boolean>
    val audioQuality: Flow<Int>

    fun getCacheDir(): java.io.File
    suspend fun getCachedAudioPath(trackId: String): String?
    suspend fun cacheAudio(trackId: String, url: String): Boolean
    suspend fun removeCachedAudio(trackId: String): Boolean
    suspend fun clearAllCache(): Int
    suspend fun getCacheSize(): Long
    suspend fun getCachedTrackCount(): Int
    suspend fun isTrackCached(trackId: String): Boolean
    suspend fun preCacheNextTrack(trackId: String, url: String): Boolean
    suspend fun setCacheEnabled(enabled: Boolean)
    suspend fun setCacheMaxSizeMb(sizeMb: Int)
    suspend fun setCacheOnlyWifi(enabled: Boolean)
    suspend fun setPreloadNextTrack(enabled: Boolean)
    suspend fun setAudioQuality(quality: Int)
}