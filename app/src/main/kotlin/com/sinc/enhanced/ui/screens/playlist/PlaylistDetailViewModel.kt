package com.sinc.enhanced.ui.screens.playlist

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.sinc.enhanced.SincApp
import com.sinc.enhanced.data.local.entity.PlaylistEntity
import com.sinc.enhanced.data.local.entity.PlaylistTrackEntity
import com.sinc.enhanced.data.repository.DownloadRepository
import com.sinc.enhanced.data.repository.PlaylistRepository
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class PlaylistDetailUiState(
    val playlist: PlaylistEntity? = null,
    val tracks: List<PlaylistTrackEntity> = emptyList(),
    val isLoading: Boolean = true,
    val showEditDialog: Boolean = false,
    val error: String? = null
)

class PlaylistDetailViewModel(
    private val playlistId: Int,
    private val playlistRepository: PlaylistRepository,
    private val downloadRepository: DownloadRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(PlaylistDetailUiState())
    val uiState: StateFlow<PlaylistDetailUiState> = _uiState.asStateFlow()

    private var collectionJob: Job? = null

    init {
        refresh()
    }

    fun refresh() {
        collectionJob?.cancel()
        collectionJob = viewModelScope.launch {
            try {
                _uiState.value = _uiState.value.copy(error = null, isLoading = true)
                playlistRepository.get(playlistId)?.let { playlist ->
                    _uiState.value = _uiState.value.copy(playlist = playlist)
                }
                playlistRepository.getTracksFlow(playlistId).collect { tracks ->
                    _uiState.value = _uiState.value.copy(tracks = tracks, isLoading = false)
                }
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    error = e.message ?: "Failed to load playlist"
                )
            }
        }
    }

    fun removeTrack(trackId: String) {
        viewModelScope.launch {
            try {
                playlistRepository.removeTrack(playlistId, trackId)
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(error = e.message ?: "Failed to remove track")
            }
        }
    }

    fun showEditDialog() {
        _uiState.value = _uiState.value.copy(showEditDialog = true)
    }

    fun hideEditDialog() {
        _uiState.value = _uiState.value.copy(showEditDialog = false)
    }

    fun updatePlaylist(name: String, description: String) {
        viewModelScope.launch {
            try {
                val p = playlistRepository.get(playlistId) ?: return@launch
                val updated = p.copy(name = name.trim(), description = description.trim(), updatedAt = System.currentTimeMillis())
                playlistRepository.update(updated)
                _uiState.value = _uiState.value.copy(playlist = updated)
                hideEditDialog()
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(error = e.message ?: "Failed to update playlist")
            }
        }
    }

    fun deletePlaylist() {
        viewModelScope.launch {
            try {
                playlistRepository.delete(playlistId)
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(error = e.message ?: "Failed to delete playlist")
            }
        }
    }

    class Factory(private val playlistId: Int) : ViewModelProvider.Factory {
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            @Suppress("UNCHECKED_CAST")
            val c = SincApp.instance.container
            return PlaylistDetailViewModel(playlistId, c.playlistRepository, c.downloadRepository) as T
        }
    }
}
