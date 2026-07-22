package com.sinc.enhanced.data.remote

import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.net.URLEncoder

class AudiusClient(private val client: OkHttpClient) {

    data class AudiusTrack(
        val id: String,
        val title: String,
        val artist: String,
        val duration: Long,
        val artworkUrl: String?,
        val streamUrl: String?,
        val genre: String? = null
    )

    private var cachedNode: String? = null
    private var lastNodeCheck: Long = 0

    private fun getNode(): String {
        cachedNode?.let {
            if (System.currentTimeMillis() - lastNodeCheck < 3600000L) return it
        }
        val defaultNode = "https://discoveryprovider.audius.co"
        return try {
            val request = Request.Builder()
                .url("https://api.audius.co")
                .build()
            val response = client.newCall(request).execute()
            if (!response.isSuccessful) return defaultNode
            val json = JSONObject(response.body?.string() ?: return defaultNode)
            val nodes = json.optJSONArray("data") ?: return defaultNode
            val node = nodes.optString(0, "").trimEnd('/')
            if (node.isNotEmpty()) {
                cachedNode = node
                lastNodeCheck = System.currentTimeMillis()
                node
            } else defaultNode
        } catch (_: Exception) { defaultNode }
    }

    fun search(query: String, limit: Int = 5): List<AudiusTrack> {
        val node = getNode()
        val url = "$node/v1/full/tracks/search?query=${URLEncoder.encode(query, "UTF-8")}&limit=$limit&app_name=SincEnhanced"
        return try {
            val request = Request.Builder()
                .url(url)
                .header("Accept", "application/json")
                .build()
            val response = client.newCall(request).execute()
            if (!response.isSuccessful) return emptyList()
            val json = JSONObject(response.body?.string() ?: return emptyList())
            val data = json.optJSONObject("data") ?: return emptyList()
            val tracks = data.optJSONArray("tracks") ?: return emptyList()
            (0 until minOf(tracks.length(), limit)).mapNotNull { i ->
                val item = tracks.getJSONObject(i)
                val user = item.optJSONObject("user")
                AudiusTrack(
                    id = item.optString("track_id") ?: item.optString("id"),
                    title = item.optString("title"),
                    artist = user?.optString("name") ?: item.optString("handle") ?: "Unknown",
                    duration = item.optLong("duration") ?: 0L,
                    artworkUrl = item.optString("artwork").ifEmpty { null },
                    streamUrl = item.optString("download_url")
                        ?: "$node/v1/tracks/${item.optString("track_id") ?: item.optString("id")}/stream?app_name=SincEnhanced",
                    genre = item.optString("genre").ifEmpty { null }
                )
            }
        } catch (_: Exception) { emptyList() }
    }

    fun getStreamUrl(trackId: String): String? {
        val node = getNode()
        val url = "$node/v1/tracks/$trackId/stream?app_name=SincEnhanced"
        return try {
            val request = Request.Builder().url(url).build()
            val response = client.newCall(request).execute()
            if (response.isSuccessful) url else null
        } catch (_: Exception) { null }
    }
}
