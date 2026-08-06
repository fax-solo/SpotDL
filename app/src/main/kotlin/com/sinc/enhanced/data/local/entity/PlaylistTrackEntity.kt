package com.sinc.enhanced.data.local.entity

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "playlist_tracks",
    foreignKeys = [
        ForeignKey(
            entity = PlaylistEntity::class,
            parentColumns = ["id"],
            childColumns = ["playlistId"],
            onDelete = ForeignKey.CASCADE
        )
    ],
    indices = [Index("playlistId"), Index("playlistId", "trackId", unique = true)]
)
data class PlaylistTrackEntity(
    @PrimaryKey(autoGenerate = true)
    val id: Int = 0,
    val playlistId: String,
    val trackId: String,
    val title: String,
    val artist: String,
    val album: String = "",
    val artworkUrl: String? = null,
    val durationMs: Long = 0,
    val source: String = "spotify",
    val filePath: String? = null,
    val position: Int = 0,
    val addedAt: Long = System.currentTimeMillis()
)
