package com.sinc.enhanced.data.remote.spotify

import android.util.Log
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.net.URLEncoder

/**
 * Minimal GraphQL client for Spotify's internal Pathfinder endpoint.
 * The anonymous token is ensured on each query; callers receive null when
 * token acquisition or the request fails.
 */
class PathfinderClient(
    private val client: OkHttpClient,
    private val tokenProvider: AnonymousTokenProvider
) {
    companion object {
        private const val PATHFINDER_URL = "https://api-partner.spotify.com/pathfinder/v1/query"
        private const val PLAYLIST_HASH = "a65e12194ed5fc443a1cdebed5fabe33ca5b07b987185d63c72483867ad13cb4"
        private const val TRACK_HASH = "612585ae06ba435ad26369870deaae23b5c8800a256cd8a57e08eddc25a37294"
        private const val SEARCH_HASH = "eff59fa0a3d026b88b56fddbcf4bdfa16a186b8175a5c1a358c072e053c2e5b0"
    }

    suspend fun querySearch(variables: JSONObject): JSONObject? =
        query("searchDesktop", SEARCH_HASH, variables)

    suspend fun queryPlaylist(variables: JSONObject): JSONObject? =
        query("fetchPlaylist", PLAYLIST_HASH, variables)

    suspend fun queryTrack(variables: JSONObject): JSONObject? =
        query("getTrack", TRACK_HASH, variables)

    private suspend fun query(operationName: String, sha256Hash: String, variables: JSONObject): JSONObject? =
        withContext(Dispatchers.IO) {
            val token = try {
                tokenProvider.getToken()
            } catch (ce: CancellationException) { throw ce }
            catch (e: Exception) {
                Log.e("PathfinderClient", "token acquisition failed", e)
                return@withContext null
            }
            try {
                val vars = variables.toString()
                val exts = JSONObject().apply {
                    put("persistedQuery", JSONObject().apply {
                        put("version", 1)
                        put("sha256Hash", sha256Hash)
                    })
                }
                val url = "$PATHFINDER_URL?operationName=${URLEncoder.encode(operationName, "UTF-8")}" +
                    "&variables=${URLEncoder.encode(vars, "UTF-8")}" +
                    "&extensions=${URLEncoder.encode(exts.toString(), "UTF-8")}"
                val request = Request.Builder()
                    .url(url)
                    .header("Authorization", "Bearer $token")
                    .header("app-platform", "WebPlayer")
                    .header("User-Agent", "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36")
                    .build()
                client.newCall(request).execute().use { response ->
                    if (!response.isSuccessful) return@use null
                    JSONObject(response.body?.string() ?: return@use null)
                }
            } catch (ce: CancellationException) { throw ce }
            catch (e: Exception) {
                Log.e("PathfinderClient", "pathfinder query failed", e)
                null
            }
        }
}
