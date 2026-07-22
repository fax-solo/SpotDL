package com.sinc.enhanced.data.remote

import com.sinc.enhanced.BuildConfig
import com.sinc.enhanced.data.model.Album
import com.sinc.enhanced.data.model.Artist
import com.sinc.enhanced.data.model.Track
import okhttp3.FormBody
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONArray
import org.json.JSONObject

class SpotifyClient(private val client: OkHttpClient) {

    @Volatile private var accessToken: String? = null
    @Volatile private var tokenExpiresAt: Long = 0

    private fun getToken(): String {
        accessToken?.let { token ->
            if (System.currentTimeMillis() < tokenExpiresAt) return token
        }
        val body = FormBody.Builder()
            .add("grant_type", "client_credentials")
            .build()
        val auth = okhttp3.Credentials.basic(BuildConfig.SPOTIFY_CLIENT_ID, BuildConfig.SPOTIFY_CLIENT_SECRET)
        val request = Request.Builder()
            .url("https://accounts.spotify.com/api/token")
            .header("Authorization", auth)
            .post(body)
            .build()
        return try {
            val response = client.newCall(request).execute()
            val json = JSONObject(response.body?.string() ?: "{}")
            val token = json.getString("access_token")
            accessToken = token
            tokenExpiresAt = System.currentTimeMillis() + (json.optLong("expires_in", 3600) * 1000) - 60000
            token
        } catch (_: Exception) {
            ""
        }
    }

    private fun jsonGet(url: String): JSONObject? {
        return try {
            val token = getToken()
            if (token.isEmpty()) return null
            val request = Request.Builder()
                .url(url)
                .header("Authorization", "Bearer $token")
                .build()
            val response = client.newCall(request).execute()
            if (!response.isSuccessful) return null
            JSONObject(response.body?.string() ?: return null)
        } catch (_: Exception) { null }
    }

    fun searchTracks(query: String, limit: Int = 10): List<Track> {
        val url = "https://api.spotify.com/v1/search?q=${java.net.URLEncoder.encode(query, "UTF-8")}&type=track&limit=$limit"
        val json = jsonGet(url) ?: return emptyList()
        val items = json.optJSONObject("tracks")?.optJSONArray("items") ?: return emptyList()
        return (0 until items.length()).mapNotNull { i ->
            Track.fromSpotify(toMap(items.getJSONObject(i)))
        }
    }

    fun searchAlbums(query: String, limit: Int = 5): List<Album> {
        val url = "https://api.spotify.com/v1/search?q=${java.net.URLEncoder.encode(query, "UTF-8")}&type=album&limit=$limit"
        val json = jsonGet(url) ?: return emptyList()
        val items = json.optJSONObject("albums")?.optJSONArray("items") ?: return emptyList()
        return (0 until items.length()).mapNotNull { i ->
            val item = items.getJSONObject(i)
            val images = item.optJSONArray("images")
            val artists = item.optJSONArray("artists")
            Album(
                id = item.optString("id"),
                name = item.optString("name"),
                artist = artists?.getJSONObject(0)?.optString("name") ?: "Unknown",
                artists = (0 until (artists?.length() ?: 0)).mapNotNull {
                    artists?.getJSONObject(it)?.optString("name")
                },
                artworkUrl = if (images != null && images.length() > 0) {
                    images.getJSONObject(images.length() - 1).optString("url")
                } else null,
                releaseYear = try { item.optString("release_date").take(4).toInt() } catch (_: Exception) { null },
                totalTracks = item.optInt("total_tracks")
            )
        }
    }

    fun getPlaylist(playlistId: String): Map<String, Any?>? {
        val json = jsonGet("https://api.spotify.com/v1/playlists/$playlistId") ?: return null
        val images = json.optJSONArray("images")
        val owner = json.optJSONObject("owner")
        return mapOf(
            "id" to (json.optString("id") as Any),
            "name" to (json.optString("name") as Any),
            "description" to ((json.optString("description") ?: "") as Any),
            "imageUrl" to (if (images != null && images.length() > 0) images.getJSONObject(0).optString("url") else null) as Any,
            "owner" to ((owner?.optString("display_name") ?: "Unknown") as Any),
            "totalTracks" to ((json.optJSONObject("tracks")?.optInt("total", 0) ?: 0) as Any),
            "tracksUrl" to ((json.optJSONObject("tracks")?.optString("href") ?: "") as Any)
        )
    }

