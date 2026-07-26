package com.sinc.enhanced.data.remote

import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject

class LyricsClient(
    private val client: OkHttpClient,
    private val cacheDb: LyricsCacheDb
) {
    data class LyricsResult(
        val plainLyrics: String?,
        val syncedLyrics: String?,
        val source: String = "lrclib"
    )

    suspend fun getLyrics(artist: String, title: String, album: String? = null, duration: Long? = null): LyricsResult = withContext(Dispatchers.IO) {
        val cacheKey = buildCacheKey(artist, title)

        cacheDb.read(cacheKey)?.let { return@withContext it }

        val result = fetchFromLrclib(artist, title, album, duration)
        if (result.plainLyrics != null || result.syncedLyrics != null) {
            cacheDb.write(cacheKey, result)
            return@withContext result
        }

        val result2 = fetchFromLyricsOvh(artist, title)
        if (result2.plainLyrics != null) {
            val finalResult = result2.copy(source = "lyricsovh")
            cacheDb.write(cacheKey, finalResult)
            return@withContext finalResult
        }

        val result3 = fetchFromDeezer(artist, title)
        if (result3.plainLyrics != null) {
            val finalResult = result3.copy(source = "deezer")
            cacheDb.write(cacheKey, finalResult)
            return@withContext finalResult
        }

        LyricsResult(null, null)
    }

    private suspend fun fetchFromLrclib(artist: String, title: String, album: String?, duration: Long?): LyricsResult = withContext(Dispatchers.IO) {
        val artistEnc = java.net.URLEncoder.encode(artist, "UTF-8")
        val titleEnc = java.net.URLEncoder.encode(title, "UTF-8")
        val url = buildString {
            append("https://lrclib.net/api/get?artist_name=$artistEnc&track_name=$titleEnc")
            if (album != null) {
                append("&album_name=${java.net.URLEncoder.encode(album, "UTF-8")}")
            }
            if (duration != null) {
                append("&duration=$duration")
            }
        }
        try {
            val request = Request.Builder()
                .url(url)
                .header("User-Agent", "SincEnhanced/1.0 (Android)")
                .build()
            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) return@use LyricsResult(null, null)
                val body = response.body?.string() ?: return@use LyricsResult(null, null)
                val json = JSONObject(body)
                LyricsResult(
                    plainLyrics = json.optString("plainLyrics", "").takeIf { it.isNotEmpty() },
                    syncedLyrics = json.optString("syncedLyrics", "").takeIf { it.isNotEmpty() },
                    source = "lrclib"
                )
            }
        } catch (e: Exception) { Log.e("LyricsClient", "fetchFromLrclib failed", e); LyricsResult(null, null) }
    }

    private suspend fun fetchFromLyricsOvh(artist: String, title: String): LyricsResult = withContext(Dispatchers.IO) {
        val artistEnc = java.net.URLEncoder.encode(artist, "UTF-8")
        val titleEnc = java.net.URLEncoder.encode(title, "UTF-8")
        val url = "https://api.lyrics.ovh/v1/$artistEnc/$titleEnc"
        try {
            val request = Request.Builder()
                .url(url)
                .header("User-Agent", "SincEnhanced/1.0 (Android)")
                .build()
            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) return@use LyricsResult(null, null)
                val body = response.body?.string() ?: return@use LyricsResult(null, null)
                val lyrics = JSONObject(body).optString("lyrics", "").takeIf { it.isNotEmpty() }
                LyricsResult(plainLyrics = lyrics, syncedLyrics = null, source = "lyricsovh")
            }
        } catch (e: Exception) { Log.e("LyricsClient", "fetchFromLyricsOvh failed", e); LyricsResult(null, null) }
    }

    private suspend fun fetchFromDeezer(artist: String, title: String): LyricsResult = withContext(Dispatchers.IO) {
        val query = java.net.URLEncoder.encode("$artist $title", "UTF-8")
        try {
            val searchUrl = "https://api.deezer.com/search/track?q=$query&limit=3&output=json"
            val searchReq = Request.Builder().url(searchUrl).build()
            val trackId = client.newCall(searchReq).execute().use { response ->
                if (!response.isSuccessful) return@use null
                val searchJson = JSONObject(response.body?.string() ?: return@use null)
                val data = searchJson.optJSONArray("data") ?: return@use null
                if (data.length() == 0) return@use null
                val id = data.getJSONObject(0).optLong("id", -1)
                if (id < 0) return@use null
                id
            } ?: return@withContext LyricsResult(null, null)

            val trackUrl = "https://api.deezer.com/track/$trackId"
            val trackReq = Request.Builder().url(trackUrl).build()
            client.newCall(trackReq).execute().use { response ->
                if (!response.isSuccessful) return@withContext LyricsResult(null, null)
                val trackJson = JSONObject(response.body?.string() ?: return@withContext LyricsResult(null, null))
                @Suppress("UNUSED_VARIABLE")
                val explicitLyrics = trackJson.optInt("explicit_lyrics", 0)
            }

            val lyricsUrl = "https://api.deezer.com/track/$trackId/lyrics"
            val lyricsReq = Request.Builder().url(lyricsUrl).build()
            client.newCall(lyricsReq).execute().use { response ->
                if (!response.isSuccessful) return@withContext LyricsResult(null, null)
                val lyricsJson = JSONObject(response.body?.string() ?: return@withContext LyricsResult(null, null))
                val text = lyricsJson.optString("lyrics", "").takeIf { it.isNotEmpty() }
                LyricsResult(plainLyrics = text, syncedLyrics = null, source = "deezer")
            }
        } catch (e: Exception) { Log.e("LyricsClient", "fetchFromDeezer failed", e); LyricsResult(null, null) }
    }

    suspend fun searchLyrics(query: String): List<LyricsResult> = withContext(Dispatchers.IO) {
        val enc = java.net.URLEncoder.encode(query, "UTF-8")
        val url = "https://lrclib.net/api/search?q=$enc"
        try {
            val request = Request.Builder()
                .url(url)
                .header("User-Agent", "SincEnhanced/1.0 (Android)")
                .build()
            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) return@use emptyList()
                val body = response.body?.string() ?: return@use emptyList()
                val arr = JSONObject("{\"items\":$body}").optJSONArray("items") ?: return@use emptyList()
                (0 until arr.length()).mapNotNull { i ->
                    val json = arr.getJSONObject(i)
                    LyricsResult(
                        plainLyrics = json.optString("plainLyrics", "").takeIf { it.isNotEmpty() },
                        syncedLyrics = json.optString("syncedLyrics", "").takeIf { it.isNotEmpty() },
                        source = "lrclib"
                    )
                }
            }
        } catch (e: Exception) { Log.e("LyricsClient", "searchLyrics failed", e); emptyList() }
    }

    private fun buildCacheKey(artist: String, title: String): String {
        return "${artist.lowercase().trim()}|${title.lowercase().trim()}"
    }
}

interface LyricsCacheDb {
    suspend fun read(key: String): LyricsClient.LyricsResult?
    suspend fun write(key: String, result: LyricsClient.LyricsResult)
}