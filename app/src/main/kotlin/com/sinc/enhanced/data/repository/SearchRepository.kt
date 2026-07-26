package com.sinc.enhanced.data.repository

import android.util.Log
import com.sinc.enhanced.data.model.Album
import com.sinc.enhanced.data.model.Artist
import com.sinc.enhanced.data.model.Track
import com.sinc.enhanced.data.local.SettingsManager
import com.sinc.enhanced.data.remote.AudiusClient
import com.sinc.enhanced.data.remote.BandcampClient
import com.sinc.enhanced.data.remote.DeezerClient
import com.sinc.enhanced.data.remote.FreeMusicArchiveClient
import com.sinc.enhanced.data.remote.JamendoClient
import com.sinc.enhanced.data.remote.PipedClient
import com.sinc.enhanced.data.remote.SoundCloudClient
import com.sinc.enhanced.data.remote.SpotifyClient
import com.sinc.enhanced.data.util.MatchScorer
import com.sinc.enhanced.data.util.MatchScorer.MatchOptions
import com.sinc.enhanced.data.util.SearchCache
import com.sinc.enhanced.data.util.robustCall
import com.sinc.enhanced.domain.music.SearchResult
import com.sinc.enhanced.domain.repository.SearchRepository as SearchRepositoryInterface
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout

enum class QueryType { ARTIST, TRACK, ALBUM, GENERIC }

