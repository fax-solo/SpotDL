package com.sinc.enhanced.data.remote

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
            val response = okHttpClient.newCall(request).execute()
            if (response.isSuccessful) JSONObject(response.body?.string() ?: return@withContext null) else null
        } catch (_: Exception) { null }
    }

    private suspend fun get(path: String): JSONObject? = withContext(Dispatchers.IO) {
        if (baseUrl.isEmpty()) return@withContext null
        try {
            val request = Request.Builder()
                .url("$baseUrl$path")
                .header("Authorization", "Bearer $token")
                .build()
            val response = okHttpClient.newCall(request).execute()
            if (response.isSuccessful) JSONObject(response.body?.string() ?: return@withContext null) else null
        } catch (_: Exception) { null }
    }

    private suspend fun getArray(path: String): String? = withContext(Dispatchers.IO) {
        if (baseUrl.isEmpty()) return@withContext null
        try {
            val request = Request.Builder()
                .url("$baseUrl$path")
                .header("Authorization", "Bearer $token")
                .build()
            val response = okHttpClient.newCall(request).execute()
            response.body?.string()
        } catch (_: Exception) { null }
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
        val result = post("/api/stats/ping", JSONObject())
        return result != null
    }

    suspend fun trackDownload(title: String, artist: String, source: String): Boolean {
        val body = JSONObject().apply {
            put("title", title)
            put("artist", artist)
            put("source", source)
        }
        val result = post("/api/stats/download", body)
        return result != null
    }

    suspend fun getAdminStats(): JSONObject? {
        return get("/api/admin/stats")
    }

    suspend fun getAdminUsers(): List<JSONObject>? {
        val json = getArray("/api/admin/users") ?: return null
        return try {
            val arr = JSONObject("{\"items\":$json}").optJSONArray("items")
            if (arr == null) null else (0 until arr.length()).map { arr.getJSONObject(it) }
        } catch (_: Exception) { null }
    }
}
