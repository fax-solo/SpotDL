package com.sinc.enhanced.data.repository

import android.util.Log
import com.sinc.enhanced.data.local.dao.CacheDao
import com.sinc.enhanced.data.local.entity.CacheEntryEntity
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
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import org.json.JSONArray
import org.json.JSONObject

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
    private val settingsManager: SettingsManager,
    private val cacheDao: CacheDao
) : SearchRepositoryInterface {
    private val cache = SearchCache<SearchResult>()
    private val enrichedCache = SearchCache<EnrichedTrack>()
    private val audioUrlCache = SearchCache<Pair<String, String>>()

    data class EnrichedTrack(
        val track: Track,
        val audioUrl: String?,
        val audioSource: String?,
        val confidence: Float = 0f
    )

    private fun List<EnrichedTrack>.asResults() = map { SearchResult(it.track, it.audioUrl, it.audioSource, it.confidence) }

    private suspend fun resolveAudioParallel(tracks: List<Track>, timeoutMs: Long = 6000L): Map<String, EnrichedTrack> = coroutineScope {
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

    override fun searchAllStreaming(query: String): Flow<List<SearchResult>> = flow {
        val normalized = query.trim()
        if (normalized.isEmpty()) {
            emit(emptyList())
            return@flow
        }
        val cached = enrichedCache.get(normalized)
        if (cached != null) {
            emit(cached.asResults())
            return@flow
        }
        emit(searchAllInternal(normalized).asResults())
    }

    private suspend fun searchAllInternal(query: String): List<EnrichedTrack> = withContext(Dispatchers.IO) {
        val normalized = query.trim()
        if (normalized.isEmpty()) return@withContext emptyList()

        enrichedCache.get(normalized)?.let { return@withContext it }

        val roomCached = cacheDao.get("search:$normalized")
        if (roomCached != null) {
            try {
                val cached = deserializeEnrichedTracks(roomCached.value).also {
                    enrichedCache.put(normalized, it)
                }
                return@withContext cached
            } catch (_: Exception) {
                cacheDao.remove("search:$normalized")
            }
        }

        try {
            val results = withTimeout(30000L) { searchAllUncached(normalized) }
            cacheDao.put(CacheEntryEntity("search:$normalized", serializeEnrichedTracks(results), System.currentTimeMillis() + 300_000L))
            results
        } catch (e: TimeoutCancellationException) {
            Log.e("SearchRepository", "searchAllInternal timeout", e); emptyList()
        }
    }

    private fun serializeEnrichedTracks(tracks: List<EnrichedTrack>): String {
        val arr = JSONArray()
        for (t in tracks) {
            val obj = JSONObject()
            obj.put("id", t.track.id)
            obj.put("title", t.track.title)
            obj.put("artist", t.track.artist)
            obj.put("album", t.track.album ?: "")
            obj.put("durationMs", t.track.durationMs)
            obj.put("artworkUrl", t.track.artworkUrl ?: "")
            obj.put("isrc", t.track.isrc ?: "")
            obj.put("source", t.track.source)
            obj.put("previewUrl", t.track.previewUrl ?: "")
            obj.put("audioUrl", t.audioUrl ?: "")
            obj.put("audioSource", t.audioSource ?: "")
            obj.put("confidence", t.confidence.toDouble())
            arr.put(obj)
        }
        return arr.toString()
    }

    private fun deserializeEnrichedTracks(json: String): List<EnrichedTrack> {
        val arr = JSONArray(json)
        return (0 until arr.length()).map { i ->
            val obj = arr.getJSONObject(i)
            EnrichedTrack(
                track = Track(
                    id = obj.getString("id"),
                    title = obj.getString("title"),
                    artist = obj.getString("artist"),
                    album = obj.optString("album", ""),
                    durationMs = obj.optLong("durationMs", 0),
                    artworkUrl = obj.optString("artworkUrl", null).takeIf { it?.isNotEmpty() == true },
                    isrc = obj.optString("isrc", null).takeIf { it?.isNotEmpty() == true },
                    source = obj.optString("source", "unknown"),
                    previewUrl = obj.optString("previewUrl", null).takeIf { it?.isNotEmpty() == true }
                ),
                audioUrl = obj.optString("audioUrl", null).takeIf { it?.isNotEmpty() == true },
                audioSource = obj.optString("audioSource", null).takeIf { it?.isNotEmpty() == true },
                confidence = obj.optDouble("confidence", 0.0).toFloat()
            )
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

        val additionalDeferred: kotlinx.coroutines.Deferred<List<EnrichedTrack>> = async {
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

        val spotifyTop = spotifyTracks.take(3)
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
        return coroutineScope {
            results.map { sc ->
                async {
                    val track = Track(
                        id = "sc_${sc.trackId}",
                        title = sc.title,
                        artist = sc.uploader,
                        album = sc.uploader,
                        durationMs = sc.duration * 1000,
                        artworkUrl = sc.thumbnailUrl,
                        source = "soundcloud"
                    )
                    val bestAudio = try { withTimeout(8000L) { findBestAudioForTrack(track) } } catch (_: Exception) { null }
                    EnrichedTrack(
                        track = track,
                        audioUrl = bestAudio?.first,
                        audioSource = bestAudio?.second ?: "soundcloud",
                        confidence = if (bestAudio != null) 0.9f else 0.6f
                    )
                }
            }.awaitAll()
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
        return coroutineScope {
            results.map { bc ->
                async {
                    val track = Track(
                        id = "bc_${bc.id}",
                        title = bc.title,
                        artist = bc.artist,
                        album = bc.album ?: bc.artist,
                        durationMs = (bc.duration ?: 0L) * 1000,
                        artworkUrl = bc.artworkUrl,
                        source = "bandcamp"
                    )
                    val bestAudio = try { withTimeout(8000L) { findBestAudioForTrack(track) } } catch (_: Exception) { null }
                    EnrichedTrack(
                        track = track,
                        audioUrl = bestAudio?.first,
                        audioSource = bestAudio?.second ?: "bandcamp",
                        confidence = if (bestAudio != null) 0.7f else 0.5f
                    )
                }
            }.awaitAll()
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
        audioUrlCache.get(track.id)?.firstOrNull()?.let { return@withContext it }

        try {
            withTimeout(8000L) {
                val expectedDurationSec = if (track.durationMs > 0) track.durationMs / 1000 else null
                val isrc = track.isrc
                val query = generateQueries(track.artist, track.title).first()

                val result = tryResolveAudioParallel(query, track.title, track.artist, expectedDurationSec, isrc)
                    ?: if (track.previewUrl != null && isValidPreviewUrl(track.previewUrl)) {
                        Pair(track.previewUrl, track.source)
                    } else null

                if (result != null) audioUrlCache.put(track.id, listOf(result))
                result
            }
        } catch (e: TimeoutCancellationException) {
            Log.e("SearchRepository", "findBestAudioForTrack timeout", e); null
        }
    }

    private fun isValidPreviewUrl(url: String?): Boolean {
        return url != null && url.isNotEmpty() && (url.startsWith("http://") || url.startsWith("https://"))
    }

    private suspend fun tryResolveAudioParallel(
        query: String,
        expectedTitle: String,
        expectedArtist: String,
        expectedDurationSec: Long?,
        expectedIsrc: String?
    ): Pair<String, String>? = coroutineScope {
        val candidates = mutableListOf<AudioCandidate>()

        val sourceJobs = listOf(
            async {
                if (expectedIsrc != null) {
                    try {
                        val deezerTrack = deezerClient.getTrackByIsrc(expectedIsrc)
                        if (deezerTrack?.previewUrl != null) {
                            val score = MatchScorer.computeScore(MatchOptions(
                                expectedTitle = expectedTitle, expectedArtist = expectedArtist,
                                foundTitle = deezerTrack.title, foundAuthor = deezerTrack.artist,
                                foundDurationSec = deezerTrack.duration.toLong(),
                                expectedDurationSec = expectedDurationSec,
                                expectedIsrc = expectedIsrc, foundIsrc = deezerTrack.isrc
                            ))
                            AudioCandidate(deezerTrack.previewUrl, "deezer", score, isPreview = true)
                        } else null
                    } catch (_: Exception) { null }
                } else null
            },
            async {
                try {
                    val pipedResults = pipedClient.search(query, limit = 3, filter = "music")
                    pipedResults.mapNotNull { pr ->
                        try {
                            val stream = withTimeout(4000L) { pipedClient.getStreams(pr.videoId) }
                            if (stream != null) {
                                val audioUrl = stream.audioTrackUrl ?: stream.url
                                if (audioUrl.isNotEmpty()) {
                                    val score = MatchScorer.computeScore(MatchOptions(
                                        expectedTitle = expectedTitle, expectedArtist = expectedArtist,
                                        foundTitle = pr.title, foundAuthor = pr.uploader,
                                        foundDurationSec = pr.duration, expectedDurationSec = expectedDurationSec,
                                        expectedIsrc = expectedIsrc
                                    ))
                                    AudioCandidate(audioUrl, "piped", score)
                                } else null
                            } else null
                        } catch (_: Exception) { null }
                    }
                } catch (_: Exception) { emptyList() }
            },
            async {
                try {
                    audiusClient.search(query, limit = 3).mapNotNull { ar ->
                        if (ar.streamUrl != null) {
                            val score = MatchScorer.computeScore(MatchOptions(
                                expectedTitle = expectedTitle, expectedArtist = expectedArtist,
                                foundTitle = ar.title, foundAuthor = ar.artist,
                                foundDurationSec = ar.duration, expectedDurationSec = expectedDurationSec,
                                expectedIsrc = expectedIsrc
                            ))
                            AudioCandidate(ar.streamUrl, "audius", score)
                        } else null
                    }
                } catch (_: Exception) { emptyList() }
            },
            async {
                try {
                    jamendoClient.search(query, limit = 2).mapNotNull { jr ->
                        if (jr.audioUrl != null) {
                            val score = MatchScorer.computeScore(MatchOptions(
                                expectedTitle = expectedTitle, expectedArtist = expectedArtist,
                                foundTitle = jr.title, foundAuthor = jr.artist,
                                foundDurationSec = jr.duration.toLong(),
                                expectedDurationSec = expectedDurationSec, expectedIsrc = expectedIsrc
                            ))
                            AudioCandidate(jr.audioUrl, "jamendo", score)
                        } else null
                    }
                } catch (_: Exception) { emptyList() }
            },
            async {
                try {
                    fmaClient.search(query, limit = 2).mapNotNull { fr ->
                        if (fr.audioUrl != null) {
                            val score = MatchScorer.computeScore(MatchOptions(
                                expectedTitle = expectedTitle, expectedArtist = expectedArtist,
                                foundTitle = fr.title, foundAuthor = fr.artist,
                                foundDurationSec = fr.duration, expectedDurationSec = expectedDurationSec,
                                expectedIsrc = expectedIsrc
                            ))
                            AudioCandidate(fr.audioUrl, "fma", score)
                        } else null
                    }
                } catch (_: Exception) { emptyList() }
            }
        )

        for (job in sourceJobs) {
            val result = job.await()
            if (result is AudioCandidate) candidates.add(result)
            else if (result is List<*>) candidates.addAll(result.filterIsInstance<AudioCandidate>())
        }

        candidates.firstOrNull { !it.isPreview && it.score >= MatchScorer.GOOD_CONFIDENCE }
            ?.let { return@coroutineScope Pair(it.audioUrl, it.source) }

        candidates.firstOrNull { it.score >= MatchScorer.GOOD_CONFIDENCE }
            ?.let { return@coroutineScope Pair(it.audioUrl, it.source) }

        candidates.filter { !it.isPreview && it.score >= MatchScorer.MIN_CONFIDENCE }
            .maxByOrNull { it.score }
            ?.let { return@coroutineScope Pair(it.audioUrl, it.source) }

        candidates.filter { it.score >= MatchScorer.MIN_CONFIDENCE }
            .maxByOrNull { it.score }
            ?.let { return@coroutineScope Pair(it.audioUrl, it.source) }

        null
    }

    override fun invalidateCache() {
        cache.invalidateAll()
        enrichedCache.invalidateAll()
        audioUrlCache.invalidateAll()
    }

    override suspend fun searchAlbums(query: String): List<Album> = withContext(Dispatchers.IO) {
        spotifyClient.searchAlbums(query) ?: emptyList()
    }

    override suspend fun getAlbum(albumId: String): Album? = withContext(Dispatchers.IO) {
        spotifyClient.getAlbum(albumId)
    }

    override fun classifyQuery(query: String): QueryType {
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
        spotifyClient.searchArtists(query) ?: emptyList()
    }

    override suspend fun getArtist(artistId: String): Artist? = withContext(Dispatchers.IO) {
        spotifyClient.getArtist(artistId)
    }

    override suspend fun getArtistTopTracks(artistId: String): List<Track> = withContext(Dispatchers.IO) {
        spotifyClient.getArtistTopTracks(artistId) ?: emptyList()
    }

    override suspend fun getRelatedArtists(artistId: String): List<Artist> = withContext(Dispatchers.IO) {
        spotifyClient.getRelatedArtists(artistId) ?: emptyList()
    }

    override suspend fun getTrack(trackId: String): Track? = withContext(Dispatchers.IO) {
        robustCall(label = "spotify_track") { spotifyClient.getTrack(trackId) }
    }
}
