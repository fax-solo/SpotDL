package com.sinc.enhanced.domain.repository

import com.sinc.enhanced.data.remote.LyricsClient

interface LyricsRepository {
    suspend fun getLyrics(artist: String, title: String, album: String?): LyricsClient.LyricsResult?
}
