package com.sinc.enhanced.data.local.entity

import androidx.room.Entity
import androidx.room.PrimaryKey
import com.sinc.enhanced.data.util.IdGenerator

@Entity(tableName = "playlists")
data class PlaylistEntity(
    @PrimaryKey
    val id: String = IdGenerator.generateWithPrefix("pl"),
    val name: String,
    val description: String = "",
    val artworkUrl: String? = null,
    val trackCount: Int = 0,
    val createdAt: Long = System.currentTimeMillis(),
    val updatedAt: Long = System.currentTimeMillis()
)
