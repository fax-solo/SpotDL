package com.sinc.enhanced.data.local

import android.content.Context
import kotlinx.coroutines.flow.Flow

class CacheManager(private val settingsManager: SettingsManager, private val context: Context) {

    val cacheEnabled: Flow<Boolean> = settingsManager.cacheEnabled
    val cacheMaxSizeMb: Flow<Int> = settingsManager.cacheMaxSizeMb
    val cacheOnlyWifi: Flow<Boolean> = settingsManager.cacheOnlyWifi
    val preloadNextTrack: Flow<Boolean> = settingsManager.preloadNextTrack
    val audioQuality: Flow<Int> = settingsManager.audioQuality

    suspend fun setCacheEnabled(enabled: Boolean) = settingsManager.setCacheEnabled(enabled)
    suspend fun setCacheMaxSizeMb(sizeMb: Int) = settingsManager.setCacheMaxSizeMb(sizeMb)
    suspend fun setCacheOnlyWifi(enabled: Boolean) = settingsManager.setCacheOnlyWifi(enabled)
    suspend fun setPreloadNextTrack(enabled: Boolean) = settingsManager.setPreloadNextTrack(enabled)
    suspend fun setAudioQuality(quality: Int) = settingsManager.setAudioQuality(quality)
}