class SearchRepository(
    private val spotifyClient: SpotifyClient,
    private val pipedClient: PipedClient,
    private val deezerClient: DeezerClient,
    private val soundCloudClient: SoundCloudClient,
    private val audiusClient: AudiusClient,
    private val jamendoClient: JamendoClient,
    private val fmaClient: FreeMusicArchiveClient,
    private val bandcampClient: BandcampClient,
    private val settingsManager: SettingsManager
) : SearchRepositoryInterface {
    private val cache = SearchCache<SearchResult>()
    private val enrichedCache = SearchCache<EnrichedTrack>()

    data class EnrichedTrack(
        val track: Track,
        val audioUrl: String?,
        val audioSource: String?,
        val confidence: Float = 0f
    )

    private fun List<EnrichedTrack>.asResults() = map { SearchResult(it.track, it.audioUrl, it.audioSource, it.confidence) }

    private suspend fun resolveAudioParallel(tracks: List<Track>, timeoutMs: Long = 15000L): Map<String, EnrichedTrack> = coroutineScope {
        tracks.map { track ->
            async {
                try {
                    withTimeout(timeoutMs) { findBestAudioForTrack(track) }
                } catch (_: Exception) { null }
            }
        }.awaitAll().mapIndexedNotNull { i, result ->
            if (result != null) tracks[i].id to EnrichedTrack(tracks[i], result.first, result.second, 1.0f)
            else null
        }.toMap()
    }

    override suspend fun searchAll(query: String): List<SearchResult> = searchAllInternal(query).asResults()

    private suspend fun searchAllInternal(query: String): List<EnrichedTrack> = withContext(Dispatchers.IO) {
        val normalized = query.trim()
        if (normalized.isEmpty()) return@withContext emptyList()

        enrichedCache.get(normalized)?.let { return@withContext it }

        try {
            withTimeout(90000L) { searchAllUncached(normalized) }
        } catch (e: TimeoutCancellationException) {
            Log.e("SearchRepository", "searchAllInternal timeout", e); emptyList()
        }
    }

    private suspend fun searchAllUncached(normalized: String): List<EnrichedTrack> = withContext(Dispatchers.IO) {

        val audiusOn = settingsManager.audiusEnabled.first()
        val jamendoOn = settingsManager.jamendoEnabled.first()
        val fmaOn = settingsManager.fmaEnabled.first()
        val bandcampOn = settingsManager.bandcampEnabled.first()

        val spotifyDeferred = async { robustCall(label = "spotify") { spotifyClient.searchTracks(normalized) } }
        val pipedDeferred = async { robustCall(label = "piped") { pipedClient.search(normalized, limit = 10) } }
        val deezerDeferred = async { robustCall(label = "deezer") { deezerClient.searchTracks(normalized) } }

        val additionalDeferred = async {
            val deferreds = mutableListOf<kotlinx.coroutines.Deferred<List<EnrichedTrack>?>>()
            if (audiusOn) deferreds.add(async { robustCall(label = "audius") { searchAudius(normalized) } })
            if (jamendoOn) deferreds.add(async { robustCall(label = "jamendo") { searchJamendo(normalized) } })
            if (fmaOn) deferreds.add(async { robustCall(label = "fma") { searchFma(normalized) } })
            deferreds.add(async { robustCall(label = "soundcloud") { searchSoundCloud(normalized) } })
            if (bandcampOn) deferreds.add(async { robustCall(label = "bandcamp") { searchBandcamp(normalized) } })
            deferreds.awaitAll().filterNotNull().flatten()
        }

        val spotifyTracks = spotifyDeferred.await() ?: emptyList()
        val pipedResults = pipedDeferred.await() ?: emptyList()
        val deezerResults = deezerDeferred.await() ?: emptyList()
        val additional = additionalDeferred.await()

        val deezerTracks = deezerResults.take(3).map { d ->
            Track(id = "dz_${d.id}", title = d.title, artist = d.artist, album = d.album,
                durationMs = d.duration * 1000L, artworkUrl = d.artworkUrl, isrc = d.isrc, source = "deezer")
        }
        val deezerResolved = resolveAudioParallel(deezerTracks)
        val deezerEnriched = deezerResults.map { d ->
            val id = "dz_${d.id}"
            deezerResolved[id] ?: EnrichedTrack(
                Track(id = id, title = d.title, artist = d.artist, album = d.album,
                    durationMs = d.duration * 1000L, artworkUrl = d.artworkUrl, isrc = d.isrc, source = "deezer"),
                null, null, 0.4f
            )
        }

        val spotifyTop = spotifyTracks.take(5)
        val spotifyResolved = resolveAudioParallel(spotifyTop)
        val spotifyEnriched = spotifyTracks.map { track ->
            spotifyResolved[track.id] ?: EnrichedTrack(track, null, null, 0.5f)
        }

        val youtubeResults = pipedResults.mapNotNull { yt ->
            try {
                val stream = robustCall(timeoutMs = 10000, label = "yt_stream") { pipedClient.getStreams(yt.videoId) }
                if (stream != null) {
                    val audioUrl = stream.audioTrackUrl ?: stream.url
                    if (audioUrl.isEmpty()) return@mapNotNull null
                    EnrichedTrack(
                        track = Track(id = "yt_${yt.videoId}", title = yt.title, artist = yt.uploader,
                            album = yt.uploader, durationMs = yt.duration * 1000, artworkUrl = yt.thumbnailUrl, source = "youtube"),
                        audioUrl = audioUrl, audioSource = "youtube", confidence = 0.9f
                    )
                } else null
            } catch (e: Exception) { Log.e("SearchRepository", "youtube stream failed", e); null }
        }

        val seenIds = mutableSetOf<String>()
        val seenTitleArtist = mutableSetOf<String>()
        val all = spotifyEnriched + deezerEnriched + youtubeResults + additional
        val results = all.filter { enriched ->
            val idKey = enriched.track.id
            if (idKey in seenIds) return@filter false
            val taKey = "${enriched.track.title.lowercase().trim()}|${enriched.track.artist.lowercase().trim()}"
            if (taKey in seenTitleArtist) return@filter false
            seenIds.add(idKey)
            seenTitleArtist.add(taKey)
            true
        }.sortedByDescending { e -> e.confidence }

        enrichedCache.put(normalized, results)
        results
    }

    override suspend fun searchYouTubeOnly(query: String): List<SearchResult> = searchYouTubeOnlyInternal(query).asResults()

    private suspend fun searchYouTubeOnlyInternal(query: String): List<EnrichedTrack> = withContext(Dispatchers.IO) {
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
            } catch (e: Exception) { Log.e("SearchRepository", "searchYouTubeOnly stream failed", e); null }
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

    private data class AudioCandidate(
        val audioUrl: String,
        val source: String,
        val score: Float,
        val isPreview: Boolean = false
    )

    private fun generateQueries(artist: String, title: String): List<String> {
        return listOfNotNull(
            if (artist.isNotBlank()) "$artist - $title" else title,
            if (artist.isNotBlank()) "$artist $title" else null,
            title
        ).distinct().filter { it.length > 2 }
    }

    override suspend fun findBestAudioForTrack(track: Track): Pair<String, String>? = withContext(Dispatchers.IO) {
        try {
            withTimeout(35000L) {
                val expectedDurationSec = if (track.durationMs > 0) track.durationMs / 1000 else null
                val queries = generateQueries(track.artist, track.title)
                val isrc = track.isrc

                for (query in queries) {
                    val result = tryResolveAudio(query, track.title, track.artist, expectedDurationSec, isrc)
                    if (result != null) return@withTimeout result
                }

                val stripped = queries.map { MatchScorer.stripQueryNoise(it) }
                    .filter { it.length > 2 }
                    .distinct()
                    .filter { it !in queries }
                for (query in stripped) {
                    val result = tryResolveAudio(query, track.title, track.artist, expectedDurationSec, isrc)
                    if (result != null) return@withTimeout result
                }

                if (isrc != null) {
                    try {
                        val deezerTrack = deezerClient.getTrackByIsrc(isrc)
                        if (deezerTrack?.previewUrl != null) {
                            return@withTimeout Pair(deezerTrack.previewUrl, "deezer")
                        }
                    } catch (_: Exception) {}
                }

                if (track.previewUrl != null && isValidPreviewUrl(track.previewUrl)) {
                    return@withTimeout Pair(track.previewUrl, track.source)
                }

                null
            }
        } catch (e: TimeoutCancellationException) {
            Log.e("SearchRepository", "findBestAudioForTrack timeout", e); null
        }
    }

    private fun isValidPreviewUrl(url: String?): Boolean {
        return url != null && url.isNotEmpty() && (url.startsWith("http://") || url.startsWith("https://"))
    }

    private suspend fun tryResolveAudio(
        query: String,
        expectedTitle: String,
        expectedArtist: String,
        expectedDurationSec: Long?,
        expectedIsrc: String?
    ): Pair<String, String>? {
        val candidates = mutableListOf<AudioCandidate>()

        if (expectedIsrc != null) {
            try {
                val deezerTrack = deezerClient.getTrackByIsrc(expectedIsrc)
                if (deezerTrack?.previewUrl != null) {
                    val score = MatchScorer.computeScore(MatchOptions(
                        expectedTitle = expectedTitle,
                        expectedArtist = expectedArtist,
                        foundTitle = deezerTrack.title,
                        foundAuthor = deezerTrack.artist,
                        foundDurationSec = deezerTrack.duration.toLong(),
                        expectedDurationSec = expectedDurationSec,
                        expectedIsrc = expectedIsrc,
                        foundIsrc = deezerTrack.isrc
                    ))
                    candidates.add(AudioCandidate(deezerTrack.previewUrl, "deezer", score, isPreview = true))
                    if (score >= MatchScorer.GOOD_CONFIDENCE) {
                        return Pair(deezerTrack.previewUrl, "deezer")
                    }
                }
            } catch (e: Exception) { Log.e("SearchRepository", "deezer isrc resolve failed", e) }
        }

        try {
            val pipedResults = pipedClient.search(query, limit = 5, filter = "music")
            val musicResolved = if (pipedResults.isNotEmpty()) {
                pipedResults.mapNotNull { pr ->
                    try {
                        val stream = pipedClient.getStreams(pr.videoId)
                        if (stream != null) {
                            val audioUrl = stream.audioTrackUrl ?: stream.url
                            if (audioUrl.isNotEmpty()) Pair(pr, audioUrl) else null
                        } else null
                    } catch (e: Exception) { Log.e("SearchRepository", "piped stream resolve failed", e); null }
                }
            } else emptyList()

            if (musicResolved.isNotEmpty()) {
                for ((pr, audioUrl) in musicResolved) {
                    val score = MatchScorer.computeScore(MatchOptions(
                        expectedTitle = expectedTitle,
                        expectedArtist = expectedArtist,
                        foundTitle = pr.title,
                        foundAuthor = pr.uploader,
                        foundDurationSec = pr.duration,
                        expectedDurationSec = expectedDurationSec,
                        expectedIsrc = expectedIsrc
                    ))
                    candidates.add(AudioCandidate(audioUrl, "piped", score))
                    val durOk = expectedDurationSec == null || kotlin.math.abs(pr.duration - expectedDurationSec) <= 30
                    if (score >= MatchScorer.GOOD_CONFIDENCE && durOk) {
                        return Pair(audioUrl, "piped")
                    }
                }
            }

            if (musicResolved.isEmpty()) {
                val fallbackResults = pipedClient.search(query, limit = 5, filter = null)
                if (fallbackResults.isNotEmpty()) {
                    val streams = fallbackResults.mapNotNull { pr ->
                        try {
                            val stream = pipedClient.getStreams(pr.videoId)
                            if (stream != null) {
                                val audioUrl = stream.audioTrackUrl ?: stream.url
                                if (audioUrl.isNotEmpty()) {
                                    val score = MatchScorer.computeScore(MatchOptions(
                                        expectedTitle = expectedTitle,
                                        expectedArtist = expectedArtist,
                                        foundTitle = pr.title,
                                        foundAuthor = pr.uploader,
                                        foundDurationSec = pr.duration,
                                        expectedDurationSec = expectedDurationSec,
                                        expectedIsrc = expectedIsrc
                                    ))
                                    pr to AudioCandidate(audioUrl, "piped", score)
                                } else null
                            } else null
                        } catch (e: Exception) { Log.e("SearchRepository", "piped stream failed", e); null }
                    }
                    candidates.addAll(streams.map { it.second })

                    val goodPiped = streams.firstOrNull { (pr, _) ->
                        val durOk = expectedDurationSec == null || kotlin.math.abs(pr.duration - expectedDurationSec) <= 30
                        durOk
                    }?.second

                    val goodMatch = candidates.filter { !it.isPreview && it.score >= MatchScorer.GOOD_CONFIDENCE }
                        .maxByOrNull { it.score }
                    if (goodMatch != null) return goodMatch.let { Pair(it.audioUrl, it.source) }

                    if (goodPiped != null) return Pair(goodPiped.audioUrl, goodPiped.source)
                }
            }
        } catch (e: Exception) { Log.e("SearchRepository", "piped resolve failed", e) }

        try {
            val audiusResults = audiusClient.search(query, limit = 3)
            for (ar in audiusResults) {
                if (ar.streamUrl != null) {
                    val score = MatchScorer.computeScore(MatchOptions(
                        expectedTitle = expectedTitle,
                        expectedArtist = expectedArtist,
                        foundTitle = ar.title,
                        foundAuthor = ar.artist,
                        foundDurationSec = ar.duration,
                        expectedDurationSec = expectedDurationSec,
                        expectedIsrc = expectedIsrc
                    ))
                    candidates.add(AudioCandidate(ar.streamUrl, "audius", score))
                }
            }
        } catch (e: Exception) { Log.e("SearchRepository", "audius resolve failed", e) }

        try {
            val jamendoResults = jamendoClient.search(query, limit = 3)
            for (jr in jamendoResults) {
                if (jr.audioUrl != null) {
                    val score = MatchScorer.computeScore(MatchOptions(
                        expectedTitle = expectedTitle,
                        expectedArtist = expectedArtist,
                        foundTitle = jr.title,
                        foundAuthor = jr.artist,
                        foundDurationSec = jr.duration.toLong(),
                        expectedDurationSec = expectedDurationSec,
                        expectedIsrc = expectedIsrc
                    ))
                    candidates.add(AudioCandidate(jr.audioUrl, "jamendo", score))
                }
            }
        } catch (e: Exception) { Log.e("SearchRepository", "jamendo resolve failed", e) }

        try {
            val fmaResults = fmaClient.search(query, limit = 3)
            for (fr in fmaResults) {
                if (fr.audioUrl != null) {
                    val score = MatchScorer.computeScore(MatchOptions(
                        expectedTitle = expectedTitle,
                        expectedArtist = expectedArtist,
                        foundTitle = fr.title,
                        foundAuthor = fr.artist,
                        foundDurationSec = fr.duration,
                        expectedDurationSec = expectedDurationSec,
                        expectedIsrc = expectedIsrc
                    ))
                    candidates.add(AudioCandidate(fr.audioUrl, "fma", score))
                }
            }
        } catch (e: Exception) { Log.e("SearchRepository", "fma resolve failed", e) }

        return candidates.filter { !it.isPreview && it.score >= MatchScorer.GOOD_CONFIDENCE }
            .maxByOrNull { it.score }
            ?.let { Pair(it.audioUrl, it.source) }
            ?: candidates.filter { it.score >= MatchScorer.MIN_CONFIDENCE }
                .maxByOrNull { it.score }
                ?.let { Pair(it.audioUrl, it.source) }
            ?: candidates.maxByOrNull { it.score }
                ?.let { Pair(it.audioUrl, it.source) }
    }

    override fun invalidateCache() {
        cache.invalidateAll()
        enrichedCache.invalidateAll()
    }

    override suspend fun searchAlbums(query: String): List<Album> = withContext(Dispatchers.IO) {
        robustCall(label = "spotify_albums") { spotifyClient.searchAlbums(query) } ?: emptyList()
    }

    override suspend fun getAlbum(albumId: String): Album? = withContext(Dispatchers.IO) {
        robustCall(label = "spotify_album") { spotifyClient.getAlbum(albumId) }
    }

    fun classifyQuery(query: String): QueryType {
        val lower = query.lowercase().trim()
        if (lower.contains(" by ") || lower.endsWith(" by")) return QueryType.TRACK
        if (lower.startsWith("artist ") || lower.startsWith("singer ")) return QueryType.ARTIST
        if (lower.startsWith("album ")) return QueryType.ALBUM
        val wordCount = lower.split(Regex("\\s+")).size
        if (wordCount <= 2) return QueryType.ARTIST
        if (wordCount == 3) {
            val commonTracks = setOf("let it be", "hey jude", "billie jean", "shape of you",
                "bad guy", "rolling deep", "bohemian rhapsody", "stairway to heaven",
                "smells like teen", "welcome to the", "hotel california", "sweet child mine",
                "back in black", "thunderstruck", "enter sandman", "nothing else matters",
                "peace sells", "master of puppets", "one more time")
            if (lower in commonTracks) return QueryType.TRACK
        }
        return QueryType.GENERIC
    }

    override suspend fun searchArtists(query: String): List<Artist> = withContext(Dispatchers.IO) {
        robustCall(label = "spotify_artists") { spotifyClient.searchArtists(query) } ?: emptyList()
    }

    override suspend fun getArtist(artistId: String): Artist? = withContext(Dispatchers.IO) {
        robustCall(label = "spotify_artist") { spotifyClient.getArtist(artistId) }
    }

    override suspend fun getArtistTopTracks(artistId: String): List<Track> = withContext(Dispatchers.IO) {
        robustCall(label = "spotify_top_tracks") { spotifyClient.getArtistTopTracks(artistId) } ?: emptyList()
    }

    override suspend fun getRelatedArtists(artistId: String): List<Artist> = withContext(Dispatchers.IO) {
        robustCall(label = "spotify_related") { spotifyClient.getRelatedArtists(artistId) } ?: emptyList()
    }

    override suspend fun getTrack(trackId: String): Track? = withContext(Dispatchers.IO) {
        robustCall(label = "spotify_track") { spotifyClient.getTrack(trackId) }
    }
}
