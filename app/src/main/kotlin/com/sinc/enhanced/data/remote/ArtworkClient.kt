package com.sinc.enhanced.data.remote

import android.util.Log
import com.sinc.enhanced.BuildConfig
import kotlin.jvm.Synchronized
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.util.LinkedHashMap

class ArtworkClient(private val client: OkHttpClient) {

    companion object {
        private val LASTFM_API_KEY = BuildConfig.LASTFM_API_KEY
    }

    private val cache = LinkedHashMap<String, String>(100, 0.75f, true)

    @Synchronized
    fun findArtwork(title: String, artist: String, isrc: String? = null): String? {
        val cacheKey = "$artist||$title"
        cache[cacheKey]?.let { return it }

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
        return result
    }

    private fun searchDeezerArtwork(title: String, artist: String): String? {
        return try {
            val query = java.net.URLEncoder.encode("$artist $title", "UTF-8")
            val request = Request.Builder()
                .url("https://api.deezer.com/search?q=$query&limit=3&order=RANKING")
                .build()
            val response = client.newCall(request).execute()
            if (!response.isSuccessful) return null
            val json = JSONObject(response.body?.string() ?: return null)
            val track = json.optJSONArray("data")?.optJSONObject(0) ?: return null
            track.optJSONObject("album")?.optString("cover_big")
                .takeIf { !it.isNullOrEmpty() }
                ?: track.optJSONObject("album")?.optString("cover_medium")
                    .takeIf { !it.isNullOrEmpty() }
        } catch (e: Exception) { Log.e("ArtworkClient", "searchDeezerArtwork failed", e); null }
    }

    private fun searchItunesArtwork(title: String, artist: String): String? {
        return try {
            val query = java.net.URLEncoder.encode("$artist $title", "UTF-8")
            val request = Request.Builder()
                .url("https://itunes.apple.com/search?term=$query&media=music&limit=3")
                .header("Accept", "application/json")
                .build()
            val response = client.newCall(request).execute()
            if (!response.isSuccessful) return null
            val json = JSONObject(response.body?.string() ?: return null)
            val results = json.optJSONArray("results") ?: return null
            for (i in 0 until results.length()) {
                val item = results.getJSONObject(i)
                if (item.optString("kind") == "song") {
                    return item.optString("artworkUrl100", "")
                        .replace("100x100", "600x600")
                }
            }
            null
        } catch (e: Exception) { Log.e("ArtworkClient", "searchItunesArtwork failed", e); null }
    }

    private fun searchLastfmArtwork(title: String, artist: String): String? {
        return try {
            val params = java.net.URLEncoder.encode(
                "method=track.getInfo&api_key=$LASTFM_API_KEY&artist=$artist&track=$title&format=json&autocorrect=1",
                "UTF-8"
            ).replace("%3D", "=").replace("%26", "&")
            val request = Request.Builder()
                .url("https://ws.audioscrobbler.com/2.0/?$params")
                .build()
            val response = client.newCall(request).execute()
            if (!response.isSuccessful) return null
            val json = JSONObject(response.body?.string() ?: return null)
            val images = json.optJSONObject("track")
                ?.optJSONObject("album")
                ?.optJSONArray("image") ?: return null
            val sizes = listOf("extralarge", "large", "medium")
            for (size in sizes) {
                for (i in 0 until images.length()) {
                    val img = images.getJSONObject(i)
                    if (img.optString("size") == size) {
                        val url = img.optString("#text")
                        if (url.isNotEmpty()) return url
                    }
                }
            }
            null
        } catch (e: Exception) { Log.e("ArtworkClient", "searchLastfmArtwork failed", e); null }
    }

    private fun searchCoverArtArchive(isrc: String, title: String, artist: String): String? {
        return try {
            val mbid = mbidFromIsrc(isrc) ?: mbidFromTrack(artist, title) ?: return null
            val request = Request.Builder()
                .url("https://coverartarchive.org/release/$mbid/front-250")
                .build()
            val response = client.newCall(request).execute()
            if (response.isSuccessful) "https://coverartarchive.org/release/$mbid/front-250" else null
        } catch (e: Exception) { Log.e("ArtworkClient", "searchCoverArtArchive failed", e); null }
    }

    private fun mbidFromIsrc(isrc: String): String? {
        return try {
            val request = Request.Builder()
                .url("https://musicbrainz.org/ws/2/recording/?query=isrc:$isrc&limit=1&fmt=json")
                .header("User-Agent", "SincEnhanced/1.0")
                .build()
            val response = client.newCall(request).execute()
            if (!response.isSuccessful) return null
            val json = JSONObject(response.body?.string() ?: return null)
            json.optJSONArray("recordings")
                ?.optJSONObject(0)
                ?.optJSONArray("releases")
                ?.optJSONObject(0)
                ?.optString("id")
        } catch (e: Exception) { Log.e("ArtworkClient", "mbidFromIsrc failed", e); null }
    }

    private fun mbidFromTrack(artist: String, title: String): String? {
        return try {
            val query = java.net.URLEncoder.encode("artist:\"$artist\" AND recording:\"$title\"", "UTF-8")
            val request = Request.Builder()
                .url("https://musicbrainz.org/ws/2/recording/?query=$query&limit=3&fmt=json")
                .header("User-Agent", "SincEnhanced/1.0")
                .build()
            val response = client.newCall(request).execute()
            if (!response.isSuccessful) return null
            val json = JSONObject(response.body?.string() ?: return null)
            val recordings = json.optJSONArray("recordings") ?: return null
            for (i in 0 until recordings.length()) {
                val releases = recordings.getJSONObject(i).optJSONArray("releases")
                if (releases != null && releases.length() > 0) {
                    return releases.getJSONObject(0).optString("id")
                }
            }
            null
        } catch (e: Exception) { Log.e("ArtworkClient", "mbidFromTrack failed", e); null }
    }
}
