package com.sinc.enhanced.data.local

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

class CacheManager(private val dataStore: DataStore<Preferences>, private val context: Context) {

    companion object {
        val CACHE_ENABLED = booleanPreferencesKey("cache_enabled")
        val CACHE_MAX_SIZE_MB = intPreferencesKey("cache_max_size_mb")
        val CACHE_ONLY_WIFI = booleanPreferencesKey("cache_only_wifi")
        val PRELOAD_NEXT_TRACK = booleanPreferencesKey("preload_next_track")
        val AUDIO_QUALITY = intPreferencesKey("audio_quality")
    }

    val cacheEnabled: Flow<Boolean> = dataStore.data.map { it[CACHE_ENABLED] ?: true }
    val cacheMaxSizeMb: Flow<Int> = dataStore.data.map { it[CACHE_MAX_SIZE_MB] ?: 500 }
    val cacheOnlyWifi: Flow<Boolean> = dataStore.data.map { it[CACHE_ONLY_WIFI] ?: true }
    val preloadNextTrack: Flow<Boolean> = dataStore.data.map { it[PRELOAD_NEXT_TRACK] ?: true }
    val audioQuality: Flow<Int> = dataStore.data.map { it[AUDIO_QUALITY] ?: 128 }

    suspend fun setCacheEnabled(enabled: Boolean) {
        dataStore.edit { it[CACHE_ENABLED] = enabled }
    }

    suspend fun setCacheMaxSizeMb(sizeMb: Int) {
        dataStore.edit { it[CACHE_MAX_SIZE_MB] = sizeMb.coerceIn(50, 5000) }
    }

    suspend fun setCacheOnlyWifi(enabled: Boolean) {
        dataStore.edit { it[CACHE_ONLY_WIFI] = enabled }
    }

    suspend fun setPreloadNextTrack(enabled: Boolean) {
        dataStore.edit { it[PRELOAD_NEXT_TRACK] = enabled }
    }

    suspend fun setAudioQuality(quality: Int) {
        dataStore.edit { it[AUDIO_QUALITY] = quality }
    }
}