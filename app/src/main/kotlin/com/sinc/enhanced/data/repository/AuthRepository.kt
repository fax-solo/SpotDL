package com.sinc.enhanced.data.repository

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import com.sinc.enhanced.data.remote.ApiClient
import com.sinc.enhanced.domain.repository.AuthRepository as AuthRepositoryInterface
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

data class AuthState(
    val isLoggedIn: Boolean = false,
    val isAdmin: Boolean = false,
    val username: String = "",
    val userId: Long = 0,
    val serverUrl: String = ""
)

class AuthRepository(
    private val dataStore: DataStore<Preferences>,
    private val apiClient: ApiClient,
    private val defaultUrl: String = ""
) : AuthRepositoryInterface {

    companion object {
        private val KEY_TOKEN = stringPreferencesKey("auth_token")
        private val KEY_USERNAME = stringPreferencesKey("auth_username")
        private val KEY_USER_ID = longPreferencesKey("auth_user_id")
        private val KEY_ROLE = stringPreferencesKey("auth_role")
        private val KEY_SERVER_URL = stringPreferencesKey("server_url")
        private val KEY_TOKEN_SAVED_AT = longPreferencesKey("auth_token_saved_at")
        private val HAS_AUTO_INIT = booleanPreferencesKey("has_auto_init_url")
        private const val TOKEN_MAX_AGE_MS = 30L * 24 * 60 * 60 * 1000
    }

    override val authState: Flow<AuthState> = dataStore.data.map { prefs ->
        val token = prefs[KEY_TOKEN] ?: ""
        val savedAt = prefs[KEY_TOKEN_SAVED_AT] ?: 0L
        val expired = savedAt > 0 && (System.currentTimeMillis() - savedAt) > TOKEN_MAX_AGE_MS
        val url = effectiveUrl(prefs[KEY_SERVER_URL] ?: "")
        AuthState(
            isLoggedIn = token.isNotEmpty() && !expired,
            isAdmin = prefs[KEY_ROLE] == "admin",
            username = prefs[KEY_USERNAME] ?: "",
            userId = prefs[KEY_USER_ID] ?: 0,
            serverUrl = url
        )
    }

    override val serverUrl: Flow<String> = dataStore.data.map { prefs ->
        val saved = prefs[KEY_SERVER_URL]
        if (saved.isNullOrBlank() && defaultUrl.isNotBlank()) {
            effectiveUrl("")
        } else {
            effectiveUrl(saved ?: "")
        }
    }

    private fun effectiveUrl(savedUrl: String): String {
        return if (savedUrl.isNotBlank()) savedUrl
        else defaultUrl
    }

    override suspend fun saveAuth(token: String, username: String, userId: Long, role: String, serverUrl: String) {
        dataStore.edit { prefs ->
            prefs[KEY_TOKEN] = token
            prefs[KEY_USERNAME] = username
            prefs[KEY_USER_ID] = userId
            prefs[KEY_ROLE] = role
            prefs[KEY_SERVER_URL] = serverUrl
            prefs[KEY_TOKEN_SAVED_AT] = System.currentTimeMillis()
        }
        apiClient.configure(serverUrl, token)
    }

    override suspend fun clearAuth() {
        dataStore.edit { prefs ->
            prefs.remove(KEY_TOKEN)
            prefs.remove(KEY_USERNAME)
            prefs.remove(KEY_USER_ID)
            prefs.remove(KEY_ROLE)
            prefs.remove(HAS_AUTO_INIT)
        }
    }

    override suspend fun setServerUrl(url: String) {
        val trimmed = url.trim()
        if (trimmed.isBlank()) return
        val token = dataStore.data.first()[KEY_TOKEN] ?: ""
        val savedUrl = apiClient.baseUrl
        val savedToken = apiClient.token
        apiClient.configure(trimmed, token)
        try {
            apiClient.ping()
        } catch (_: Exception) {
            apiClient.configure(savedUrl, savedToken)
            throw Exception("Server unreachable at $trimmed")
        }
        dataStore.edit { prefs ->
            prefs[KEY_SERVER_URL] = trimmed
        }
    }

    override suspend fun restoreSession(): Boolean {
        val prefs = dataStore.data.first()
        val savedUrl = prefs[KEY_SERVER_URL] ?: ""

        if (savedUrl.isBlank() && defaultUrl.isNotBlank()) {
            dataStore.edit { it[KEY_SERVER_URL] = defaultUrl }
        }

        val token = prefs[KEY_TOKEN] ?: return false
        val url = effectiveUrl(prefs[KEY_SERVER_URL] ?: "")
        apiClient.configure(url, token)
        if (token.isEmpty() || url.isEmpty()) return false

        return try {
            val me = apiClient.getMe()
            if (me != null) {
                val role = me.optString("role", "user")
                dataStore.edit { it[KEY_ROLE] = role }
                true
            } else {
                true
            }
        } catch (e: com.sinc.enhanced.data.remote.ApiClient.ApiException) {
            clearAuth()
            false
        } catch (_: Exception) {
            true
        }
    }
}
