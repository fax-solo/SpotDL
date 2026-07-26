package com.sinc.enhanced.data.local.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "lyrics_cache")
data class LyricsCacheEntity(
    @PrimaryKey val id: String,
    val plainLyrics: String = "",
    val syncedLyrics: String = "",
    val source: String = ""
)