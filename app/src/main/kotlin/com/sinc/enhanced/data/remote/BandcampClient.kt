package com.sinc.enhanced.data.remote

import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.net.URLEncoder

class BandcampClient(private val client: OkHttpClient) {

    data class BandcampTrack(
        val id: String,
        val title: String,
        val artist: String,
        val album: String?,
        val duration: Long?,
        val artworkUrl: String?,
        val url: String
    )

    fun search(query: String, limit: Int = 5): List<BandcampTrack> {
        val url = "https://bandcamp.com/api/autocomplete/1/autocomplete?" +
                "q=${URLEncoder.encode(query, "UTF-8")}"
        return try {
            val request = Request.Builder()
                .url(url)
                .header("Accept", "application/json")
                .header("Referer", "https://bandcamp.com/")
                .build()
            val response = client.newCall(request).execute()
            if (!response.isSuccessful) return emptyList()
            val json = JSONObject(response.body?.string() ?: return emptyList())
            val results = json.optJSONArray("results") ?: return emptyList()

            val tracks = mutableListOf<BandcampTrack>()
            for (i in 0 until results.length()) {
                val result = results.getJSONObject(i)
                if (result.optString("type") != "t") continue
                val artistName = result.optString("band_name").ifEmpty {
                    result.optJSONObject("artist")?.optString("name") ?: "Unknown"
                }
                tracks.add(
                    BandcampTrack(
                        id = result.optString("id", "bc_$i"),
                        title = result.optString("name", "Unknown"),
                        artist = artistName,
                        album = result.optString("album_name").ifEmpty { null },
                        duration = null,
                        artworkUrl = result.optString("image_url").ifEmpty { null },
                        url = result.optString("url", result.optString("item_url", ""))
                    )
                )
                if (tracks.size >= limit) break
            }
            tracks
        } catch (_: Exception) { emptyList() }
    }

    fun getTrackInfo(trackUrl: String): BandcampTrack? {
        try {
            val apiUrl = trackUrl.replace("http://", "https://")
            val request = Request.Builder()
                .url(apiUrl)
                .header("User-Agent", "Mozilla/5.0")
                .build()
            val response = client.newCall(request).execute()
            if (!response.isSuccessful) return null
            val html = response.body?.string() ?: return null

            val title = Regex("<meta property=\"og:title\" content=\"([^\"]+)\"")
                .find(html)?.groupValues?.getOrNull(1)
            val artist = Regex("<meta property=\"og:site_name\" content=\"([^\"]+)\"")
                .find(html)?.groupValues?.getOrNull(1)
            val image = Regex("<meta property=\"og:image\" content=\"([^\"]+)\"")
                .find(html)?.groupValues?.getOrNull(1)
            val durationMatch = Regex("\"duration\":([0-9.]+)").find(html)

            return BandcampTrack(
                id = trackUrl.substringAfter("track/").substringBefore("/"),
                title = title ?: "Unknown",
                artist = artist ?: "Unknown",
                album = null,
                duration = durationMatch?.groupValues?.getOrNull(1)?.toDoubleOrNull()?.toLong(),
                artworkUrl = image,
                url = trackUrl
            )
        } catch (_: Exception) { return null }
    }
}
