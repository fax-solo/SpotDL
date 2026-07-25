package com.sinc.enhanced.data.remote

import android.util.Log
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.net.URLEncoder

class FreeMusicArchiveClient(private val client: OkHttpClient) {

    data class FmaTrack(
        val id: String,
        val title: String,
        val artist: String,
        val album: String?,
        val duration: Long,
        val audioUrl: String?,
        val artworkUrl: String?,
        val genre: String? = null
    )

    fun search(query: String, limit: Int = 5): List<FmaTrack> {
        val url = "https://freemusicarchive.org/api/v1/tracks.json?" +
                "q=${URLEncoder.encode(query, "UTF-8")}&" +
                "limit=$limit"
        return try {
            val request = Request.Builder()
                .url(url)
                .header("Accept", "application/json")
                .header("User-Agent", "SincEnhanced/1.0")
                .build()
            val response = client.newCall(request).execute()
            if (!response.isSuccessful) return emptyList()
            val json = JSONObject(response.body?.string() ?: return emptyList())
            val dataset = json.optJSONArray("dataset") ?: return emptyList()
            (0 until minOf(dataset.length(), limit)).mapNotNull { i ->
                val item = dataset.getJSONObject(i)
                val trackId = item.optString("track_id")
                FmaTrack(
                    id = trackId,
                    title = item.optString("track_title"),
                    artist = item.optString("artist_name"),
                    album = item.optString("album_title").ifEmpty { null },
                    duration = item.optLong("track_duration"),
                    audioUrl = "https://freemusicarchive.org/music/${item.optString("artist_name")?.replace(" ", "-")}/download/$trackId/${item.optString("track_title")?.replace(" ", "-")}.mp3",
                    artworkUrl = item.optString("album_image_url").ifEmpty { null },
                    genre = item.optString("genre").ifEmpty { null }
                )
            }
        } catch (e: Exception) { Log.e("FreeMusicArchiveClient", "search failed", e); emptyList() }
    }

    fun genres(): List<String> {
        val url = "https://freemusicarchive.org/api/v2/genres"
        return try {
            val request = Request.Builder().url(url).build()
            val response = client.newCall(request).execute()
            if (!response.isSuccessful) return emptyList()
            val json = JSONObject(response.body?.string() ?: return emptyList())
            val data = json.optJSONArray("data") ?: return emptyList()
            (0 until data.length()).mapNotNull { i ->
                data.getJSONObject(i).optString("slug").ifEmpty { null }
            }
        } catch (e: Exception) { Log.e("FreeMusicArchiveClient", "genres failed", e); emptyList() }
    }
}
