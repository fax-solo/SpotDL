package com.sinc.enhanced.data.repository

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.core.booleanPreferencesKey
import com.sinc.enhanced.data.auth.TokenStore
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
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

data class AuthState(
    val isLoggedIn: Boolean = false,
    val isAdmin: Boolean = false,
    val username: String = "",
    val userId: Long = 0,
    val serverUrl: String = ""
)

class AuthRepository(
    private val tokenStore: TokenStore,
    private val dataStore: DataStore<Preferences>,
    private val apiClient: ApiClient,
    private val defaultUrl: String = ""
) : AuthRepositoryInterface {

    companion object {
        private val KEY_USERNAME = stringPreferencesKey("auth_username")
        private val KEY_USER_ID = longPreferencesKey("auth_user_id")
        private val KEY_SERVER_URL = stringPreferencesKey("server_url")
        private val HAS_AUTO_INIT = booleanPreferencesKey("has_auto_init_url")
        private const val TOKEN_MAX_AGE_MS = 30L * 24 * 60 * 60 * 1000
    }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val urlMutex = Mutex()
    private val _serverUrl = MutableStateFlow(defaultUrl)
    override val serverUrl: StateFlow<String> = _serverUrl.asStateFlow()

    private fun isTokenExpired(): Boolean {
        val savedAt = tokenStore.getTokenSavedAt()
        return savedAt > 0 && (System.currentTimeMillis() - savedAt) > TOKEN_MAX_AGE_MS
    }

    override val authState: Flow<AuthState> = dataStore.data.map { prefs ->
        val url = prefs[KEY_SERVER_URL]?.takeIf { it.isNotBlank() } ?: defaultUrl
        AuthState(
            isLoggedIn = tokenStore.getToken().isNotEmpty() && !isTokenExpired(),
            isAdmin = tokenStore.getRole() == "admin",
            username = prefs[KEY_USERNAME] ?: "",
            userId = prefs[KEY_USER_ID] ?: 0,
            serverUrl = url
        )
    }

    init {
        scope.launch {
            urlMutex.withLock {
                try {
                    val prefs = dataStore.data.first()
                    val saved = prefs[KEY_SERVER_URL]
                    if (saved.isNullOrBlank() && defaultUrl.isNotBlank()) {
                        dataStore.edit { it[KEY_SERVER_URL] = defaultUrl }
                    }
                    _serverUrl.value = saved?.takeIf { it.isNotBlank() } ?: defaultUrl
                    apiClient.configure(_serverUrl.value, tokenStore.getToken())
                } catch (_: Exception) {
                    _serverUrl.value = defaultUrl
                    apiClient.configure(defaultUrl, "")
                }
            }
        }
    }

    override suspend fun saveAuth(token: String, username: String, userId: Long, role: String, serverUrl: String) {
        tokenStore.saveAuth(token, role)
        urlMutex.withLock {
            dataStore.edit { prefs ->
                prefs[KEY_USERNAME] = username
                prefs[KEY_USER_ID] = userId
                prefs[KEY_SERVER_URL] = serverUrl
            }
            _serverUrl.value = serverUrl
        }
        apiClient.configure(serverUrl, token)
    }

    override suspend fun clearAuth() {
        tokenStore.clear()
        dataStore.edit { prefs ->
            prefs.remove(KEY_USERNAME)
            prefs.remove(KEY_USER_ID)
            prefs.remove(HAS_AUTO_INIT)
        }
    }

    override suspend fun setServerUrl(url: String) {
        val trimmed = url.trim()
        if (trimmed.isBlank()) return
        val token = tokenStore.getToken()
        apiClient.configure(trimmed, token)
        try {
            apiClient.ping()
        } catch (_: Exception) {
            apiClient.configure(_serverUrl.value, token)
            throw Exception("Server unreachable at $trimmed")
        }
        urlMutex.withLock {
            dataStore.edit { prefs ->
                prefs[KEY_SERVER_URL] = trimmed
            }
            _serverUrl.value = trimmed
        }
    }

    override suspend fun restoreSession(): Boolean {
        val token = tokenStore.getToken()
        apiClient.configure(_serverUrl.value, token)
        if (token.isEmpty()) return false

        return try {
            val me = apiClient.getMe()
            if (me != null) {
                val role = me.optString("role", "user")
                tokenStore.saveAuth(token, role)
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
