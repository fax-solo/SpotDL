package com.sinc.enhanced.ui.screens.playlist

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.sinc.enhanced.SincApp
import com.sinc.enhanced.data.local.entity.PlaylistEntity
import com.sinc.enhanced.data.local.entity.PlaylistTrackEntity
import com.sinc.enhanced.data.model.Track
import com.sinc.enhanced.data.repository.DownloadRepository
import com.sinc.enhanced.data.repository.PlaylistRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class PlaylistDetailUiState(
    val playlist: PlaylistEntity? = null,
    val tracks: List<PlaylistTrackEntity> = emptyList(),
    val isLoading: Boolean = true,
    val showEditDialog: Boolean = false
)

class PlaylistDetailViewModel(
    private val playlistId: Int,
    private val playlistRepository: PlaylistRepository,
    private val downloadRepository: DownloadRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(PlaylistDetailUiState())
    val uiState: StateFlow<PlaylistDetailUiState> = _uiState.asStateFlow()

    init {
        load()
    }

    private fun load() {
        viewModelScope.launch {
            val playlist = playlistRepository.get(playlistId)
            playlistRepository.getTracksFlow(playlistId).collect { tracks ->
                _uiState.value = PlaylistDetailUiState(
                    playlist = playlist,
                    tracks = tracks,
                    isLoading = false
                )
            }
        }
    }

    fun removeTrack(trackId: String) {
        viewModelScope.launch {
            playlistRepository.removeTrack(playlistId, trackId)
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
            val p = playlistRepository.get(playlistId) ?: return@launch
            playlistRepository.update(p.copy(name = name.trim(), description = description.trim(), updatedAt = System.currentTimeMillis()))
            hideEditDialog()
        }
    }

    fun deletePlaylist() {
        viewModelScope.launch {
            playlistRepository.delete(playlistId)
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
