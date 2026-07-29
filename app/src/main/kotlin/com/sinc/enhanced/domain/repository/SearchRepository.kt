package com.sinc.enhanced.domain.repository

import com.sinc.enhanced.data.model.Album
import com.sinc.enhanced.data.model.Artist
import com.sinc.enhanced.data.model.Track
import com.sinc.enhanced.data.repository.QueryType
import com.sinc.enhanced.domain.music.SearchResult
import kotlinx.coroutines.flow.Flow

interface SearchRepository {
    suspend fun searchAll(query: String): List<SearchResult>
    suspend fun searchYouTubeOnly(query: String): List<SearchResult>
    suspend fun findBestAudioForTrack(track: Track): Pair<String, String>?
    suspend fun searchAlbums(query: String): List<Album>
    suspend fun getAlbum(albumId: String): Album?
    suspend fun searchArtists(query: String): List<Artist>
    suspend fun getArtist(artistId: String): Artist?
    suspend fun getArtistTopTracks(artistId: String): List<Track>
    suspend fun getRelatedArtists(artistId: String): List<Artist>
    suspend fun getTrack(trackId: String): Track?
    fun searchAllStreaming(query: String): Flow<List<SearchResult>>
    fun invalidateCache()
    fun classifyQuery(query: String): QueryType
}
