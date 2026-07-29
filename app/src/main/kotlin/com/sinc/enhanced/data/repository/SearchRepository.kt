package com.sinc.enhanced.data.repository

import android.util.Log
import com.sinc.enhanced.data.audio.AudioResolverPipeline
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
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flow
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
    private val cacheDao: CacheDao,
    private val audioPipeline: AudioResolverPipeline
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

    private suspend fun searchAllUncached(normalized: String): List<EnrichedTrack> = coroutineScope {
        val results = mutableListOf<EnrichedTrack>()

        val spotifyDeferred = async { robustCall(label = "spotify") { spotifyClient.searchTracks(normalized) } }
        val deezerDeferred = async { robustCall(label = "deezer") { deezerClient.searchTracks(normalized) } }

        val spotifyTracks = spotifyDeferred.await() ?: emptyList()
        results.addAll(spotifyTracks.map { EnrichedTrack(it, null, null, 0.5f) })

        val deezerResults = deezerDeferred.await() ?: emptyList()
        results.addAll(deezerResults.map { d ->
            EnrichedTrack(
                Track(id = "dz_${d.id}", title = d.title, artist = d.artist, album = d.album,
                    durationMs = d.duration * 1000L, artworkUrl = d.artworkUrl, isrc = d.isrc, source = "deezer"),
                null, null, 0.4f
            )
        })

        if (results.size < 5) {
            val pipedResults = robustCall(label = "piped") { pipedClient.search(normalized, limit = 5) }
            if (pipedResults != null) {
                results.addAll(pipedResults.map { yt ->
                    EnrichedTrack(
                        track = Track(id = "yt_${yt.videoId}", title = yt.title, artist = yt.uploader,
                            album = yt.uploader, durationMs = yt.duration * 1000, artworkUrl = yt.thumbnailUrl, source = "youtube"),
                        null, null, 0.3f
                    )
                })
            }
        }

        if (results.size < 5) {
            val fallbackResult = runFallbackSource(normalized)
            if (fallbackResult != null) results.addAll(fallbackResult)
        }

        val seenIds = mutableSetOf<String>()
        val seenTitleArtist = mutableSetOf<String>()
        results.filter { enriched ->
            val idKey = enriched.track.id
            if (idKey in seenIds) return@filter false
            val taKey = "${enriched.track.title.lowercase().trim()}|${enriched.track.artist.lowercase().trim()}"
            if (taKey in seenTitleArtist) return@filter false
            seenIds.add(idKey)
            seenTitleArtist.add(taKey)
            true
        }.sortedByDescending { e -> e.confidence }.also {
            enrichedCache.put(normalized, it)
        }
    }

    private suspend fun runFallbackSource(query: String): List<EnrichedTrack>? {
        val audiusOn = settingsManager.audiusEnabled.first()
        val jamendoOn = settingsManager.jamendoEnabled.first()
        val fmaOn = settingsManager.fmaEnabled.first()
        val bandcampOn = settingsManager.bandcampEnabled.first()

        return when {
            audiusOn -> try { searchAudius(query) } catch (_: Exception) { null }
            jamendoOn -> try { searchJamendo(query) } catch (_: Exception) { null }
            fmaOn -> try { searchFma(query) } catch (_: Exception) { null }
            bandcampOn -> try { searchBandcamp(query) } catch (_: Exception) { null }
            else -> try { searchSoundCloud(query) } catch (_: Exception) { null }
        }
    }

    override suspend fun searchYouTubeOnly(query: String): List<SearchResult> = searchYouTubeOnlyInternal(query).asResults()

    private suspend fun searchYouTubeOnlyInternal(query: String): List<EnrichedTrack> = coroutineScope {
        val results = robustCall(label = "piped_search") { pipedClient.search(query) } ?: return@coroutineScope emptyList()
        results.map { yt ->
            async {
                try {
                    val stream = robustCall(timeoutMs = 10000, label = "piped_stream") { pipedClient.getStreams(yt.videoId) }
                    if (stream != null) {
                        val audioUrl = stream.audioTrackUrl ?: stream.url
                        if (audioUrl.isEmpty()) return@async null
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
        }.awaitAll().filterNotNull()
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
        cache.invalidateAll()
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

    override suspend fun getTrack(trackId: String): Track? {
        return robustCall(label = "spotify_track") { spotifyClient.getTrack(trackId) }
    }
}
