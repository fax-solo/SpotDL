package com.sinc.enhanced.data.local

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import com.sinc.enhanced.domain.repository.SettingsRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

class SettingsManager(private val dataStore: DataStore<Preferences>) : SettingsRepository {

    companion object {
        val JAMENDO_CLIENT_ID = stringPreferencesKey("jamendo_client_id")
        val SOURCE_AUDIUS_ENABLED = booleanPreferencesKey("source_audius_enabled")
        val SOURCE_JAMENDO_ENABLED = booleanPreferencesKey("source_jamendo_enabled")
        val SOURCE_FMA_ENABLED = booleanPreferencesKey("source_fma_enabled")
        val SOURCE_BANDCAMP_ENABLED = booleanPreferencesKey("source_bandcamp_enabled")
        val DOWNLOAD_LYRICS = booleanPreferencesKey("download_lyrics")
        val DOWNLOAD_PATH = stringPreferencesKey("download_path")
        val DOWNLOAD_QUALITY = intPreferencesKey("download_quality")
        val DOWNLOAD_FORMAT = stringPreferencesKey("download_format")
        val DEEZER_ARL = stringPreferencesKey("deezer_arl")
    }

    override val downloadLyrics: Flow<Boolean> = dataStore.data.map {
        it[DOWNLOAD_LYRICS] ?: true
    }

    override val downloadQuality: Flow<Int> = dataStore.data.map {
        it[DOWNLOAD_QUALITY] ?: 128
    }

    override val downloadFormat: Flow<String> = dataStore.data.map {
        it[DOWNLOAD_FORMAT] ?: "mp3"
    }

    override val deezerArl: Flow<String> = dataStore.data.map {
        it[DEEZER_ARL] ?: ""
    }

    override val jamendoClientId: Flow<String> = dataStore.data.map {
        it[JAMENDO_CLIENT_ID] ?: ""
    }

    override val audiusEnabled: Flow<Boolean> = dataStore.data.map {
        it[SOURCE_AUDIUS_ENABLED] ?: true
    }

    override val jamendoEnabled: Flow<Boolean> = dataStore.data.map {
        it[SOURCE_JAMENDO_ENABLED] ?: false
    }

    override val fmaEnabled: Flow<Boolean> = dataStore.data.map {
        it[SOURCE_FMA_ENABLED] ?: false
    }

    override val bandcampEnabled: Flow<Boolean> = dataStore.data.map {
        it[SOURCE_BANDCAMP_ENABLED] ?: true
    }

    override val downloadPath: Flow<String> = dataStore.data.map {
        it[DOWNLOAD_PATH] ?: ""
    }

    override suspend fun setJamendoClientId(id: String) {
        dataStore.edit { it[JAMENDO_CLIENT_ID] = id }
    }

    override suspend fun setAudiusEnabled(enabled: Boolean) {
        dataStore.edit { it[SOURCE_AUDIUS_ENABLED] = enabled }
    }

    override suspend fun setJamendoEnabled(enabled: Boolean) {
        dataStore.edit { it[SOURCE_JAMENDO_ENABLED] = enabled }
    }

    override suspend fun setFmaEnabled(enabled: Boolean) {
        dataStore.edit { it[SOURCE_FMA_ENABLED] = enabled }
    }

    override suspend fun setBandcampEnabled(enabled: Boolean) {
        dataStore.edit { it[SOURCE_BANDCAMP_ENABLED] = enabled }
    }

    override suspend fun setDownloadPath(path: String) {
        dataStore.edit { it[DOWNLOAD_PATH] = path }
    }

    override suspend fun setDownloadLyrics(enabled: Boolean) {
        dataStore.edit { it[DOWNLOAD_LYRICS] = enabled }
    }

    override suspend fun setDownloadQuality(quality: Int) {
        dataStore.edit { it[DOWNLOAD_QUALITY] = quality }
    }

    override suspend fun setDownloadFormat(format: String) {
        dataStore.edit { it[DOWNLOAD_FORMAT] = format }
    }

    override suspend fun setDeezerArl(arl: String) {
        dataStore.edit { it[DEEZER_ARL] = arl }
    }
}
