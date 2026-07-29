package com.sinc.enhanced.data.sync

import android.util.Log
import com.sinc.enhanced.data.local.dao.RecommendationDao
import com.sinc.enhanced.data.local.entity.PlayCountEntity
import com.sinc.enhanced.data.local.entity.UserGenreEntity
import com.sinc.enhanced.data.remote.ApiClient
import com.sinc.enhanced.data.remote.GenreAffinityPayload
import com.sinc.enhanced.data.remote.PlayCountPayload
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class RecommendationSyncManager(
    private val apiClient: ApiClient,
    private val recommendationDao: RecommendationDao
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val _isSyncing = MutableStateFlow(false)
    val isSyncing: StateFlow<Boolean> = _isSyncing.asStateFlow()

    private var pendingPlayPush = mutableListOf<PlayCountPayload>()
    private var pendingGenrePush = mutableListOf<GenreAffinityPayload>()
    private var debounceJob: kotlinx.coroutines.Job? = null

    fun pullFromServer() {
        scope.launch {
            try {
                _isSyncing.value = true
                pullPlayCounts()
                pullGenreAffinities()
            } catch (e: Exception) {
                Log.e("RecSync", "Pull failed", e)
            } finally {
                _isSyncing.value = false
            }
        }
    }

    fun pushPlay(trackId: String, artist: String, title: String, count: Int, lastPlayed: Long) {
        synchronized(pendingPlayPush) {
            pendingPlayPush.add(PlayCountPayload(trackId, artist, title, count, lastPlayed))
        }
        schedulePush()
    }

    fun pushGenre(genre: String, affinity: Float) {
        synchronized(pendingGenrePush) {
            pendingGenrePush.add(GenreAffinityPayload(genre, affinity))
        }
        schedulePush()
    }

    private fun schedulePush() {
        debounceJob?.cancel()
        debounceJob = scope.launch {
            kotlinx.coroutines.delay(5000)
            flushPending()
        }
    }

    private suspend fun flushPending() {
        val plays: List<PlayCountPayload>
        val genres: List<GenreAffinityPayload>
        synchronized(pendingPlayPush) {
            plays = pendingPlayPush.toList()
            pendingPlayPush.clear()
        }
        synchronized(pendingGenrePush) {
            genres = pendingGenrePush.toList()
            pendingGenrePush.clear()
        }
        try {
            _isSyncing.value = true
            if (plays.isNotEmpty()) apiClient.syncPlays(plays)
            if (genres.isNotEmpty()) apiClient.syncGenres(genres)
        } catch (e: Exception) {
            Log.e("RecSync", "Push failed", e)
            synchronized(pendingPlayPush) { pendingPlayPush.addAll(0, plays) }
            synchronized(pendingGenrePush) { pendingGenrePush.addAll(0, genres) }
        } finally {
            _isSyncing.value = false
        }
    }

    private suspend fun pullPlayCounts() {
        val serverPlays = apiClient.getPlays() ?: return
        for (p in serverPlays) {
            recommendationDao.recordPlay(PlayCountEntity(
                trackId = p.trackId,
                artist = p.artist,
                title = p.title,
                count = p.count,
                lastPlayed = p.lastPlayed
            ))
        }
    }

    private suspend fun pullGenreAffinities() {
        val serverGenres = apiClient.getGenres() ?: return
        for (g in serverGenres) {
            recommendationDao.recordGenreInteraction(g.genre, g.affinity)
        }
    }

    fun onCleared() {
        scope.cancel()
    }
}
