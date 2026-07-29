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
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

data class QueueUiState(
    val downloads: List<DownloadEntity> = emptyList(),
    val isLoading: Boolean = true,
    val error: String? = null
)

class QueueViewModel(
    private val context: Context,
    private val downloadRepository: DownloadRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(QueueUiState())
    val uiState: StateFlow<QueueUiState> = _uiState.asStateFlow()

    private var collectionJob: Job? = null

    init {
        observeDownloads()
    }

    private fun observeDownloads() {
        collectionJob?.cancel()
        collectionJob = viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, error = null)
            try {
                downloadRepository.allDownloads.catch { e ->
                    _uiState.value = _uiState.value.copy(error = e.message, isLoading = false)
                }.collect { d ->
                    _uiState.value = QueueUiState(downloads = d, isLoading = false)
                }
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(isLoading = false, error = e.message ?: "Failed to load downloads")
            }
        }
    }

    fun refresh() {
        observeDownloads()
    }

    fun removeDownload(trackId: String) {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(error = null)
            try {
                downloadRepository.removeFromQueue(trackId)
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(error = e.message ?: "Failed to remove download")
            }
        }
    }

    fun retryDownload(trackId: String) {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(error = null)
            try {
                downloadRepository.retryDownload(trackId)
                val intent = Intent(context, DownloadService::class.java).apply {
                    action = DownloadService.ACTION_DOWNLOAD
                    putExtra(DownloadService.EXTRA_TRACK_ID, trackId)
                }
                context.startForegroundService(intent)
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(error = e.message ?: "Failed to retry download")
            }
        }
    }

    fun clearAll() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(error = null)
            try {
                downloadRepository.clearAll()
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(error = e.message ?: "Failed to clear downloads")
            }
        }
    }

    fun clearCompleted() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(error = null)
            try {
                downloadRepository.clearCompleted()
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(error = e.message ?: "Failed to clear completed downloads")
            }
        }
    }

    fun pauseDownload(trackId: String) {
        viewModelScope.launch {
            downloadRepository.pauseDownload(trackId)
        }
    }

    fun resumeDownload(trackId: String) {
        viewModelScope.launch {
            downloadRepository.resumeDownload(trackId)
        }
    }

    fun cancelDownload(trackId: String) {
        viewModelScope.launch {
            downloadRepository.cancelDownload(trackId)
        }
    }

    class Factory(private val context: Context) : ViewModelProvider.Factory {
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            @Suppress("UNCHECKED_CAST")
            return QueueViewModel(context, SincApp.instance.container.downloadRepository) as T
        }
    }
}
