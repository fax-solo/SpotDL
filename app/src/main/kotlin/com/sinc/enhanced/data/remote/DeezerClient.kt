package com.sinc.enhanced.data.remote

import android.util.Log
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONArray
import org.json.JSONObject

class DeezerClient(private val client: OkHttpClient) {

    private suspend fun deezerGet(url: String): JSONObject? = withContext(Dispatchers.IO) {
        try {
            val request = Request.Builder().url(url).build()
            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) return@use null
                JSONObject(response.body?.string() ?: return@use null)
            }
        } catch (e: CancellationException) { throw e }
        catch (e: Exception) { Log.e("DeezerClient", "deezerGet failed", e); null }
    }

    data class DeezerTrack(
        val id: Long,
        val title: String,
        val artist: String,
        val album: String,
        val duration: Int,
        val previewUrl: String?,
        val artworkUrl: String?,
        val isrc: String?
    )

    data class DeezerPlaylist(
        val id: Long,
        val title: String,
        val description: String = "",
        val imageUrl: String? = null,
        val creator: String = "Unknown",
        val trackCount: Int = 0
    )

    suspend fun searchTracks(query: String, limit: Int = 10): List<DeezerTrack> = withContext(Dispatchers.IO) {
        val url = "https://api.deezer.com/search/track?q=${java.net.URLEncoder.encode(query, "UTF-8")}&limit=$limit&output=json"
        val json = deezerGet(url) ?: return@withContext emptyList()
        val data = json.optJSONArray("data") ?: return@withContext emptyList()
        return@withContext (0 until data.length()).mapNotNull { i ->
            val item = data.getJSONObject(i)
            try {
                val artist = item.getJSONObject("artist")
                val album = item.getJSONObject("album")
                DeezerTrack(
                    id = item.getLong("id"),
                    title = item.getString("title"),
                    artist = artist.getString("name"),
                    album = album.getString("title"),
                    duration = item.getInt("duration"),
                    previewUrl = item.optString("preview", null),
                    artworkUrl = album.optString("cover_medium", album.optString("cover", null)),
                    isrc = item.optString("isrc", null)
                )
            } catch (e: Exception) { Log.e("DeezerClient", "searchTracks item failed", e); null }
        }
    }

    suspend fun getTrack(trackId: Long): DeezerTrack? = withContext(Dispatchers.IO) {
        val json = deezerGet("https://api.deezer.com/track/$trackId") ?: return@withContext null
        return@withContext try {
            val artist = json.getJSONObject("artist")
            val album = json.getJSONObject("album")
            DeezerTrack(
                id = json.getLong("id"),
                title = json.getString("title"),
                artist = artist.getString("name"),
                album = album.getString("title"),
                duration = json.getInt("duration"),
                previewUrl = json.optString("preview", null),
                artworkUrl = album.optString("cover_medium", album.optString("cover", null)),
                isrc = json.optString("isrc", null)
            )
        } catch (e: Exception) { Log.e("DeezerClient", "getTrack failed", e); null }
    }

    suspend fun getTrackByIsrc(isrc: String): DeezerTrack? = withContext(Dispatchers.IO) {
        val json = deezerGet("https://api.deezer.com/track/isrc:$isrc") ?: return@withContext null
        return@withContext try {
            val artist = json.getJSONObject("artist")
            val album = json.getJSONObject("album")
            DeezerTrack(
                id = json.getLong("id"),
                title = json.getString("title"),
                artist = artist.getString("name"),
                album = album.getString("title"),
                duration = json.getInt("duration"),
                previewUrl = json.optString("preview", null),
                artworkUrl = album.optString("cover_medium", album.optString("cover", null)),
                isrc = json.optString("isrc", null)
            )
        } catch (e: Exception) { Log.e("DeezerClient", "getTrackByIsrc failed", e); null }
    }

    suspend fun getPlaylist(playlistId: Long): DeezerPlaylist? = withContext(Dispatchers.IO) {
        val json = deezerGet("https://api.deezer.com/playlist/$playlistId") ?: return@withContext null
        return@withContext try {
            val img = json.optJSONObject("picture") ?: json
            DeezerPlaylist(
                id = json.getLong("id"),
                title = json.getString("title"),
                description = json.optString("description", ""),
                imageUrl = json.optString("picture_big", json.optString("picture_medium", null)),
                creator = json.optJSONObject("creator")?.optString("name", "Unknown") ?: "Unknown",
                trackCount = json.optInt("nb_tracks", 0)
            )
        } catch (e: Exception) { Log.e("DeezerClient", "getPlaylist failed", e); null }
    }

    suspend fun getPlaylistTracks(playlistId: Long, index: Int = 0, limit: Int = 100): List<DeezerTrack> = withContext(Dispatchers.IO) {
        val json = deezerGet("https://api.deezer.com/playlist/$playlistId/tracks?index=$index&limit=$limit") ?: return@withContext emptyList()
        val data = json.optJSONArray("data") ?: return@withContext emptyList()
        return@withContext (0 until data.length()).mapNotNull { i ->
            val item = data.getJSONObject(i)
            try {
                val artist = item.getJSONObject("artist")
                val album = item.getJSONObject("album")
                DeezerTrack(
                    id = item.getLong("id"),
                    title = item.getString("title"),
                    artist = artist.getString("name"),
                    album = album.getString("title"),
                    duration = item.getInt("duration"),
                    previewUrl = item.optString("preview", null),
                    artworkUrl = album.optString("cover_medium", album.optString("cover", null)),
                    isrc = item.optString("isrc", null)
                )
            } catch (e: Exception) { Log.e("DeezerClient", "getPlaylistTracks item failed", e); null }
        }
    }

    suspend fun searchPlaylists(query: String, limit: Int = 5): List<DeezerPlaylist> = withContext(Dispatchers.IO) {
        val url = "https://api.deezer.com/search/playlist?q=${java.net.URLEncoder.encode(query, "UTF-8")}&limit=$limit&output=json"
        val json = deezerGet(url) ?: return@withContext emptyList()
        val data = json.optJSONArray("data") ?: return@withContext emptyList()
        return@withContext (0 until data.length()).mapNotNull { i ->
            val item = data.getJSONObject(i)
            try {
                DeezerPlaylist(
                    id = item.getLong("id"),
                    title = item.getString("title"),
                    description = item.optString("description", ""),
                    imageUrl = item.optString("picture_big", item.optString("picture_medium", null)),
                    creator = item.optJSONObject("creator")?.optString("name", "Unknown") ?: "Unknown",
                    trackCount = item.optInt("nb_tracks", 0)
                )
            } catch (e: Exception) { Log.e("DeezerClient", "searchPlaylists item failed", e); null }
        }
    }
}
