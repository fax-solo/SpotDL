package com.sinc.enhanced.data.local.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "play_counts")
data class PlayCountEntity(
    @PrimaryKey
    val trackId: String,
    val artist: String,
    val title: String,
    val count: Int = 1,
    val lastPlayed: Long = System.currentTimeMillis()
)
