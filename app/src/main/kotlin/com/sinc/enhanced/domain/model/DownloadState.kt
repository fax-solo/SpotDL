package com.sinc.enhanced.domain.model

import com.sinc.enhanced.data.model.Track

sealed class DownloadState {
    data class Queued(val track: Track, val addedAt: Long = System.currentTimeMillis()) : DownloadState()
    data class Downloading(
        val track: Track,
        val progress: Float = 0f,
        val bytesDownloaded: Long = 0,
        val totalBytes: Long = 0
    ) : DownloadState()

    data class Completed(
        val track: Track,
        val filePath: String,
        val fileSize: Long = 0,
        val completedAt: Long = System.currentTimeMillis()
    ) : DownloadState()

    data class Error(
        val track: Track,
        val message: String,
        val attemptedAt: Long = System.currentTimeMillis()
    ) : DownloadState()
}
