package com.sinc.enhanced.domain.repository

import kotlinx.coroutines.flow.Flow

interface SettingsRepository {
    val downloadLyrics: Flow<Boolean>
    val downloadQuality: Flow<Int>
    val downloadFormat: Flow<String>
    val deezerArl: Flow<String>
    val jamendoClientId: Flow<String>
    val audiusEnabled: Flow<Boolean>
    val jamendoEnabled: Flow<Boolean>
    val fmaEnabled: Flow<Boolean>
    val bandcampEnabled: Flow<Boolean>
    val downloadPath: Flow<String>

    // Cache settings
    val cacheEnabled: Flow<Boolean>
    val cacheMaxSizeMb: Flow<Int>
    val cacheOnlyWifi: Flow<Boolean>
    val preloadNextTrack: Flow<Boolean>
    val audioQuality: Flow<Int>

    suspend fun setJamendoClientId(id: String)
    suspend fun setAudiusEnabled(enabled: Boolean)
    suspend fun setJamendoEnabled(enabled: Boolean)
    suspend fun setFmaEnabled(enabled: Boolean)
    suspend fun setBandcampEnabled(enabled: Boolean)
    suspend fun setDownloadPath(path: String)
    suspend fun setDownloadLyrics(enabled: Boolean)
    suspend fun setDownloadQuality(quality: Int)
    suspend fun setDownloadFormat(format: String)
    suspend fun setDeezerArl(arl: String)

    // Cache setters
    suspend fun setCacheEnabled(enabled: Boolean)
    suspend fun setCacheMaxSizeMb(sizeMb: Int)
    suspend fun setCacheOnlyWifi(enabled: Boolean)
    suspend fun setPreloadNextTrack(enabled: Boolean)
    suspend fun setAudioQuality(quality: Int)
}