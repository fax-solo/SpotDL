package com.sinc.enhanced.data.repository

import com.sinc.enhanced.data.local.SettingsManager
import com.sinc.enhanced.data.model.Track
import com.sinc.enhanced.domain.music.SearchResult
import kotlinx.coroutines.flow.Flow

interface SearchSource {
    val name: String
    val priority: Int // Lower = higher priority
    
    suspend fun search(query: String): List<SearchResult>
    fun searchStreaming(query: String): Flow<List<SearchResult>>
    suspend fun isEnabled(settingsManager: SettingsManager): Boolean
}