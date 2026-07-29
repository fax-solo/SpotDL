package com.sinc.enhanced.data.repository

import android.content.Context
import android.content.SharedPreferences
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
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
    private val context: Context,
    private val dataStore: DataStore<Preferences>,
    private val apiClient: ApiClient,
    private val defaultUrl: String = ""
) : AuthRepositoryInterface {

    companion object {
        private const val ENCRYPTED_PREFS_NAME = "sinc_auth_secure"
        private val KEY_USERNAME = stringPreferencesKey("auth_username")
        private val KEY_USER_ID = longPreferencesKey("auth_user_id")
        private val KEY_SERVER_URL = stringPreferencesKey("server_url")
        private val HAS_AUTO_INIT = booleanPreferencesKey("has_auto_init_url")
        private const val TOKEN_MAX_AGE_MS = 30L * 24 * 60 * 60 * 1000
    }

    private val masterKey = MasterKey.Builder(context)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()

    private val securePrefs: SharedPreferences = EncryptedSharedPreferences.create(
        context,
        ENCRYPTED_PREFS_NAME,
        masterKey,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val _serverUrl = MutableStateFlow(defaultUrl)
    override val serverUrl: StateFlow<String> = _serverUrl.asStateFlow()

    private fun getToken(): String = securePrefs.getString("auth_token", "") ?: ""
    private fun getRole(): String = securePrefs.getString("auth_role", "") ?: ""
    private fun getTokenSavedAt(): Long = securePrefs.getLong("auth_token_saved_at", 0L)

    private fun isTokenExpired(): Boolean {
        val savedAt = getTokenSavedAt()
        return savedAt > 0 && (System.currentTimeMillis() - savedAt) > TOKEN_MAX_AGE_MS
    }

    override val authState: Flow<AuthState> = dataStore.data.map { prefs ->
        val url = prefs[KEY_SERVER_URL]?.takeIf { it.isNotBlank() } ?: defaultUrl
        AuthState(
            isLoggedIn = getToken().isNotEmpty() && !isTokenExpired(),
            isAdmin = getRole() == "admin",
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
                apiClient.configure(_serverUrl.value, getToken())
            } catch (_: Exception) {
                _serverUrl.value = defaultUrl
                apiClient.configure(defaultUrl, "")
            }
        }
    }

    override suspend fun saveAuth(token: String, username: String, userId: Long, role: String, serverUrl: String) {
        securePrefs.edit()
            .putString("auth_token", token)
            .putString("auth_role", role)
            .putLong("auth_token_saved_at", System.currentTimeMillis())
            .apply()
        dataStore.edit { prefs ->
            prefs[KEY_USERNAME] = username
            prefs[KEY_USER_ID] = userId
            prefs[KEY_SERVER_URL] = serverUrl
        }
        _serverUrl.value = serverUrl
        apiClient.configure(serverUrl, token)
    }

    override suspend fun clearAuth() {
        securePrefs.edit()
            .remove("auth_token")
            .remove("auth_role")
            .remove("auth_token_saved_at")
            .apply()
        dataStore.edit { prefs ->
            prefs.remove(KEY_USERNAME)
            prefs.remove(KEY_USER_ID)
            prefs.remove(HAS_AUTO_INIT)
        }
    }

    override suspend fun setServerUrl(url: String) {
        val trimmed = url.trim()
        if (trimmed.isBlank()) return
        val token = getToken()
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
        val token = getToken()
        apiClient.configure(_serverUrl.value, token)
        if (token.isEmpty()) return false

        return try {
            val me = apiClient.getMe()
            if (me != null) {
                val role = me.optString("role", "user")
                securePrefs.edit().putString("auth_role", role).apply()
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
