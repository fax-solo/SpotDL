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
        private val HAS_AUTO_INIT = booleanPreferencesKey("has_auto_init_url")
    }

    override val authState: Flow<AuthState> = dataStore.data.map { prefs ->
        val token = prefs[KEY_TOKEN] ?: ""
        val url = effectiveUrl(prefs[KEY_SERVER_URL] ?: "")
        AuthState(
            isLoggedIn = token.isNotEmpty(),
            isAdmin = prefs[KEY_ROLE] == "admin",
            username = prefs[KEY_USERNAME] ?: "",
            userId = prefs[KEY_USER_ID] ?: 0,
            serverUrl = url
        )
    }

    override val serverUrl: Flow<String> = dataStore.data.map {
        effectiveUrl(it[KEY_SERVER_URL] ?: "")
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
        dataStore.edit { prefs ->
            prefs[KEY_SERVER_URL] = url
        }
        val token = dataStore.data.first()[KEY_TOKEN] ?: ""
        apiClient.configure(url, token)
    }

    override suspend fun restoreSession(): Boolean {
        val prefs = dataStore.data.first()
        val token = prefs[KEY_TOKEN] ?: return false
        val savedUrl = prefs[KEY_SERVER_URL] ?: ""

        if (savedUrl.isBlank() && defaultUrl.isNotBlank()) {
            dataStore.edit { it[KEY_SERVER_URL] = defaultUrl }
        }

        val url = effectiveUrl(savedUrl)
        apiClient.configure(url, token)
        if (token.isEmpty() || url.isEmpty()) return false

        try {
            val me = apiClient.getMe()
            if (me != null) {
                val role = me.optString("role", "user")
                dataStore.edit { it[KEY_ROLE] = role }
                return true
            }
            clearAuth()
            return false
        } catch (e: Exception) {
            clearAuth()
            return false
        }
    }
}
