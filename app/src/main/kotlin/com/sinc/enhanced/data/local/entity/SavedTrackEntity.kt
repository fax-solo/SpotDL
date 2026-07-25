package com.sinc.enhanced.data.local.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "saved_tracks")
data class SavedTrackEntity(
    @PrimaryKey
    val trackId: String,
    val title: String,
    val artist: String,
    val album: String = "",
    val artworkUrl: String? = null,
    val durationMs: Long = 0,
    val source: String = "spotify",
    val filePath: String? = null,
    val addedAt: Long = System.currentTimeMillis()
)