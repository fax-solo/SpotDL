package com.sinc.enhanced.data.remote

import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class ApiClient(private val okHttpClient: OkHttpClient) {

    private val jsonMediaType = "application/json".toMediaType()

    var baseUrl: String = ""
        private set
    var token: String = ""
        private set

    fun configure(url: String, jwt: String) {
        baseUrl = url.trimEnd('/')
        token = jwt
    }

    private suspend fun post(path: String, body: JSONObject): JSONObject? = withContext(Dispatchers.IO) {
        if (baseUrl.isEmpty()) return@withContext null
        try {
            val request = Request.Builder()
                .url("$baseUrl$path")
                .header("Content-Type", "application/json")
                .header("Authorization", "Bearer $token")
                .post(body.toString().toRequestBody(jsonMediaType))
                .build()
            okHttpClient.newCall(request).execute().use { response ->
                if (response.isSuccessful) {
                    JSONObject(response.body?.string() ?: return@withContext null)
                } else {
                    throw ApiException(response.code)
                }
            }
        } catch (e: ApiException) { throw e }
        catch (e: Exception) { Log.e("ApiClient", "post failed", e); null }
    }

    class ApiException(val code: Int) : Exception(when (code) {
        401 -> "Invalid credentials"
        409 -> "Username already taken"
        in 400..499 -> "Request failed ($code)"
        in 500..599 -> "Server error ($code)"
        else -> "Unexpected error ($code)"
    })

    private suspend fun get(path: String): JSONObject? = withContext(Dispatchers.IO) {
        if (baseUrl.isEmpty()) return@withContext null
        try {
            val request = Request.Builder()
                .url("$baseUrl$path")
                .header("Authorization", "Bearer $token")
                .build()
            okHttpClient.newCall(request).execute().use { response ->
                if (response.isSuccessful) {
                    JSONObject(response.body?.string() ?: return@withContext null)
                } else {
                    throw ApiException(response.code)
                }
            }
        } catch (e: ApiException) { throw e }
        catch (e: Exception) { Log.e("ApiClient", "get failed", e); null }
    }

    private suspend fun getArray(path: String): String? = withContext(Dispatchers.IO) {
        if (baseUrl.isEmpty()) return@withContext null
        try {
            val request = Request.Builder()
                .url("$baseUrl$path")
                .header("Authorization", "Bearer $token")
                .build()
            okHttpClient.newCall(request).execute().use { response ->
                if (response.isSuccessful) response.body?.string() else null
            }
        } catch (e: Exception) { Log.e("ApiClient", "getArray failed", e); null }
    }

    suspend fun register(username: String, password: String): Pair<String, JSONObject>? {
        val body = JSONObject().apply {
            put("username", username)
            put("password", password)
        }
        val json = post("/api/auth/register", body) ?: return null
        return Pair(json.optString("token", ""), json)
    }

    suspend fun login(username: String, password: String): Pair<String, JSONObject>? {
        val body = JSONObject().apply {
            put("username", username)
            put("password", password)
        }
        val json = post("/api/auth/login", body) ?: return null
        return Pair(json.optString("token", ""), json)
    }

    suspend fun getMe(): JSONObject? {
        return get("/api/auth/me")
    }

    suspend fun ping(): Boolean {
        return try {
            post("/api/stats/ping", JSONObject()) != null
        } catch (_: ApiException) { false }
    }

    suspend fun trackDownload(title: String, artist: String, source: String): Boolean {
        return try {
            val body = JSONObject().apply {
                put("title", title)
                put("artist", artist)
                put("source", source)
            }
            post("/api/stats/download", body) != null
        } catch (_: ApiException) { false }
    }

    suspend fun getAdminStats(): JSONObject? {
        return get("/api/admin/stats")
    }

    suspend fun getAdminUsers(): List<JSONObject>? {
        val json = getArray("/api/admin/users") ?: return null
        return try {
            val arr = JSONObject("{\"items\":$json}").optJSONArray("items")
            if (arr == null) null else (0 until arr.length()).map { arr.getJSONObject(it) }
        } catch (e: Exception) { Log.e("ApiClient", "getAdminUsers failed", e); null }
    }
}
