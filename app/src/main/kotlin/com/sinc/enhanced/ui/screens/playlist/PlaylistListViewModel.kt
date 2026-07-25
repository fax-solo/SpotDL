package com.sinc.enhanced.ui.screens.playlist

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.sinc.enhanced.SincApp
import com.sinc.enhanced.data.local.entity.PlaylistEntity
import com.sinc.enhanced.data.repository.PlaylistRepository
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class PlaylistListUiState(
    val playlists: List<PlaylistEntity> = emptyList(),
    val isLoading: Boolean = true,
    val showCreateDialog: Boolean = false,
    val error: String? = null
)

class PlaylistListViewModel(
    private val playlistRepository: PlaylistRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(PlaylistListUiState())
    val uiState: StateFlow<PlaylistListUiState> = _uiState.asStateFlow()

    private var collectionJob: Job? = null

    init {
        refresh()
    }

    fun refresh() {
        collectionJob?.cancel()
        collectionJob = viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, error = null)
            try {
                playlistRepository.allPlaylists.collect { playlists ->
                    _uiState.value = _uiState.value.copy(playlists = playlists, isLoading = false)
                }
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(isLoading = false, error = e.message ?: "Failed to load playlists")
            }
        }
    }

    fun showCreateDialog() {
        _uiState.value = _uiState.value.copy(showCreateDialog = true)
    }

    fun hideCreateDialog() {
        _uiState.value = _uiState.value.copy(showCreateDialog = false)
    }

    fun createPlaylist(name: String, description: String = "") {
        viewModelScope.launch {
            try {
                playlistRepository.create(name, description)
                hideCreateDialog()
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(error = e.message ?: "Failed to create playlist")
            }
        }
    }

    fun deletePlaylist(id: Int) {
        viewModelScope.launch {
            try {
                playlistRepository.delete(id)
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(error = e.message ?: "Failed to delete playlist")
            }
        }
    }

    fun renamePlaylist(id: Int, name: String) {
        viewModelScope.launch {
            try {
                playlistRepository.rename(id, name)
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(error = e.message ?: "Failed to rename playlist")
            }
        }
    }

    class Factory : ViewModelProvider.Factory {
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            @Suppress("UNCHECKED_CAST")
            return PlaylistListViewModel(SincApp.instance.container.playlistRepository) as T
        }
    }
}
