package com.sinc.enhanced.ui.screens.playlist

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.sinc.enhanced.SincApp
import com.sinc.enhanced.data.local.entity.PlaylistEntity
import com.sinc.enhanced.data.repository.PlaylistRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class PlaylistListUiState(
    val playlists: List<PlaylistEntity> = emptyList(),
    val isLoading: Boolean = true,
    val showCreateDialog: Boolean = false
)

class PlaylistListViewModel(
    private val playlistRepository: PlaylistRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(PlaylistListUiState())
    val uiState: StateFlow<PlaylistListUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            playlistRepository.allPlaylists.collect { playlists ->
                _uiState.value = _uiState.value.copy(playlists = playlists, isLoading = false)
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
            playlistRepository.create(name, description)
            hideCreateDialog()
        }
    }

    fun deletePlaylist(id: Int) {
        viewModelScope.launch {
            playlistRepository.delete(id)
        }
    }

    fun renamePlaylist(id: Int, name: String) {
        viewModelScope.launch {
            playlistRepository.rename(id, name)
        }
    }

    class Factory : ViewModelProvider.Factory {
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            @Suppress("UNCHECKED_CAST")
            return PlaylistListViewModel(SincApp.instance.container.playlistRepository) as T
        }
    }
}
