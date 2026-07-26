package com.sinc.enhanced.data.remote

import android.util.Log
import com.sinc.enhanced.data.model.Track
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject

/** TODO: Convert all public methods to suspend functions */
class DeezerClient(private val client: OkHttpClient) {

    private fun deezerGet(url: String): JSONObject? {
        return try {
            val request = Request.Builder().url(url).build()
            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) return@use null
                JSONObject(response.body?.string() ?: return@use null)
            }
        } catch (e: Exception) { Log.e("DeezerClient", "deezerGet failed", e); null }
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

    fun searchTracks(query: String, limit: Int = 10): List<DeezerTrack> {
        val url = "https://api.deezer.com/search/track?q=${java.net.URLEncoder.encode(query, "UTF-8")}&limit=$limit&output=json"
        val json = deezerGet(url) ?: return emptyList()
        val data = json.optJSONArray("data") ?: return emptyList()
        return (0 until data.length()).mapNotNull { i ->
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

    fun getTrack(trackId: Long): DeezerTrack? {
        val json = deezerGet("https://api.deezer.com/track/$trackId") ?: return null
        return try {
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

    fun getTrackByIsrc(isrc: String): DeezerTrack? {
        val json = deezerGet("https://api.deezer.com/track/isrc:$isrc") ?: return null
        return try {
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
}
