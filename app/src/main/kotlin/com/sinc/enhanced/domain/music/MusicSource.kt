package com.sinc.enhanced.domain.music

import com.sinc.enhanced.data.model.Album
import com.sinc.enhanced.data.model.Artist
import com.sinc.enhanced.data.model.Track

data class SearchResult(
    val track: Track,
    val audioUrl: String?,
    val audioSource: String?,
    val confidence: Float = 0f
)

interface MusicSource {
    val name: String
    suspend fun search(query: String, limit: Int): List<SearchResult>
    suspend fun resolveAudioUrl(track: Track): Pair<String, String>?
    suspend fun getTrack(trackId: String): Track?
    suspend fun searchArtists(query: String): List<Artist>
    suspend fun getArtist(artistId: String): Artist?
    suspend fun getArtistTopTracks(artistId: String): List<Track>
    suspend fun getRelatedArtists(artistId: String): List<Artist>
    suspend fun searchAlbums(query: String): List<Album>
    suspend fun getAlbum(albumId: String): Album?
}
