package com.sinc.enhanced.data.remote

import android.util.Log
import com.sinc.enhanced.data.model.Album
import com.sinc.enhanced.data.model.Artist
import com.sinc.enhanced.data.model.Track
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONArray
import org.json.JSONObject
import java.net.URLEncoder
import java.util.regex.Pattern

class SpotifyClient(private val client: OkHttpClient) {

    data class PlaylistTracksResult(
        val tracks: List<Track>,
        val nextOffset: Int?
    )

    companion object {
        private const val EMBED_BOOTSTRAP_ID = "4uLU6hMCjMI75M1A2tKUQC"
        private const val PLAYLIST_HASH = "a65e12194ed5fc443a1cdebed5fabe33ca5b07b987185d63c72483867ad13cb4"
        private const val TRACK_HASH = "612585ae06ba435ad26369870deaae23b5c8800a256cd8a57e08eddc25a37294"
        private const val SEARCH_HASH = "eff59fa0a3d026b88b56fddbcf4bdfa16a186b8175a5c1a358c072e053c2e5b0"
        private const val PATHFINDER_URL = "https://api-partner.spotify.com/pathfinder/v1/query"
    }

    @Volatile private var anonymousToken: String? = null
    @Volatile private var tokenExpiresAt: Long = 0
    private val tokenMutex = Mutex()

    private suspend fun getAnonymousToken(): String = withContext(Dispatchers.IO) {
        tokenMutex.withLock {
            anonymousToken?.let { token ->
                if (System.currentTimeMillis() < tokenExpiresAt - 60000) return@withLock token
            }
            val html = fetchUrl("https://open.spotify.com/embed/track/$EMBED_BOOTSTRAP_ID") ?: throw Exception("Failed to fetch embed page")
            val matcher = Pattern.compile(
                """<script id="__NEXT_DATA__"[^>]*>(.*?)</script>""",
                Pattern.DOTALL
            ).matcher(html)
            if (!matcher.find()) throw Exception("No __NEXT_DATA__ in embed page")
            val nextData = JSONObject(matcher.group(1) ?: throw Exception("Empty __NEXT_DATA__ match"))
            val token = nextData
                .getJSONObject("props")
                .getJSONObject("pageProps")
                .getJSONObject("state")
                .getJSONObject("settings")
                .getJSONObject("session")
                .getString("accessToken")
            anonymousToken = token
            tokenExpiresAt = System.currentTimeMillis() + 3600000
            token
        }
    }

