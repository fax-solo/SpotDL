package com.sinc.enhanced.data.remote

import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject

class LyricsClient(private val client: OkHttpClient) {

    data class LyricsResult(
        val plainLyrics: String?,
        val syncedLyrics: String?,
        val source: String = "lrclib"
    )

    fun getLyrics(artist: String, title: String, album: String? = null, duration: Long? = null): LyricsResult {
        val artistEnc = java.net.URLEncoder.encode(artist, "UTF-8")
        val titleEnc = java.net.URLEncoder.encode(title, "UTF-8")
        val url = "https://lrclib.net/api/get?artist_name=$artistEnc&track_name=$titleEnc"

        return try {
            val request = Request.Builder()
                .url(url)
                .header("User-Agent", "SincEnhanced/1.0 (Android)")
                .build()
            val response = client.newCall(request).execute()
            if (!response.isSuccessful) return LyricsResult(null, null)
            val body = response.body?.string() ?: return LyricsResult(null, null)
            val json = JSONObject(body)
            LyricsResult(
                plainLyrics = json.optString("plainLyrics", null)?.takeIf { it.isNotEmpty() },
                syncedLyrics = json.optString("syncedLyrics", null)?.takeIf { it.isNotEmpty() }
            )
        } catch (_: Exception) {
            LyricsResult(null, null)
        }
    }

    fun searchLyrics(query: String): List<LyricsResult> {
        val enc = java.net.URLEncoder.encode(query, "UTF-8")
        val url = "https://lrclib.net/api/search?q=$enc"

        return try {
            val request = Request.Builder()
                .url(url)
                .header("User-Agent", "SincEnhanced/1.0 (Android)")
                .build()
            val response = client.newCall(request).execute()
            if (!response.isSuccessful) return emptyList()
            val body = response.body?.string() ?: return emptyList()
            val arr = JSONObject("{\"items\":$body}").optJSONArray("items") ?: return emptyList()
            (0 until arr.length()).mapNotNull { i ->
                val json = arr.getJSONObject(i)
                LyricsResult(
                    plainLyrics = json.optString("plainLyrics", null)?.takeIf { it.isNotEmpty() },
                    syncedLyrics = json.optString("syncedLyrics", null)?.takeIf { it.isNotEmpty() }
                )
            }
        } catch (_: Exception) { emptyList() }
    }
}
