package com.sinc.enhanced.ui.screens.settings

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.sinc.enhanced.SincApp
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch

data class SettingsUiState(
    val downloadQuality: Int = 128,
    val downloadFormat: String = "mp3",
    val deezerArl: String = ""
)

class SettingsViewModel(
    private val context: Context
) : ViewModel() {

    companion object {
        val DOWNLOAD_QUALITY = intPreferencesKey("download_quality")
        val DOWNLOAD_FORMAT = stringPreferencesKey("download_format")
        val DEEZER_ARL = stringPreferencesKey("deezer_arl")
    }

    private val _uiState = MutableStateFlow(SettingsUiState())
    val uiState: StateFlow<SettingsUiState> = _uiState.asStateFlow()

    private val dataStore = SincApp.instance.container.dataStore

    init {
        viewModelScope.launch {
            dataStore.data.collect { prefs ->
                _uiState.value = SettingsUiState(
                    downloadQuality = prefs[DOWNLOAD_QUALITY] ?: 128,
                    downloadFormat = prefs[DOWNLOAD_FORMAT] ?: "mp3",
                    deezerArl = prefs[DEEZER_ARL] ?: ""
                )
            }
        }
    }

    fun setDownloadQuality(quality: Int) {
        viewModelScope.launch {
            dataStore.edit { prefs -> prefs[DOWNLOAD_QUALITY] = quality }
        }
    }

    fun setDownloadFormat(format: String) {
        viewModelScope.launch {
            dataStore.edit { prefs -> prefs[DOWNLOAD_FORMAT] = format }
        }
    }

    fun setDeezerArl(arl: String) {
        viewModelScope.launch {
            dataStore.edit { prefs -> prefs[DEEZER_ARL] = arl }
        }
    }

    class Factory(private val context: Context) : ViewModelProvider.Factory {
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            @Suppress("UNCHECKED_CAST")
            return SettingsViewModel(context) as T
        }
    }
}
