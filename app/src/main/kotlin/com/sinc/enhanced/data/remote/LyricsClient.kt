package com.sinc.enhanced.data.remote

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject

class LyricsClient(
    private val client: OkHttpClient,
    private val context: Context
) {

    data class LyricsResult(
        val plainLyrics: String?,
        val syncedLyrics: String?,
        val source: String = "lrclib"
    )

    private val dbHelper = LyricsCacheDb(context)

    fun getLyrics(artist: String, title: String, album: String? = null, duration: Long? = null): LyricsResult {
        val cacheKey = buildCacheKey(artist, title)

        dbHelper.read(cacheKey)?.let { return it }

        val result = fetchFromLrclib(artist, title, album, duration)
        if (result.plainLyrics != null || result.syncedLyrics != null) {
            dbHelper.write(cacheKey, result)
            return result
        }

        val result2 = fetchFromLyricsOvh(artist, title)
        if (result2.plainLyrics != null) {
            val finalResult = result2.copy(source = "lyricsovh")
            dbHelper.write(cacheKey, finalResult)
            return finalResult
        }

        val result3 = fetchFromDeezer(artist, title)
        if (result3.plainLyrics != null) {
            val finalResult = result3.copy(source = "deezer")
            dbHelper.write(cacheKey, finalResult)
            return finalResult
        }

        return LyricsResult(null, null)
    }

    private fun fetchFromLrclib(artist: String, title: String, album: String?, duration: Long?): LyricsResult {
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
                plainLyrics = json.optString("plainLyrics", "").takeIf { it.isNotEmpty() },
                syncedLyrics = json.optString("syncedLyrics", "").takeIf { it.isNotEmpty() },
                source = "lrclib"
            )
        } catch (_: Exception) { LyricsResult(null, null) }
    }

    private fun fetchFromLyricsOvh(artist: String, title: String): LyricsResult {
        val artistEnc = java.net.URLEncoder.encode(artist, "UTF-8")
        val titleEnc = java.net.URLEncoder.encode(title, "UTF-8")
        val url = "https://api.lyrics.ovh/v1/$artistEnc/$titleEnc"
        return try {
            val request = Request.Builder()
                .url(url)
                .header("User-Agent", "SincEnhanced/1.0 (Android)")
                .build()
            val response = client.newCall(request).execute()
            if (!response.isSuccessful) return LyricsResult(null, null)
            val body = response.body?.string() ?: return LyricsResult(null, null)
            val lyrics = JSONObject(body).optString("lyrics", "").takeIf { it.isNotEmpty() }
            LyricsResult(plainLyrics = lyrics, syncedLyrics = null, source = "lyricsovh")
        } catch (_: Exception) { LyricsResult(null, null) }
    }

    private fun fetchFromDeezer(artist: String, title: String): LyricsResult {
        val query = java.net.URLEncoder.encode("$artist $title", "UTF-8")
        return try {
            val searchUrl = "https://api.deezer.com/search/track?q=$query&limit=3&output=json"
            val searchReq = Request.Builder().url(searchUrl).build()
            val searchResp = client.newCall(searchReq).execute()
            if (!searchResp.isSuccessful) return LyricsResult(null, null)
            val searchJson = JSONObject(searchResp.body?.string() ?: return LyricsResult(null, null))
            val data = searchJson.optJSONArray("data") ?: return LyricsResult(null, null)
            if (data.length() == 0) return LyricsResult(null, null)
            val trackId = data.getJSONObject(0).optLong("id", -1)
            if (trackId < 0) return LyricsResult(null, null)

            val trackUrl = "https://api.deezer.com/track/$trackId"
            val trackReq = Request.Builder().url(trackUrl).build()
            val trackResp = client.newCall(trackReq).execute()
            if (!trackResp.isSuccessful) return LyricsResult(null, null)
            val trackJson = JSONObject(trackResp.body?.string() ?: return LyricsResult(null, null))
            val explicitLyrics = trackJson.optInt("explicit_lyrics", 0)

            val lyricsUrl = "https://api.deezer.com/track/$trackId/lyrics"
            val lyricsReq = Request.Builder().url(lyricsUrl).build()
            val lyricsResp = client.newCall(lyricsReq).execute()
            if (!lyricsResp.isSuccessful) return LyricsResult(null, null)
            val lyricsJson = JSONObject(lyricsResp.body?.string() ?: return LyricsResult(null, null))
            val text = lyricsJson.optString("lyrics", "").takeIf { it.isNotEmpty() }
            LyricsResult(plainLyrics = text, syncedLyrics = null, source = "deezer")
        } catch (_: Exception) { LyricsResult(null, null) }
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
                    plainLyrics = json.optString("plainLyrics", "").takeIf { it.isNotEmpty() },
                    syncedLyrics = json.optString("syncedLyrics", "").takeIf { it.isNotEmpty() },
                    source = "lrclib"
                )
            }
        } catch (_: Exception) { emptyList() }
    }

    private fun buildCacheKey(artist: String, title: String): String {
        return "${artist.lowercase().trim()}|${title.lowercase().trim()}"
    }

    private class LyricsCacheDb(context: Context) : SQLiteOpenHelper(
        context, "lyrics_cache.db", null, 1
    ) {
        override fun onCreate(db: SQLiteDatabase) {
            db.execSQL("CREATE TABLE IF NOT EXISTS lyrics (id TEXT PRIMARY KEY, plain TEXT, synced TEXT, source TEXT)")
        }

        override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {}

        fun read(key: String): LyricsResult? {
            val db = readableDatabase
            val cursor = db.rawQuery("SELECT plain, synced, source FROM lyrics WHERE id = ?", arrayOf(key))
            return cursor.use {
                if (it.moveToFirst()) {
                    LyricsResult(
                        plainLyrics = it.getString(0)?.takeIf { s -> s.isNotEmpty() },
                        syncedLyrics = it.getString(1)?.takeIf { s -> s.isNotEmpty() },
                        source = it.getString(2) ?: "cache"
                    )
                } else null
            }
        }

        fun write(key: String, result: LyricsResult) {
            val db = writableDatabase
            db.execSQL(
                "INSERT OR REPLACE INTO lyrics (id, plain, synced, source) VALUES (?, ?, ?, ?)",
                arrayOf(key, result.plainLyrics ?: "", result.syncedLyrics ?: "", result.source)
            )
        }
    }
}
