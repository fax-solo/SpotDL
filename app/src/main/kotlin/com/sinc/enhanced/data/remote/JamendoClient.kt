package com.sinc.enhanced.data.remote

import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.net.URLEncoder

class JamendoClient(private val client: OkHttpClient) {

    data class JamendoTrack(
        val id: String,
        val title: String,
        val artist: String,
        val album: String,
        val duration: Int,
        val audioUrl: String?,
        val artworkUrl: String?,
        val genre: String? = null
    )

    companion object {
        const val DEFAULT_CLIENT_ID = "4c9f79a7"
    }

    private var clientId: String = DEFAULT_CLIENT_ID

    fun setClientId(id: String) {
        clientId = id
    }

    fun search(query: String, limit: Int = 5): List<JamendoTrack> {
        val url = "https://api.jamendo.com/v3.0/tracks/?" +
                "client_id=$clientId&" +
                "format=json&" +
                "search=${URLEncoder.encode(query, "UTF-8")}&" +
                "limit=$limit&" +
                "include=musicinfo&" +
                "audioformat=mp32"
        return try {
            val request = Request.Builder().url(url).build()
            val response = client.newCall(request).execute()
            if (!response.isSuccessful) return emptyList()
            val json = JSONObject(response.body?.string() ?: return emptyList())
            val tracks = json.optJSONArray("results") ?: return emptyList()
            (0 until minOf(tracks.length(), limit)).mapNotNull { i ->
                val item = tracks.getJSONObject(i)
                val musicInfo = item.optJSONObject("musicinfo")
                JamendoTrack(
                    id = item.optString("id"),
                    title = item.optString("name"),
                    artist = item.optString("artist_name"),
                    album = item.optString("album_name"),
                    duration = item.optInt("duration"),
                    audioUrl = item.optString("audio"),
                    artworkUrl = item.optString("image"),
                    genre = (musicInfo?.optString("genre") ?: "").ifEmpty { null }
                )
            }
        } catch (_: Exception) { emptyList() }
    }
}
