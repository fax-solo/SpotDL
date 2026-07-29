package com.sinc.enhanced.data.repository

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import com.sinc.enhanced.data.remote.ApiClient
import com.sinc.enhanced.domain.repository.AuthRepository as AuthRepositoryInterface
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch

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

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val _serverUrl = MutableStateFlow(defaultUrl)
    override val serverUrl: StateFlow<String> = _serverUrl.asStateFlow()

    override val authState: Flow<AuthState> = dataStore.data.map { prefs ->
        val token = prefs[KEY_TOKEN] ?: ""
        val savedAt = prefs[KEY_TOKEN_SAVED_AT] ?: 0L
        val expired = savedAt > 0 && (System.currentTimeMillis() - savedAt) > TOKEN_MAX_AGE_MS
        val url = prefs[KEY_SERVER_URL]?.takeIf { it.isNotBlank() } ?: defaultUrl
        AuthState(
            isLoggedIn = token.isNotEmpty() && !expired,
            isAdmin = prefs[KEY_ROLE] == "admin",
            username = prefs[KEY_USERNAME] ?: "",
            userId = prefs[KEY_USER_ID] ?: 0,
            serverUrl = url
        )
    }

    init {
        scope.launch {
            try {
                val prefs = dataStore.data.first()
                val saved = prefs[KEY_SERVER_URL]
                if (saved.isNullOrBlank() && defaultUrl.isNotBlank()) {
                    dataStore.edit { it[KEY_SERVER_URL] = defaultUrl }
                    _serverUrl.value = defaultUrl
                } else {
                    _serverUrl.value = saved?.takeIf { it.isNotBlank() } ?: defaultUrl
                }
                apiClient.configure(_serverUrl.value, prefs[KEY_TOKEN] ?: "")
            } catch (_: Exception) {
                _serverUrl.value = defaultUrl
                apiClient.configure(defaultUrl, "")
            }
        }
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
        _serverUrl.value = serverUrl
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
        apiClient.configure(trimmed, token)
        try {
            apiClient.ping()
        } catch (_: Exception) {
            apiClient.configure(_serverUrl.value, token)
            throw Exception("Server unreachable at $trimmed")
        }
        dataStore.edit { prefs ->
            prefs[KEY_SERVER_URL] = trimmed
        }
        _serverUrl.value = trimmed
    }

    override suspend fun restoreSession(): Boolean {
        val prefs = dataStore.data.first()
        val token = prefs[KEY_TOKEN] ?: return false
        apiClient.configure(_serverUrl.value, token)
        if (token.isEmpty()) return false

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
