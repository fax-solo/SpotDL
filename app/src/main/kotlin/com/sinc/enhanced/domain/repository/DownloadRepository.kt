package com.sinc.enhanced.domain.repository

import com.sinc.enhanced.data.local.entity.DownloadEntity
import com.sinc.enhanced.data.model.Track
import kotlinx.coroutines.flow.Flow

interface DownloadRepository {
    val allDownloads: Flow<List<DownloadEntity>>
    val activeDownloads: Flow<List<DownloadEntity>>
    val completedDownloads: Flow<List<DownloadEntity>>

    suspend fun addToQueue(track: Track, audioUrl: String)
    suspend fun addBatchToQueue(tracks: List<Track>, audioUrls: Map<String, String>)
    suspend fun removeFromQueue(trackId: String)
    suspend fun clearAll()
    suspend fun clearCompleted()
    suspend fun pauseDownload(trackId: String)
    suspend fun resumeDownload(trackId: String)
    suspend fun cancelDownload(trackId: String)
    suspend fun downloadFile(trackId: String, onProgress: (Float, Float) -> Unit): Boolean
    suspend fun retryDownload(trackId: String)
}