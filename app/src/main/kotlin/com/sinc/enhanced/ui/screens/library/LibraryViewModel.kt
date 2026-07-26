package com.sinc.enhanced.ui.screens.library

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.sinc.enhanced.SincApp
import com.sinc.enhanced.data.local.entity.DownloadEntity
import com.sinc.enhanced.data.repository.DownloadRepository
import com.sinc.enhanced.data.repository.MusicRepository
import com.sinc.enhanced.ui.permission.AudioPermissionState
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class LibraryUiState(
    val selectedTab: Int = 0,
    val localTracks: List<MusicRepository.LocalTrack> = emptyList(),
    val downloadedTracks: List<DownloadEntity> = emptyList(),
    val localCount: Int = 0,
    val downloadedCount: Int = 0,
    val isLoading: Boolean = false,
    val error: String? = null
)

class LibraryViewModel(
    private val musicRepository: MusicRepository,
    private val downloadRepository: DownloadRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(LibraryUiState())
    val uiState: StateFlow<LibraryUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            downloadRepository.completedDownloads.collect { completed ->
                _uiState.value = _uiState.value.copy(
                    downloadedTracks = completed,
                    downloadedCount = completed.size
                )
            }
        }
    }

    fun selectTab(index: Int) {
        _uiState.value = _uiState.value.copy(selectedTab = index)
    }

    fun setPermissionState(state: AudioPermissionState) {
        if (state is AudioPermissionState.Granted && _uiState.value.localTracks.isEmpty()) {
            loadLocalMusic()
        }
    }

    private var loadingLocal = false

    fun loadLocalMusic() {
        if (loadingLocal) return
        loadingLocal = true
        viewModelScope.launch(Dispatchers.IO) {
            _uiState.value = _uiState.value.copy(isLoading = true, error = null)
            try {
                val tracks = musicRepository.scanLocalMusic()
                _uiState.value = _uiState.value.copy(
                    localTracks = tracks,
                    localCount = tracks.size,
                    isLoading = false
                )
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(isLoading = false, error = e.message ?: "Unknown error")
            } finally {
                loadingLocal = false
            }
        }
    }

    class Factory : ViewModelProvider.Factory {
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            @Suppress("UNCHECKED_CAST")
            val c = SincApp.instance.container
            return LibraryViewModel(c.musicRepository, c.downloadRepository) as T
        }
    }
}
