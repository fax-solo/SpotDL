package com.sinc.enhanced.data.local.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "search_history")
data class SearchHistoryEntity(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0,
    val query: String,
    val resultType: String = "generic",
    val searchedAt: Long = System.currentTimeMillis()
)
