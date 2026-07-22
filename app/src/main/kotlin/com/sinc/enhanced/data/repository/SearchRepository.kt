package com.sinc.enhanced.data.repository

import com.sinc.enhanced.data.model.Album
import com.sinc.enhanced.data.model.Track
import com.sinc.enhanced.data.remote.AudiusClient
import com.sinc.enhanced.data.remote.BandcampClient
import com.sinc.enhanced.data.remote.DeezerClient
import com.sinc.enhanced.data.remote.FreeMusicArchiveClient
import com.sinc.enhanced.data.remote.JamendoClient
import com.sinc.enhanced.data.remote.PipedClient
import com.sinc.enhanced.data.remote.SoundCloudClient
import com.sinc.enhanced.data.remote.SpotifyClient
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.withContext
import kotlin.math.abs

class SearchRepository(
    private val spotifyClient: SpotifyClient,
    private val pipedClient: PipedClient,
    private val deezerClient: DeezerClient,
    private val soundCloudClient: SoundCloudClient,
    private val audiusClient: AudiusClient,
    private val jamendoClient: JamendoClient,
    private val fmaClient: FreeMusicArchiveClient,
    private val bandcampClient: BandcampClient
) {

    data class EnrichedTrack(
        val track: Track,
        val audioUrl: String?,
        val audioSource: String?,
        val confidence: Float = 0f
    )

    suspend fun searchAll(query: String): List<EnrichedTrack> = withContext(Dispatchers.IO) {
        try {
            val spotifyTracks = spotifyClient.searchTracks(query)
            val spotifyEnriched = if (spotifyTracks.isNotEmpty()) {
                spotifyTracks.map { track ->
                    async {
                        val bestAudio = findBestAudioForTrack(track)
                        EnrichedTrack(
                            track = track,
                            audioUrl = bestAudio?.first,
                            audioSource = bestAudio?.second,
                            confidence = if (bestAudio != null) 1.0f else 0.5f
                        )
                    }
                }.awaitAll()
            } else emptyList()

            val additionalDeferred = listOf(
                async { searchAudius(query) },
                async { searchJamendo(query) },
                async { searchFma(query) },
                async { searchSoundCloud(query) },
                async { searchBandcamp(query) }
            )
            val additional = additionalDeferred.awaitAll().flatten()

            val seenIds = mutableSetOf<String>()
            (spotifyEnriched + additional).filter { enriched ->
                val key = enriched.track.id
                if (key in seenIds) false else {
                    seenIds.add(key)
                    true
                }
            }.sortedByDescending { it.confidence }
        } catch (_: Exception) { emptyList() }
    }

    suspend fun searchYouTubeOnly(query: String): List<EnrichedTrack> = withContext(Dispatchers.IO) {
        try {
            val results = pipedClient.search(query)
            results.mapNotNull { yt ->
                val stream = pipedClient.getStreams(yt.videoId)
                if (stream != null) {
                    val audioUrl = stream.audioTrackUrl ?: stream.url
                    if (audioUrl.isEmpty()) return@mapNotNull null
                    EnrichedTrack(
                        track = Track(
                            id = "yt_${yt.videoId}",
                            title = yt.title,
                            artist = yt.uploader,
                            album = yt.uploader,
                            durationMs = yt.duration * 1000,
                            artworkUrl = yt.thumbnailUrl,
                            source = "youtube"
                        ),
                        audioUrl = audioUrl,
                        audioSource = "youtube",
                        confidence = 1.0f
                    )
                } else null
            }
        } catch (_: Exception) { emptyList() }
    }

    private suspend fun searchSoundCloud(query: String): List<EnrichedTrack> {
        return try {
            soundCloudClient.search(query, limit = 3).map { sc ->
                val track = Track(
                    id = "sc_${sc.trackId}",
                    title = sc.title,
                    artist = sc.uploader,
                    album = sc.uploader,
                    durationMs = sc.duration * 1000,
                    artworkUrl = sc.thumbnailUrl,
                    source = "soundcloud"
                )
                val bestAudio = findBestAudioForTrack(track)
                EnrichedTrack(
                    track = track,
                    audioUrl = bestAudio?.first,
                    audioSource = bestAudio?.second ?: "soundcloud",
                    confidence = if (bestAudio != null) 0.9f else 0.6f
                )
            }
        } catch (_: Exception) { emptyList() }
    }

    private suspend fun searchAudius(query: String): List<EnrichedTrack> {
        return try {
            audiusClient.search(query, limit = 3).mapNotNull { a ->
                val streamUrl = a.streamUrl
                if (streamUrl == null) return@mapNotNull null
                val track = Track(
                    id = "aud_${a.id}",
                    title = a.title,
                    artist = a.artist,
                    album = a.artist,
                    durationMs = a.duration * 1000,
                    artworkUrl = a.artworkUrl,
                    source = "audius"
                )
                EnrichedTrack(
                    track = track,
                    audioUrl = streamUrl,
                    audioSource = "audius",
                    confidence = 0.8f
                )
            }
        } catch (_: Exception) { emptyList() }
    }

    private suspend fun searchJamendo(query: String): List<EnrichedTrack> {
        return try {
            jamendoClient.search(query, limit = 3).mapNotNull { j ->
                if (j.audioUrl == null) return@mapNotNull null
                val track = Track(
                    id = "jam_${j.id}",
                    title = j.title,
                    artist = j.artist,
                    album = j.album,
                    durationMs = j.duration * 1000L,
                    artworkUrl = j.artworkUrl,
                    source = "jamendo"
                )
                EnrichedTrack(
                    track = track,
                    audioUrl = j.audioUrl,
                    audioSource = "jamendo",
                    confidence = 0.8f
                )
            }
        } catch (_: Exception) { emptyList() }
    }

    private suspend fun searchFma(query: String): List<EnrichedTrack> {
        return try {
            fmaClient.search(query, limit = 3).mapNotNull { f ->
                if (f.audioUrl == null) return@mapNotNull null
                val track = Track(
                    id = "fma_${f.id}",
                    title = f.title,
                    artist = f.artist,
                    album = f.album ?: f.artist,
                    durationMs = f.duration * 1000,
                    artworkUrl = f.artworkUrl,
                    source = "fma"
                )
                EnrichedTrack(
                    track = track,
                    audioUrl = f.audioUrl,
                    audioSource = "fma",
                    confidence = 0.8f
                )
            }
        } catch (_: Exception) { emptyList() }
    }

    private suspend fun searchBandcamp(query: String): List<EnrichedTrack> {
        return try {
            bandcampClient.search(query, limit = 3).map { bc ->
                val track = Track(
                    id = "bc_${bc.id}",
                    title = bc.title,
                    artist = bc.artist,
                    album = bc.album ?: bc.artist,
                    durationMs = (bc.duration ?: 0L) * 1000,
                    artworkUrl = bc.artworkUrl,
                    source = "bandcamp"
                )
                val bestAudio = findBestAudioForTrack(track)
                EnrichedTrack(
                    track = track,
                    audioUrl = bestAudio?.first,
                    audioSource = bestAudio?.second ?: "bandcamp",
                    confidence = if (bestAudio != null) 0.7f else 0.5f
                )
            }
        } catch (_: Exception) { emptyList() }
    }

    private suspend fun findBestAudioForTrack(track: Track): Pair<String, String>? {
        val query = "${track.title} ${track.artist}"
        val durationSec = track.durationMs / 1000

        try {
            val pipedResults = pipedClient.search(query, limit = 3)
            for (result in pipedResults) {
                if (durationSec > 0) {
                    val diff = abs(result.duration - durationSec)
                    if (diff > 30) continue
                }
                val stream = pipedClient.getStreams(result.videoId)
                if (stream != null) {
                    val audioUrl = stream.audioTrackUrl ?: stream.url
                    if (audioUrl.isNotEmpty()) {
                        return Pair(audioUrl, "piped")
                    }
                }
            }
        } catch (_: Exception) { }

        try {
            val deezerResults = deezerClient.searchTracks(query, limit = 3)
            val bestMatch = deezerResults.minByOrNull {
                if (durationSec > 0) abs(it.duration - durationSec.toInt()) else 0
            }
            if (bestMatch?.previewUrl != null && bestMatch.previewUrl.isNotEmpty()) {
                return Pair(bestMatch.previewUrl, "deezer")
            }
        } catch (_: Exception) { }

        return null
    }

    fun searchAlbums(query: String): List<Album> {
        return spotifyClient.searchAlbums(query)
    }

    fun getAlbum(albumId: String): Album? {
        return spotifyClient.getAlbum(albumId)
    }
}