    fun getPlaylistTracks(playlistId: String, offset: Int = 0, limit: Int = 100): List<Track> {
        val url = "https://api.spotify.com/v1/playlists/$playlistId/tracks?offset=$offset&limit=$limit&fields=items(track(id,name,duration_ms,artists,album,track_number,disc_number,external_ids)),next,total"
        val json = jsonGet(url) ?: return emptyList()
        val items = json.optJSONArray("items") ?: return emptyList()
        return (0 until items.length()).mapNotNull { i ->
            val item = items.getJSONObject(i)
            val track = item.optJSONObject("track") ?: return@mapNotNull null
            Track.fromSpotify(toMap(track))
        }
    }

    fun getTrack(trackId: String): Track? {
        val json = jsonGet("https://api.spotify.com/v1/tracks/$trackId") ?: return null
        return Track.fromSpotify(toMap(json))
    }

    fun getAlbum(albumId: String): Album? {
        val json = jsonGet("https://api.spotify.com/v1/albums/$albumId") ?: return null
        val items = json.optJSONObject("tracks")?.optJSONArray("items") ?: return null
        val images = json.optJSONArray("images")
        val artists = json.optJSONArray("artists")
        return Album(
            id = json.optString("id"),
            name = json.optString("name"),
            artist = artists?.getJSONObject(0)?.optString("name") ?: "Unknown",
            artists = (0 until (artists?.length() ?: 0)).mapNotNull {
                artists?.getJSONObject(it)?.optString("name")
            },
            artworkUrl = if (images != null && images.length() > 0) images.getJSONObject(0).optString("url") else null,
            releaseYear = try { json.optString("release_date").take(4).toInt() } catch (_: Exception) { null },
            totalTracks = json.optInt("total_tracks"),
            tracks = (0 until items.length()).mapNotNull { i ->
                Track.fromSpotify(toMap(items.getJSONObject(i)))
            }
        )
    }

    fun searchArtists(query: String, limit: Int = 5): List<Artist> {
        val url = "https://api.spotify.com/v1/search?q=${java.net.URLEncoder.encode(query, "UTF-8")}&type=artist&limit=$limit"
        val json = jsonGet(url) ?: return emptyList()
        val items = json.optJSONObject("artists")?.optJSONArray("items") ?: return emptyList()
        return (0 until items.length()).mapNotNull { i ->
            artistFromJson(items.getJSONObject(i))
        }
    }

    fun getArtist(artistId: String): Artist? {
        val json = jsonGet("https://api.spotify.com/v1/artists/$artistId") ?: return null
        return artistFromJson(json)
    }

    fun getArtistTopTracks(artistId: String, market: String = "US"): List<Track> {
        val json = jsonGet("https://api.spotify.com/v1/artists/$artistId/top-tracks?market=$market") ?: return emptyList()
        val items = json.optJSONArray("tracks") ?: return emptyList()
        return (0 until items.length()).mapNotNull { i ->
            Track.fromSpotify(toMap(items.getJSONObject(i)))
        }
    }

    fun getRelatedArtists(artistId: String): List<Artist> {
        val json = jsonGet("https://api.spotify.com/v1/artists/$artistId/related-artists") ?: return emptyList()
        val items = json.optJSONArray("artists") ?: return emptyList()
        return (0 until items.length()).mapNotNull { i ->
            artistFromJson(items.getJSONObject(i))
        }
    }

    private fun artistFromJson(item: JSONObject): Artist {
        val images = item.optJSONArray("images")
        val genresArray = item.optJSONArray("genres")
        return Artist(
            id = item.optString("id"),
            name = item.optString("name"),
            imageUrl = if (images != null && images.length() > 0) {
                images.getJSONObject(0).optString("url")
            } else null,
            genres = (0 until (genresArray?.length() ?: 0)).mapNotNull { genresArray?.getString(it) },
            followers = item.optJSONObject("followers")?.optInt("total", 0) ?: 0,
            popularity = item.optInt("popularity", 0)
        )
    }
}

private fun toMap(obj: JSONObject): Map<String, Any?> {
    val map = mutableMapOf<String, Any?>()
    for (key in obj.keys()) {
        val value = obj.get(key)
        map[key] = when (value) {
            is JSONObject -> toMap(value)
            is JSONArray -> (0 until value.length()).map { value.get(it) }
            else -> value
        }
    }
    return map
}
