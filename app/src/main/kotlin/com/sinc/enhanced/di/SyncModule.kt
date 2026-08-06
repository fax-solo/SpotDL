package com.sinc.enhanced.di

import com.sinc.enhanced.data.recommendation.RecommendationEngine
import com.sinc.enhanced.data.remote.ApiClient
import com.sinc.enhanced.data.repository.SearchRepository
import com.sinc.enhanced.data.sync.RecommendationSyncManager

class SyncModule(
    apiClient: ApiClient,
    database: DatabaseModule,
    searchRepository: SearchRepository
) {
    val recommendationSyncManager: RecommendationSyncManager = RecommendationSyncManager(
        apiClient = apiClient,
        recommendationDao = database.database.recommendationDao()
    )

    val recommendationEngine: RecommendationEngine = RecommendationEngine(
        searchRepository = searchRepository,
        searchHistoryDao = database.database.searchHistoryDao(),
        recommendationDao = database.database.recommendationDao(),
        syncManager = recommendationSyncManager
    )
}
