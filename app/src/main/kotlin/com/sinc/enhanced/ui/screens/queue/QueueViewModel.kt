package com.sinc.enhanced.ui.screens.queue

import android.content.Context
import android.content.Intent
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.sinc.enhanced.SincApp
import com.sinc.enhanced.data.local.entity.DownloadEntity
import com.sinc.enhanced.data.repository.DownloadRepository
import com.sinc.enhanced.service.DownloadService
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class QueueUiState(
    val downloads: List<DownloadEntity> = emptyList(),
    val activeDownloads: List<DownloadEntity> = emptyList()
)

class QueueViewModel(
    private val context: Context,
    private val downloadRepository: DownloadRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(QueueUiState())
    val uiState: StateFlow<QueueUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            downloadRepository.allDownloads.collect { downloads ->
                _uiState.value = _uiState.value.copy(downloads = downloads)
            }
        }
        viewModelScope.launch {
            downloadRepository.activeDownloads.collect { active ->
                _uiState.value = _uiState.value.copy(activeDownloads = active)
            }
        }
    }

    fun startDownload(trackId: String, audioUrl: String) {
        viewModelScope.launch {
            val track = _uiState.value.downloads.find { it.trackId == trackId }
            if (track == null) return@launch
            downloadRepository.addToQueue(
                com.sinc.enhanced.data.model.Track(
                    id = track.trackId,
                    title = track.title,
                    artist = track.artist,
                    album = track.album,
                    artworkUrl = track.artworkUrl,
                    durationMs = track.durationMs,
                    isrc = track.isrc,
                    source = track.source
                ),
                audioUrl
            )
            val intent = Intent(context, DownloadService::class.java).apply {
                action = DownloadService.ACTION_DOWNLOAD
                putExtra(DownloadService.EXTRA_TRACK_ID, trackId)
            }
            context.startForegroundService(intent)
        }
    }

    fun removeDownload(trackId: String) {
        viewModelScope.launch {
            downloadRepository.removeFromQueue(trackId)
        }
    }

    fun retryDownload(trackId: String) {
        viewModelScope.launch {
            downloadRepository.retryDownload(trackId)
            val intent = Intent(context, DownloadService::class.java).apply {
                action = DownloadService.ACTION_DOWNLOAD
                putExtra(DownloadService.EXTRA_TRACK_ID, trackId)
            }
            context.startForegroundService(intent)
        }
    }

    fun clearAll() {
        viewModelScope.launch { downloadRepository.clearAll() }
    }

    class Factory(private val context: Context) : ViewModelProvider.Factory {
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            @Suppress("UNCHECKED_CAST")
            return QueueViewModel(context, SincApp.instance.container.downloadRepository) as T
        }
    }
}
