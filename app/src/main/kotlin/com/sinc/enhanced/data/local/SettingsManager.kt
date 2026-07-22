package com.sinc.enhanced.data.local

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

class SettingsManager(private val dataStore: DataStore<Preferences>) {

    companion object {
        val JAMENDO_CLIENT_ID = stringPreferencesKey("jamendo_client_id")
        val SOURCE_AUDIUS_ENABLED = booleanPreferencesKey("source_audius_enabled")
        val SOURCE_JAMENDO_ENABLED = booleanPreferencesKey("source_jamendo_enabled")
        val SOURCE_FMA_ENABLED = booleanPreferencesKey("source_fma_enabled")
        val SOURCE_BANDCAMP_ENABLED = booleanPreferencesKey("source_bandcamp_enabled")
        val DOWNLOAD_PATH = stringPreferencesKey("download_path")
    }

    val jamendoClientId: Flow<String> = dataStore.data.map {
        it[JAMENDO_CLIENT_ID] ?: ""
    }

    val audiusEnabled: Flow<Boolean> = dataStore.data.map {
        it[SOURCE_AUDIUS_ENABLED] ?: true
    }

    val jamendoEnabled: Flow<Boolean> = dataStore.data.map {
        it[SOURCE_JAMENDO_ENABLED] ?: false
    }

    val fmaEnabled: Flow<Boolean> = dataStore.data.map {
        it[SOURCE_FMA_ENABLED] ?: false
    }

    val bandcampEnabled: Flow<Boolean> = dataStore.data.map {
        it[SOURCE_BANDCAMP_ENABLED] ?: true
    }

    val downloadPath: Flow<String> = dataStore.data.map {
        it[DOWNLOAD_PATH] ?: ""
    }

    suspend fun setJamendoClientId(id: String) {
        dataStore.edit { it[JAMENDO_CLIENT_ID] = id }
    }

    suspend fun setAudiusEnabled(enabled: Boolean) {
        dataStore.edit { it[SOURCE_AUDIUS_ENABLED] = enabled }
    }

    suspend fun setJamendoEnabled(enabled: Boolean) {
        dataStore.edit { it[SOURCE_JAMENDO_ENABLED] = enabled }
    }

    suspend fun setFmaEnabled(enabled: Boolean) {
        dataStore.edit { it[SOURCE_FMA_ENABLED] = enabled }
    }

    suspend fun setBandcampEnabled(enabled: Boolean) {
        dataStore.edit { it[SOURCE_BANDCAMP_ENABLED] = enabled }
    }

    suspend fun setDownloadPath(path: String) {
        dataStore.edit { it[DOWNLOAD_PATH] = path }
    }
}
