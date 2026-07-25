package com.sinc.enhanced.data.remote

import android.util.Log
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject

class SoundCloudClient(private val client: OkHttpClient) {

    @Volatile private var resolvedClientId: String? = null
    @Volatile private var lastResolved: Long = 0

    data class SoundCloudResult(
        val title: String,
        val uploader: String,
        val duration: Long,
        val thumbnailUrl: String?,
        val url: String,
        val trackId: String
    )

    data class StreamData(
        val url: String,
        val format: String = "mp3",
        val bitrate: Int = 0
    )

    private fun getClientId(): String {
        resolvedClientId?.let {
            if (System.currentTimeMillis() - lastResolved < 86400000L) return it
        }
        return try {
            val request = Request.Builder()
                .url("https://soundcloud.com")
                .header("User-Agent", "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36")
                .build()
            val response = client.newCall(request).execute()
            val html = response.body?.string() ?: return "a3e059563d7fd3372b49b37f00a00bcf"

            val patterns = listOf(
                Regex("""client_id["']?\s*[:=]\s*["']([a-f0-9]+)["']""", RegexOption.IGNORE_CASE),
                Regex("""client_id["']?\s*[:=]\s*["']([a-zA-Z0-9_]+)["']"""),
                Regex("""clientId["']?\s*[:=]\s*["']([a-f0-9]+)["']""", RegexOption.IGNORE_CASE),
            )
            for (pattern in patterns) {
                val match = pattern.find(html)
                if (match != null) {
                    val id = match.groupValues[1]
                    if (id.length >= 10) {
                        resolvedClientId = id
                        lastResolved = System.currentTimeMillis()
                        return id
                    }
                }
            }
            "a3e059563d7fd3372b49b37f00a00bcf"
        } catch (e: Exception) {
            Log.e("SoundCloudClient", "getClientId failed", e); "a3e059563d7fd3372b49b37f00a00bcf"
        }
    }

    fun search(query: String, limit: Int = 5): List<SoundCloudResult> {
        val clientId = getClientId()
        val url = "https://api-v2.soundcloud.com/search/tracks?q=${java.net.URLEncoder.encode(query, "UTF-8")}&client_id=$clientId&limit=$limit"
        return try {
            val request = Request.Builder()
                .url(url)
                .header("Accept", "application/json")
                .build()
            val response = client.newCall(request).execute()
            if (!response.isSuccessful) return emptyList()
            val json = JSONObject(response.body?.string() ?: return emptyList())
            val items = json.optJSONArray("collection") ?: return emptyList()
            (0 until minOf(items.length(), limit)).mapNotNull { i ->
                val item = items.getJSONObject(i)
                val user = item.optJSONObject("user")
                SoundCloudResult(
                    title = item.optString("title"),
                    uploader = user?.optString("username") ?: "Unknown",
                    duration = item.optLong("duration") / 1000,
                    thumbnailUrl = item.optString("artwork_url").ifEmpty { null },
                    url = item.optString("permalink_url"),
                    trackId = item.optString("id")
                )
            }
        } catch (e: Exception) { Log.e("SoundCloudClient", "search failed", e); emptyList() }
    }
}
