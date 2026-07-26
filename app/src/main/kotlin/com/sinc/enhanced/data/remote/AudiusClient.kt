package com.sinc.enhanced.data.remote

import android.util.Log
import kotlin.jvm.Synchronized
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.net.URLEncoder

/** TODO: Convert all public methods to suspend functions */
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

    @Volatile private var cachedNode: String? = null
    @Volatile private var lastNodeCheck: Long = 0

    @Synchronized
    private fun getNode(): String {
        cachedNode?.let {
            if (System.currentTimeMillis() - lastNodeCheck < 3600000L) return it
        }
        val defaultNode = "https://discoveryprovider.audius.co"
        return try {
            val request = Request.Builder()
                .url("https://api.audius.co")
                .build()
            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) return@use defaultNode
                val json = JSONObject(response.body?.string() ?: return@use defaultNode)
                val nodes = json.optJSONArray("data") ?: return@use defaultNode
                val node = nodes.optString(0, "").trimEnd('/')
                if (node.isNotEmpty()) {
                    cachedNode = node
                    lastNodeCheck = System.currentTimeMillis()
                    node
                } else defaultNode
            }
        } catch (e: Exception) { Log.e("AudiusClient", "getNode failed", e); defaultNode }
    }

    fun search(query: String, limit: Int = 5): List<AudiusTrack> {
        val node = getNode()
        val url = "$node/v1/full/tracks/search?query=${URLEncoder.encode(query, "UTF-8")}&limit=$limit&app_name=SincEnhanced"
        return try {
            val request = Request.Builder()
                .url(url)
                .header("Accept", "application/json")
                .build()
            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) return@use emptyList()
                val json = JSONObject(response.body?.string() ?: return@use emptyList())
                val data = json.optJSONObject("data") ?: return@use emptyList()
                val tracks = data.optJSONArray("tracks") ?: return@use emptyList()
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
            }
        } catch (e: Exception) { Log.e("AudiusClient", "search failed", e); emptyList() }
    }

    fun getStreamUrl(trackId: String): String? {
        val node = getNode()
        val url = "$node/v1/tracks/$trackId/stream?app_name=SincEnhanced"
        return try {
            val request = Request.Builder().url(url).build()
            client.newCall(request).execute().use { response ->
                if (response.isSuccessful) url else null
            }
        } catch (e: Exception) { Log.e("AudiusClient", "getStreamUrl failed", e); null }
    }
}