    private fun fetchUrl(url: String): String? {
        return try {
            val request = Request.Builder()
                .url(url)
                .header("User-Agent", "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.230 Mobile Safari/537.36")
                .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
                .header("Accept-Language", "en-US,en;q=0.5")
                .build()
            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) return null
                response.body?.string()
            }
        } catch (ce: CancellationException) { throw ce }
        catch (e: Exception) {
            Log.e("SpotifyClient", "fetchUrl failed: $url", e)
            null
        }
    }

    private fun pathfinderGet(operationName: String, sha256Hash: String, variables: JSONObject): JSONObject? {
        return try {
            val token = runCatching { anonymousToken ?: throw Exception() }.getOrNull()
                ?: return null
            val vars = variables.toString()
            val exts = JSONObject().apply {
                put("persistedQuery", JSONObject().apply {
                    put("version", 1)
                    put("sha256Hash", sha256Hash)
                })
            }
            val url = "$PATHFINDER_URL?operationName=${URLEncoder.encode(operationName, "UTF-8")}" +
                "&variables=${URLEncoder.encode(vars, "UTF-8")}" +
                "&extensions=${URLEncoder.encode(exts.toString(), "UTF-8")}"
            val request = Request.Builder()
                .url(url)
                .header("Authorization", "Bearer $token")
                .header("app-platform", "WebPlayer")
                .header("User-Agent", "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36")
                .build()
            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) return null
                JSONObject(response.body?.string() ?: return null)
            }
        } catch (ce: CancellationException) { throw ce }
        catch (e: Exception) {
            Log.e("SpotifyClient", "pathfinderGet failed", e)
            null
        }
    }

    private fun parsePlaylistTrack(trackData: JSONObject): Track? {
        val name = trackData.optString("name")
        if (name.isEmpty()) return null
        val uri = trackData.optString("uri")
        val trackId = uri.removePrefix("spotify:track:")
        val duration = trackData.optJSONObject("trackDuration") ?: trackData.optJSONObject("duration")
        val durationMs = duration?.optLong("totalMilliseconds") ?: 0
        val playability = trackData.optJSONObject("playability")
        val albumOfTrack = trackData.optJSONObject("albumOfTrack")
        val albumName = albumOfTrack?.optString("name") ?: "Unknown"
        val coverArt = albumOfTrack?.optJSONObject("coverArt")
        val coverUrl = coverArt?.optJSONArray("sources")?.optJSONObject(0)?.optString("url")
        val artistsArray = trackData.optJSONObject("artists")?.optJSONArray("items")
        val firstArtist = artistsArray?.optJSONObject(0)
            ?.optJSONObject("profile")?.optString("name") ?: "Unknown"
        val allArtists = mutableListOf<String>()
        if (artistsArray != null) {
            for (i in 0 until artistsArray.length()) {
                val aName = artistsArray.getJSONObject(i)
                    .optJSONObject("profile")?.optString("name")
                if (aName != null) allArtists.add(aName)
            }
        }
        val contentRating = trackData.optJSONObject("contentRating")
        val explicit = contentRating?.optString("label") == "EXPLICIT"
        val trackNumber = trackData.optInt("trackNumber", 0)

        val imagesList = if (coverUrl != null) {
            listOf(mapOf<String, Any?>("url" to coverUrl, "width" to 300, "height" to 300))
        } else null
        val artistsList = allArtists.map { mapOf("name" to (it as Any)) }

        val mapped = mapOf<String, Any?>(
            "id" to trackId,
            "name" to name,
            "album" to mapOf<String, Any?>(
                "name" to albumName, "id" to null,
                "images" to imagesList, "release_date" to null
            ),
            "artists" to artistsList,
            "duration_ms" to durationMs,
            "preview_url" to null,
            "track_number" to trackNumber,
            "disc_number" to 1,
            "external_ids" to null,
            "explicit" to explicit
        )
        return Track.fromSpotify(mapped)
    }

    suspend fun searchTracks(query: String, limit: Int = 10): List<Track> = withContext(Dispatchers.IO) {
        try {
            getAnonymousToken()
        } catch (ce: CancellationException) { throw ce }
        catch (_: Exception) { return@withContext emptyList() }

        val vars = JSONObject().apply {
            put("searchTerm", query)
            put("offset", 0)
            put("limit", limit)
            put("numberOfTopResults", 5)
            put("includeAudiobooks", true)
            put("includePreReleases", true)
            put("includeAlbumPreReleases", false)
            put("includeAuthors", false)
            put("includeEpisodeContentRatingsV2", false)
        }
        val json = pathfinderGet("searchDesktop", SEARCH_HASH, vars) ?: return@withContext emptyList()
        val searchV2 = json.optJSONObject("data")?.optJSONObject("searchV2") ?: return@withContext emptyList()
        val tracksV2 = searchV2.optJSONObject("tracksV2") ?: return@withContext emptyList()
        val items = tracksV2.optJSONArray("items") ?: return@withContext emptyList()

        (0 until items.length()).mapNotNull { i ->
            val item = items.getJSONObject(i)
            val trackData = item.optJSONObject("item")
                ?.optJSONObject("data") ?: return@mapNotNull null
            parseSearchTrack(trackData)
        }
    }

    private fun parseSearchTrack(data: JSONObject): Track? {
        val name = data.optString("name")
        if (name.isEmpty()) return null
        val uri = data.optString("uri")
        val trackId = uri.removePrefix("spotify:track:")
        val duration = data.optJSONObject("duration")
        val durationMs = duration?.optLong("totalMilliseconds") ?: 0
        val albumOfTrack = data.optJSONObject("albumOfTrack")
        val albumName = albumOfTrack?.optString("name") ?: "Unknown"
        val coverArt = albumOfTrack?.optJSONObject("coverArt")
        val coverUrl = coverArt?.optJSONArray("sources")?.optJSONObject(0)?.optString("url")
        val artistsArray = data.optJSONObject("artists")?.optJSONArray("items")
        val firstArtist = artistsArray?.optJSONObject(0)
            ?.optJSONObject("profile")?.optString("name") ?: "Unknown"
        val allArtists = mutableListOf<String>()
        if (artistsArray != null) {
            for (i in 0 until artistsArray.length()) {
                val aName = artistsArray.getJSONObject(i)
                    .optJSONObject("profile")?.optString("name")
                if (aName != null) allArtists.add(aName)
            }
        }
        val imagesList = if (coverUrl != null) {
            listOf(mapOf<String, Any?>("url" to coverUrl, "width" to 300, "height" to 300))
        } else null
        val artistsList = allArtists.map { mapOf("name" to (it as Any)) }
        val mapped = mapOf<String, Any?>(
            "id" to trackId, "name" to name,
            "album" to mapOf<String, Any?>("name" to albumName, "id" to null, "images" to imagesList, "release_date" to null),
            "artists" to artistsList, "duration_ms" to durationMs,
            "preview_url" to null, "track_number" to 0, "disc_number" to 1,
            "external_ids" to null
        )
        return Track.fromSpotify(mapped)
    }

    suspend fun searchAlbums(query: String, limit: Int = 5): List<Album> = withContext(Dispatchers.IO) {
        emptyList()
    }

    suspend fun getPlaylist(playlistId: String): Map<String, Any?>? = withContext(Dispatchers.IO) {
        try {
            getAnonymousToken()
        } catch (ce: CancellationException) { throw ce }
        catch (_: Exception) { return@withContext null }

        val vars = JSONObject().apply {
            put("uri", "spotify:playlist:$playlistId")
            put("offset", 0)
            put("limit", 1)
            put("enableWatchFeedEntrypoint", false)
        }
        val json = pathfinderGet("fetchPlaylist", PLAYLIST_HASH, vars) ?: return@withContext null
        val pl = json.optJSONObject("data")?.optJSONObject("playlistV2") ?: return@withContext null
        val images = pl.optJSONObject("images")?.optJSONArray("items")
        val imageUrl = images?.optJSONObject(0)
            ?.optJSONArray("sources")?.optJSONObject(0)?.optString("url")
        val ownerV2 = pl.optJSONObject("ownerV2")?.optJSONObject("data")
        val owner = ownerV2?.optString("name") ?: "Unknown"
        val totalTracks = pl.optJSONObject("content")?.optInt("totalCount", 0) ?: 0

        mapOf(
            "id" to playlistId,
            "name" to (pl.optString("name") as Any),
            "description" to (pl.optString("description") as Any),
            "imageUrl" to (imageUrl as Any),
            "owner" to (owner as Any),
            "totalTracks" to (totalTracks as Any),
            "tracksUrl" to ""
        )
    }

    suspend fun getPlaylistTracks(playlistId: String, offset: Int = 0, limit: Int = 100): PlaylistTracksResult = withContext(Dispatchers.IO) {
        try {
            getAnonymousToken()
        } catch (ce: CancellationException) { throw ce }
        catch (_: Exception) { return@withContext PlaylistTracksResult(emptyList(), null) }

        val vars = JSONObject().apply {
            put("uri", "spotify:playlist:$playlistId")
            put("offset", offset)
            put("limit", limit)
            put("enableWatchFeedEntrypoint", false)
        }
        val json = pathfinderGet("fetchPlaylist", PLAYLIST_HASH, vars) ?: return@withContext PlaylistTracksResult(emptyList(), null)
        val content = json.optJSONObject("data")
            ?.optJSONObject("playlistV2")
            ?.optJSONObject("content") ?: return@withContext PlaylistTracksResult(emptyList(), null)
        val items = content.optJSONArray("items") ?: return@withContext PlaylistTracksResult(emptyList(), null)

        val pagingInfo = content.optJSONObject("pagingInfo")
        val nextOffset = if (pagingInfo != null && pagingInfo.has("nextOffset") && !pagingInfo.isNull("nextOffset")) {
            pagingInfo.optInt("nextOffset", -1).let { if (it < 0) null else it }
        } else {
            if (items.length() < limit) null else offset + limit
        }

        val tracks = (0 until items.length()).mapNotNull { i ->
            val item = items.getJSONObject(i)
            val trackData = item.optJSONObject("itemV2")?.optJSONObject("data")
                ?: return@mapNotNull null
            if (trackData.optString("__typename") != "Track") return@mapNotNull null
            parsePlaylistTrack(trackData)
        }
        PlaylistTracksResult(tracks, nextOffset)
    }

    suspend fun getTrack(trackId: String): Track? = withContext(Dispatchers.IO) {
        try {
            getAnonymousToken()
        } catch (ce: CancellationException) { throw ce }
        catch (_: Exception) { return@withContext null }

        val vars = JSONObject().apply { put("uri", "spotify:track:$trackId") }
        val json = pathfinderGet("getTrack", TRACK_HASH, vars) ?: return@withContext null
        val trackUnion = json.optJSONObject("data")?.optJSONObject("trackUnion") ?: return@withContext null
        val name = trackUnion.optString("name")
        if (name.isEmpty()) return@withContext null
        val uri = trackUnion.optString("uri")
        val id = uri.removePrefix("spotify:track:")
        val duration = trackUnion.optJSONObject("duration")?.optLong("totalMilliseconds") ?: 0
        val albumOfTrack = trackUnion.optJSONObject("albumOfTrack")
        val albumName = albumOfTrack?.optString("name") ?: "Unknown"
        val coverArt = albumOfTrack?.optJSONObject("coverArt")
        val coverUrl = coverArt?.optJSONArray("sources")?.optJSONObject(0)?.optString("url")
        val artistsArray = trackUnion.optJSONObject("artists")?.optJSONArray("items")
        val firstArtist = artistsArray?.optJSONObject(0)
            ?.optJSONObject("profile")?.optString("name") ?: "Unknown"
        val allArtists = mutableListOf<String>()
        if (artistsArray != null) {
            for (i in 0 until artistsArray.length()) {
                val aName = artistsArray.getJSONObject(i)
                    .optJSONObject("profile")?.optString("name")
                if (aName != null) allArtists.add(aName)
            }
        }
        val trackNumber = trackUnion.optInt("trackNumber", 0)
        val imagesList = if (coverUrl != null) {
            listOf(mapOf<String, Any?>("url" to coverUrl, "width" to 300, "height" to 300))
        } else null
        val artistsList = allArtists.map { mapOf("name" to (it as Any)) }
        val mapped = mapOf<String, Any?>(
            "id" to id, "name" to name,
            "album" to mapOf<String, Any?>("name" to albumName, "id" to null, "images" to imagesList, "release_date" to null),
            "artists" to artistsList, "duration_ms" to duration,
            "preview_url" to null, "track_number" to trackNumber, "disc_number" to 1,
            "external_ids" to null
        )
        Track.fromSpotify(mapped)
    }

    suspend fun getAlbum(albumId: String): Album? = withContext(Dispatchers.IO) {
        null
    }

    suspend fun searchArtists(query: String, limit: Int = 5): List<Artist> = withContext(Dispatchers.IO) {
        emptyList()
    }

    suspend fun getArtist(artistId: String): Artist? = withContext(Dispatchers.IO) {
        null
    }

    suspend fun getArtistTopTracks(artistId: String, market: String = "US"): List<Track> = withContext(Dispatchers.IO) {
        emptyList()
    }

    suspend fun getRelatedArtists(artistId: String): List<Artist> = withContext(Dispatchers.IO) {
        emptyList()
    }
}
