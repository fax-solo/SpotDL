package com.sinc.enhanced.data.local.entity

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "user_genres",
    indices = [Index("genre", unique = true)]
)
data class UserGenreEntity(
    @PrimaryKey(autoGenerate = true)
    val id: Int = 0,
    val genre: String,
    val affinity: Float = 1.0f,
    val lastInteracted: Long = System.currentTimeMillis()
)
