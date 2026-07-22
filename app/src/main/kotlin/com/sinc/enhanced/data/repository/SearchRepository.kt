package com.sinc.enhanced.data.repository

import com.sinc.enhanced.data.model.Album
import com.sinc.enhanced.data.model.Artist
import com.sinc.enhanced.data.model.Track
import com.sinc.enhanced.data.remote.AudiusClient
import com.sinc.enhanced.data.remote.BandcampClient
import com.sinc.enhanced.data.remote.DeezerClient
import com.sinc.enhanced.data.remote.FreeMusicArchiveClient
import com.sinc.enhanced.data.remote.JamendoClient
import com.sinc.enhanced.data.remote.PipedClient
import com.sinc.enhanced.data.remote.SoundCloudClient
import com.sinc.enhanced.data.remote.SpotifyClient
import com.sinc.enhanced.data.util.SearchCache
import com.sinc.enhanced.data.util.robustCall
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.withContext
import kotlin.math.abs

enum class QueryType { ARTIST, TRACK, ALBUM, GENERIC }

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
    private val cache = SearchCache()

    data class EnrichedTrack(
        val track: Track,
        val audioUrl: String?,
        val audioSource: String?,
        val confidence: Float = 0f
    )

    suspend fun searchAll(query: String): List<EnrichedTrack> = withContext(Dispatchers.IO) {
        val normalized = query.trim()
        if (normalized.isEmpty()) return@withContext emptyList()

        cache.get(normalized)?.let { return@withContext it }

        val spotifyDeferred = async { robustCall(label = "spotify") { spotifyClient.searchTracks(normalized) } }
        val pipedDeferred = async { robustCall(label = "piped") { pipedClient.search(normalized, limit = 5) } }
        val deezerDeferred = async { robustCall(label = "deezer") { deezerClient.searchTracks(normalized) } }

        val additionalDeferred = async {
            val deferreds: List<kotlinx.coroutines.Deferred<List<EnrichedTrack>?>> = listOf(
                async { robustCall(label = "audius") { searchAudius(normalized) } },
                async { robustCall(label = "jamendo") { searchJamendo(normalized) } },
                async { robustCall(label = "fma") { searchFma(normalized) } },
                async { robustCall(label = "soundcloud") { searchSoundCloud(normalized) } },
                async { robustCall(label = "bandcamp") { searchBandcamp(normalized) } }
            )
            deferreds.awaitAll().filterNotNull().flatten()
        }

        val spotifyTracks = spotifyDeferred.await() ?: emptyList()
        val pipedResults = pipedDeferred.await() ?: emptyList()
        val deezerResults = deezerDeferred.await() ?: emptyList()
        val additional = additionalDeferred.await()

        val deezerEnriched = deezerResults.map { d ->
            EnrichedTrack(
                track = Track(
                    id = "dz_${d.id}",
                    title = d.title,
                    artist = d.artist,
                    album = d.album,
                    durationMs = d.duration * 1000L,
                    artworkUrl = d.artworkUrl,
                    isrc = d.isrc,
                    previewUrl = d.previewUrl,
                    source = "deezer"
                ),
                audioUrl = d.previewUrl,
                audioSource = "deezer",
                confidence = 0.7f
            )
        }

        val spotifyEnriched = if (spotifyTracks.isNotEmpty()) {
            spotifyTracks.mapNotNull { track ->
                val bestAudio = findBestAudioForTrack(track)
                if (bestAudio != null) {
                    EnrichedTrack(
                        track = track,
                        audioUrl = bestAudio.first,
                        audioSource = bestAudio.second,
                        confidence = 1.0f
                    )
                } else {
                    EnrichedTrack(track = track, audioUrl = null, audioSource = null, confidence = 0.5f)
                }
            }
        } else emptyList()

        val youtubeResults = pipedResults.mapNotNull { yt ->
            try {
                val stream = robustCall(timeoutMs = 10000, label = "yt_stream") { pipedClient.getStreams(yt.videoId) }
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
                        confidence = 0.9f
                    )
                } else null
            } catch (_: Exception) { null }
        }

        val seenIds = mutableSetOf<String>()
        val all = spotifyEnriched + deezerEnriched + youtubeResults + additional
        val results = all.filter { enriched ->
            val key = enriched.track.id
            if (key in seenIds) false else {
                seenIds.add(key)
                true
            }
        }.sortedByDescending { e -> e.confidence }

        cache.put(normalized, results)
        results
    }

    suspend fun searchYouTubeOnly(query: String): List<EnrichedTrack> = withContext(Dispatchers.IO) {
        val results = robustCall(label = "piped_search") { pipedClient.search(query) } ?: return@withContext emptyList()
        results.mapNotNull { yt ->
            try {
                val stream = robustCall(timeoutMs = 10000, label = "piped_stream") { pipedClient.getStreams(yt.videoId) }
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
            } catch (_: Exception) { null }
        }
    }

    private suspend fun searchSoundCloud(query: String): List<EnrichedTrack> {
        val results = robustCall(label = "soundcloud") { soundCloudClient.search(query, limit = 3) } ?: return emptyList()
        return results.map { sc ->
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
    }

    private suspend fun searchAudius(query: String): List<EnrichedTrack> {
        val results = robustCall(label = "audius") { audiusClient.search(query, limit = 3) } ?: return emptyList()
        return results.mapNotNull { a ->
            if (a.streamUrl == null) return@mapNotNull null
            val track = Track(
                id = "aud_${a.id}",
                title = a.title,
                artist = a.artist,
                album = a.artist,
                durationMs = a.duration * 1000,
                artworkUrl = a.artworkUrl,
                source = "audius"
            )
            EnrichedTrack(track = track, audioUrl = a.streamUrl, audioSource = "audius", confidence = 0.8f)
        }
    }

    private suspend fun searchJamendo(query: String): List<EnrichedTrack> {
        val results = robustCall(label = "jamendo") { jamendoClient.search(query, limit = 3) } ?: return emptyList()
        return results.mapNotNull { j ->
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
            EnrichedTrack(track = track, audioUrl = j.audioUrl, audioSource = "jamendo", confidence = 0.8f)
        }
    }

    private suspend fun searchFma(query: String): List<EnrichedTrack> {
        val results = robustCall(label = "fma") { fmaClient.search(query, limit = 3) } ?: return emptyList()
        return results.mapNotNull { f ->
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
            EnrichedTrack(track = track, audioUrl = f.audioUrl, audioSource = "fma", confidence = 0.8f)
        }
    }

    private suspend fun searchBandcamp(query: String): List<EnrichedTrack> {
        val results = robustCall(label = "bandcamp") { bandcampClient.search(query, limit = 3) } ?: return emptyList()
        return results.map { bc ->
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
    }

    suspend fun findBestAudioForTrack(track: Track): Pair<String, String>? {
        val query = "${track.title} ${track.artist}"
        val durationSec = if (track.durationMs > 0) track.durationMs / 1000 else null

        val pipedResult = robustCall(timeoutMs = 10000, label = "find_piped") {
            val results = pipedClient.search(query, limit = 5)
            for (result in results) {
                if (durationSec != null) {
                    if (abs(result.duration - durationSec) > 30) continue
                }
                val stream = pipedClient.getStreams(result.videoId)
                if (stream != null) {
                    val audioUrl = stream.audioTrackUrl ?: stream.url
                    if (audioUrl.isNotEmpty()) return@robustCall Pair(audioUrl, "piped")
                }
            }
            null
        }
        if (pipedResult != null) return pipedResult

        val deezerResult = robustCall(timeoutMs = 8000, label = "find_deezer") {
            val results = deezerClient.searchTracks(query, limit = 5)
            val bestMatch = results.minByOrNull {
                if (durationSec != null) abs(it.duration - durationSec.toInt()) else 0
            }
            if (bestMatch?.previewUrl != null && bestMatch.previewUrl.isNotEmpty()) {
                return@robustCall Pair(bestMatch.previewUrl, "deezer")
            }
            null
        }
        return deezerResult
    }

    fun invalidateCache() {
        cache.invalidateAll()
    }

    suspend fun searchAlbums(query: String): List<Album> = withContext(Dispatchers.IO) {
        robustCall(label = "spotify_albums") { spotifyClient.searchAlbums(query) } ?: emptyList()
    }

    suspend fun getAlbum(albumId: String): Album? = withContext(Dispatchers.IO) {
        robustCall(label = "spotify_album") { spotifyClient.getAlbum(albumId) }
    }

    fun classifyQuery(query: String): QueryType {
        val lower = query.lowercase().trim()
        if (lower.contains(" by ") || lower.endsWith(" by")) return QueryType.TRACK
        if (lower.startsWith("artist ") || lower.startsWith("singer ")) return QueryType.ARTIST
        if (lower.startsWith("album ")) return QueryType.ALBUM
        val wordCount = lower.split(Regex("\\s+")).size
        if (wordCount <= 3) return QueryType.ARTIST
        return QueryType.GENERIC
    }

    suspend fun searchArtists(query: String): List<Artist> = withContext(Dispatchers.IO) {
        robustCall(label = "spotify_artists") { spotifyClient.searchArtists(query) } ?: emptyList()
    }

    suspend fun getArtist(artistId: String): Artist? = withContext(Dispatchers.IO) {
        robustCall(label = "spotify_artist") { spotifyClient.getArtist(artistId) }
    }

    suspend fun getArtistTopTracks(artistId: String): List<Track> = withContext(Dispatchers.IO) {
        robustCall(label = "spotify_top_tracks") { spotifyClient.getArtistTopTracks(artistId) } ?: emptyList()
    }

    suspend fun getRelatedArtists(artistId: String): List<Artist> = withContext(Dispatchers.IO) {
        robustCall(label = "spotify_related") { spotifyClient.getRelatedArtists(artistId) } ?: emptyList()
    }

    suspend fun getTrack(trackId: String): Track? = withContext(Dispatchers.IO) {
        robustCall(label = "spotify_track") { spotifyClient.getTrack(trackId) }
    }
}
