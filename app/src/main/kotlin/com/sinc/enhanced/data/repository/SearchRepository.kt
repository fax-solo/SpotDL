package com.sinc.enhanced.data.repository

import android.util.Log
import com.sinc.enhanced.data.audio.AudioResolverPipeline
import com.sinc.enhanced.data.local.dao.CacheDao
import com.sinc.enhanced.data.local.entity.CacheEntryEntity
import com.sinc.enhanced.data.model.Album
import com.sinc.enhanced.data.model.Artist
import com.sinc.enhanced.data.model.Track
import com.sinc.enhanced.data.remote.PipedClient
import com.sinc.enhanced.data.remote.SpotifyClient
import com.sinc.enhanced.data.util.SearchCache
import com.sinc.enhanced.data.util.retry.CircuitBreaker
import com.sinc.enhanced.data.util.retry.RetryPolicy
import com.sinc.enhanced.data.util.retry.retryCall
import com.sinc.enhanced.domain.music.SearchResult
import com.sinc.enhanced.domain.repository.SearchRepository as SearchRepositoryInterface
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.withTimeout
import org.json.JSONArray
import org.json.JSONObject

enum class QueryType { ARTIST, TRACK, ALBUM, GENERIC }

class SearchRepository(
    private val spotifyClient: SpotifyClient,
    private val pipedClient: PipedClient,
    private val cacheDao: CacheDao,
    private val audioPipeline: AudioResolverPipeline,
    private val orchestrator: SearchSourceOrchestrator
) : SearchRepositoryInterface {
    private val enrichedCache = SearchCache<EnrichedTrack>()
    private val audioUrlCache = SearchCache<Pair<String, String>>()
    private val breaker = CircuitBreaker()

    data class EnrichedTrack(
        val track: Track,
        val audioUrl: String?,
        val audioSource: String?,
        val confidence: Float = 0f
    )

    private fun List<EnrichedTrack>.asResults() = map { SearchResult(it.track, it.audioUrl, it.audioSource, it.confidence) }

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

    private suspend fun searchAllInternal(query: String): List<EnrichedTrack> {
        val normalized = query.trim()
        if (normalized.isEmpty()) return emptyList()

        enrichedCache.get(normalized)?.let { return it }

        val roomCached = cacheDao.get("search:$normalized")
        if (roomCached != null) {
            try {
                val cached = deserializeEnrichedTracks(roomCached.value).also {
                    enrichedCache.put(normalized, it)
                }
                if (roomCached.expiresAt > System.currentTimeMillis()) {
                    return cached
                }
            } catch (_: Exception) {
                cacheDao.remove("search:$normalized")
            }
        }

        try {
            val results = withTimeout(30000L) { searchAllUncached(normalized) }
            cacheDao.put(CacheEntryEntity("search:$normalized", serializeEnrichedTracks(results), System.currentTimeMillis() + 900_000L))
            return results
        } catch (e: TimeoutCancellationException) {
            Log.e("SearchRepository", "searchAllInternal timeout", e); return emptyList()
        }
    }

    private suspend fun searchAllUncached(normalized: String): List<EnrichedTrack> {
        val results = orchestrator.searchAll(normalized).map { result ->
            EnrichedTrack(
                track = result.track,
                audioUrl = result.audioUrl,
                audioSource = result.audioSource,
                confidence = result.confidence
            )
        }.also {
            enrichedCache.put(normalized, it)
        }
        return results
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

    override suspend fun searchYouTubeOnly(query: String): List<SearchResult> = coroutineScope {
        val results = retryCall(key = "piped", breaker = breaker, label = "piped_search") { pipedClient.search(query) }
            ?: return@coroutineScope emptyList()
        results.map { yt ->
            async {
                try {
                    val stream = retryCall(
                        key = "piped",
                        policy = RetryPolicy(timeoutMs = 10000),
                        breaker = breaker,
                        label = "piped_stream"
                    ) { pipedClient.getStreams(yt.videoId) }
                    if (stream != null) {
                        val audioUrl = stream.audioTrackUrl ?: stream.url
                        if (audioUrl.isEmpty()) return@async null
                        val track = Track(
                            id = "yt_${yt.videoId}",
                            title = yt.title,
                            artist = yt.uploader,
                            album = yt.uploader,
                            durationMs = yt.duration * 1000,
                            artworkUrl = yt.thumbnailUrl,
                            source = "youtube"
                        )
                        SearchResult(track, audioUrl, "youtube", 1.0f)
                    } else null
                } catch (e: Exception) { Log.e("SearchRepository", "searchYouTubeOnly stream failed", e); null }
            }
        }.awaitAll().filterNotNull()
    }

    override suspend fun findBestAudioForTrack(track: Track): Pair<String, String>? {
        audioUrlCache.get(track.id)?.firstOrNull()?.let { return it }

        try {
            return withTimeout(6000L) {
                val result = audioPipeline.resolve(track)
                    ?: if (track.previewUrl != null && track.previewUrl.startsWith("http")) {
                        Pair(track.previewUrl, track.source)
                    } else null

                if (result != null) audioUrlCache.put(track.id, listOf(result))
                result
            }
        } catch (e: TimeoutCancellationException) {
            Log.e("SearchRepository", "findBestAudioForTrack timeout", e); return null
        }
    }

    override fun invalidateCache() {
        enrichedCache.invalidateAll()
        audioUrlCache.invalidateAll()
    }

    override suspend fun searchAlbums(query: String): List<Album> {
        return spotifyClient.searchAlbums(query) ?: emptyList()
    }

    override suspend fun getAlbum(albumId: String): Album? {
        return spotifyClient.getAlbum(albumId)
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

    override suspend fun searchArtists(query: String): List<Artist> {
        return spotifyClient.searchArtists(query) ?: emptyList()
    }

    override suspend fun getArtist(artistId: String): Artist? {
        return spotifyClient.getArtist(artistId)
    }

    override suspend fun getArtistTopTracks(artistId: String): List<Track> {
        return spotifyClient.getArtistTopTracks(artistId) ?: emptyList()
    }

    override suspend fun getRelatedArtists(artistId: String): List<Artist> {
        return spotifyClient.getRelatedArtists(artistId) ?: emptyList()
    }

    override suspend fun getTrack(trackId: String): Track? =
        retryCall(
            key = "spotify_track",
            breaker = breaker,
            label = "spotify_track"
        ) { spotifyClient.getTrack(trackId) }
}
