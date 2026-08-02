package com.sinc.enhanced.data.remote

import android.util.Log
import com.sinc.enhanced.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.util.LinkedHashMap

class ArtworkClient(private val client: OkHttpClient) {

    companion object {
        private val LASTFM_API_KEY = BuildConfig.LASTFM_API_KEY
    }

    private val cache = LinkedHashMap<String, String>(100, 0.75f, true)
    private val mutex = Mutex()

    // Canonical fallback chain. Order matters: prefer providers with the most
    // reliable metadata, then the most permissive ones. Keep in sync with:
    //   - api/artwork_fallback.py (FastAPI)
    //   - frontend/functions/api/_lib/artworkFallback.ts (Cloudflare Functions)
    suspend fun findArtwork(title: String, artist: String, isrc: String? = null): String? = withContext(Dispatchers.IO) {
        mutex.withLock {
            val cacheKey = "$artist||$title"
            cache[cacheKey]?.let { return@withContext it }

            val urls = listOfNotNull(
                searchDeezerArtwork(title, artist),
                searchItunesArtwork(title, artist),
                searchLastfmArtwork(title, artist),
                if (isrc != null) searchCoverArtArchive(isrc, title, artist) else null
            )
            val result = urls.firstOrNull()
            if (result != null) {
                cache[cacheKey] = result
                if (cache.size > 200) {
                    val eldest = cache.keys.firstOrNull()
                    if (eldest != null) cache.remove(eldest)
                }
            }
            result
        }
    }

    private suspend fun searchDeezerArtwork(title: String, artist: String): String? = withContext(Dispatchers.IO) {
        try {
            val query = java.net.URLEncoder.encode("$artist $title", "UTF-8")
            val request = Request.Builder()
                .url("https://api.deezer.com/search?q=$query&limit=3&order=RANKING")
                .build()
            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) return@use null
                val json = JSONObject(response.body?.string() ?: return@use null)
                val track = json.optJSONArray("data")?.optJSONObject(0) ?: return@use null
                track.optJSONObject("album")?.optString("cover_big")
                    .takeIf { !it.isNullOrEmpty() }
                    ?: track.optJSONObject("album")?.optString("cover_medium")
                        .takeIf { !it.isNullOrEmpty() }
            }
        } catch (e: Exception) { Log.e("ArtworkClient", "searchDeezerArtwork failed", e); null }
    }

    private suspend fun searchItunesArtwork(title: String, artist: String): String? = withContext(Dispatchers.IO) {
        try {
            val query = java.net.URLEncoder.encode("$artist $title", "UTF-8")
            val request = Request.Builder()
                .url("https://itunes.apple.com/search?term=$query&media=music&limit=3")
                .header("Accept", "application/json")
                .build()
            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) return@use null
                val json = JSONObject(response.body?.string() ?: return@use null)
                val results = json.optJSONArray("results") ?: return@use null
                for (i in 0 until results.length()) {
                    val item = results.getJSONObject(i)
                    if (item.optString("kind") == "song") {
                        return@use item.optString("artworkUrl100", "")
                            .replace("100x100", "600x600")
                    }
                }
                null
            }
        } catch (e: Exception) { Log.e("ArtworkClient", "searchItunesArtwork failed", e); null }
    }

    private suspend fun searchLastfmArtwork(title: String, artist: String): String? = withContext(Dispatchers.IO) {
        try {
            val url = okhttp3.HttpUrl.Builder()
                .scheme("https")
                .host("ws.audioscrobbler.com")
                .addPathSegment("2.0")
                .addQueryParameter("method", "track.getInfo")
                .addQueryParameter("api_key", LASTFM_API_KEY)
                .addQueryParameter("artist", artist)
                .addQueryParameter("track", title)
                .addQueryParameter("format", "json")
                .addQueryParameter("autocorrect", "1")
                .build()
                .toString()
            val request = Request.Builder()
                .url(url)
                .build()
            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) return@use null
                val json = JSONObject(response.body?.string() ?: return@use null)
                val images = json.optJSONObject("track")
                    ?.optJSONObject("album")
                    ?.optJSONArray("image") ?: return@use null
                val sizes = listOf("extralarge", "large", "medium")
                for (size in sizes) {
                    for (i in 0 until images.length()) {
                        val img = images.getJSONObject(i)
                        if (img.optString("size") == size) {
                            val url = img.optString("#text")
                            if (url.isNotEmpty()) return@use url
                        }
                    }
                }
                if (images.length() > 0) {
                    val last = images.getJSONObject(images.length() - 1).optString("#text")
                    if (last.isNotEmpty()) return@use last
                }
                null
            }
        } catch (e: Exception) { Log.e("ArtworkClient", "searchLastfmArtwork failed", e); null }
    }

    private suspend fun searchCoverArtArchive(isrc: String, title: String, artist: String): String? = withContext(Dispatchers.IO) {
        try {
            val mbid = mbidFromIsrc(isrc) ?: mbidFromTrack(artist, title) ?: return@withContext null
            val request = Request.Builder()
                .url("https://coverartarchive.org/release/$mbid/front-250")
                .build()
            client.newCall(request).execute().use { response ->
                if (response.isSuccessful) "https://coverartarchive.org/release/$mbid/front-250" else null
            }
        } catch (e: Exception) { Log.e("ArtworkClient", "searchCoverArtArchive failed", e); null }
    }

    private suspend fun mbidFromIsrc(isrc: String): String? = withContext(Dispatchers.IO) {
        try {
            val request = Request.Builder()
                .url("https://musicbrainz.org/ws/2/recording/?query=isrc:$isrc&limit=1&fmt=json")
                .header("User-Agent", "SincEnhanced/1.0")
                .build()
            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) return@use null
                val json = JSONObject(response.body?.string() ?: return@use null)
                json.optJSONArray("recordings")
                    ?.optJSONObject(0)
                    ?.optJSONArray("releases")
                    ?.optJSONObject(0)
                    ?.optString("id")
            }
        } catch (e: Exception) { Log.e("ArtworkClient", "mbidFromIsrc failed", e); null }
    }

    private suspend fun mbidFromTrack(artist: String, title: String): String? = withContext(Dispatchers.IO) {
        try {
            val query = java.net.URLEncoder.encode("artist:\"$artist\" AND recording:\"$title\"", "UTF-8")
            val request = Request.Builder()
                .url("https://musicbrainz.org/ws/2/recording/?query=$query&limit=3&fmt=json")
                .header("User-Agent", "SincEnhanced/1.0")
                .build()
            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) return@use null
                val json = JSONObject(response.body?.string() ?: return@use null)
                val recordings = json.optJSONArray("recordings") ?: return@use null
                for (i in 0 until recordings.length()) {
                    val releases = recordings.getJSONObject(i).optJSONArray("releases")
                    if (releases != null && releases.length() > 0) {
                        return@use releases.getJSONObject(0).optString("id")
                    }
                }
                null
            }
        } catch (e: Exception) { Log.e("ArtworkClient", "mbidFromTrack failed", e); null }
    }
}