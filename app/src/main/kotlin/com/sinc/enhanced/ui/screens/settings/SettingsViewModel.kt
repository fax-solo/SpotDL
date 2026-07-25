package com.sinc.enhanced.ui.screens.settings

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.sinc.enhanced.SincApp
import com.sinc.enhanced.data.local.SettingsManager
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class SettingsUiState(
    val downloadQuality: Int = 128,
    val downloadFormat: String = "mp3",
    val deezerArl: String = "",
    val downloadLyrics: Boolean = true,
    val streamingQuality: Int = 128,
    val downmixMono: Boolean = false,
    val drc: Boolean = false,
    val crossfeed: Boolean = false,
    val bitPerfect: Boolean = false,
    val scrobbleLastFm: Boolean = false,
    val language: String = "System Default"
)

class SettingsViewModel(
    private val context: Context
) : ViewModel() {

    private val _uiState = MutableStateFlow(SettingsUiState())
    val uiState: StateFlow<SettingsUiState> = _uiState.asStateFlow()

    private val settingsManager: SettingsManager = SincApp.instance.container.settingsManager

    init {
        viewModelScope.launch {
            settingsManager.downloadLyrics.collect { value ->
                _uiState.value = _uiState.value.copy(downloadLyrics = value)
            }
        }
        viewModelScope.launch {
            settingsManager.downloadQuality.collect { value ->
                _uiState.value = _uiState.value.copy(downloadQuality = value)
            }
        }
        viewModelScope.launch {
            settingsManager.audioQuality.collect { value ->
                _uiState.value = _uiState.value.copy(streamingQuality = value)
            }
        }
        viewModelScope.launch {
            settingsManager.downloadFormat.collect { value ->
                _uiState.value = _uiState.value.copy(downloadFormat = value)
            }
        }
        viewModelScope.launch {
            settingsManager.deezerArl.collect { value ->
                _uiState.value = _uiState.value.copy(deezerArl = value)
            }
        }
    }

    fun setDownloadLyrics(enabled: Boolean) {
        viewModelScope.launch { settingsManager.setDownloadLyrics(enabled) }
    }

    fun setDownloadQuality(quality: Int) {
        viewModelScope.launch { settingsManager.setDownloadQuality(quality) }
    }

    fun setStreamingQuality(quality: Int) {
        viewModelScope.launch { settingsManager.setAudioQuality(quality) }
    }

    fun setDownloadFormat(format: String) {
        viewModelScope.launch { settingsManager.setDownloadFormat(format) }
    }

    fun setDeezerArl(arl: String) {
        viewModelScope.launch { settingsManager.setDeezerArl(arl) }
    }

    class Factory(private val context: Context) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            return SettingsViewModel(context) as T
        }
    }
}
