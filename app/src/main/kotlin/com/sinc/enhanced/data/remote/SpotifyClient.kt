package com.sinc.enhanced.data.remote

import com.sinc.enhanced.BuildConfig
import com.sinc.enhanced.data.model.Album
import com.sinc.enhanced.data.model.Track
import okhttp3.FormBody
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONArray
import org.json.JSONObject

class SpotifyClient(private val client: OkHttpClient) {

    private var accessToken: String? = null
    private var tokenExpiresAt: Long = 0

    private fun getToken(): String {
        if (accessToken != null && System.currentTimeMillis() < tokenExpiresAt) {
            return accessToken!!
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
            accessToken = json.getString("access_token")
            tokenExpiresAt = System.currentTimeMillis() + (json.optLong("expires_in", 3600) * 1000) - 60000
            accessToken!!
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
