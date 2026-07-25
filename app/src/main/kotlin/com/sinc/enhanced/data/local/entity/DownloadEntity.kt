package com.sinc.enhanced.data.local.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "downloads")
data class DownloadEntity(
    @PrimaryKey
    val trackId: String,
    val title: String,
    val artist: String,
    val album: String,
    val artworkUrl: String? = null,
    val durationMs: Long = 0,
    val isrc: String? = null,
    val source: String = "spotify",
    val streamUrl: String? = null,
    val filePath: String? = null,
    val fileSize: Long = 0,
    val status: String = "queued",
    val progress: Float = 0f,
    val downloadSpeed: Float = 0f,
    val errorMessage: String? = null,
    val addedAt: Long = System.currentTimeMillis(),
    val completedAt: Long? = null,
    val retryCount: Int = 0,
    val lastSource: String? = null,
    val lastRetryAt: Long? = null,
    val isPaused: Boolean = false
)