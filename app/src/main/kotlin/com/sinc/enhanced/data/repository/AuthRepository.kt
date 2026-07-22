package com.sinc.enhanced.data.repository

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import com.sinc.enhanced.data.remote.ApiClient
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
    private val apiClient: ApiClient
) {

    companion object {
        private val KEY_TOKEN = stringPreferencesKey("auth_token")
        private val KEY_USERNAME = stringPreferencesKey("auth_username")
        private val KEY_USER_ID = longPreferencesKey("auth_user_id")
        private val KEY_ROLE = stringPreferencesKey("auth_role")
        private val KEY_SERVER_URL = stringPreferencesKey("server_url")
    }

    val authState: Flow<AuthState> = dataStore.data.map { prefs ->
        val token = prefs[KEY_TOKEN] ?: ""
        AuthState(
            isLoggedIn = token.isNotEmpty(),
            isAdmin = prefs[KEY_ROLE] == "admin",
            username = prefs[KEY_USERNAME] ?: "",
            userId = prefs[KEY_USER_ID] ?: 0,
            serverUrl = prefs[KEY_SERVER_URL] ?: ""
        )
    }

    val serverUrl: Flow<String> = dataStore.data.map {
        it[KEY_SERVER_URL] ?: ""
    }

    suspend fun saveAuth(token: String, username: String, userId: Long, role: String, serverUrl: String) {
        dataStore.edit { prefs ->
            prefs[KEY_TOKEN] = token
            prefs[KEY_USERNAME] = username
            prefs[KEY_USER_ID] = userId
            prefs[KEY_ROLE] = role
            prefs[KEY_SERVER_URL] = serverUrl
        }
        apiClient.configure(serverUrl, token)
    }

    suspend fun clearAuth() {
        dataStore.edit { prefs ->
            prefs.remove(KEY_TOKEN)
            prefs.remove(KEY_USERNAME)
            prefs.remove(KEY_USER_ID)
            prefs.remove(KEY_ROLE)
        }
    }

    suspend fun setServerUrl(url: String) {
        dataStore.edit { prefs ->
            prefs[KEY_SERVER_URL] = url
        }
    }

    suspend fun restoreSession(): Boolean {
        val prefs = dataStore.data.first()
        val token = prefs[KEY_TOKEN] ?: return false
        val url = prefs[KEY_SERVER_URL] ?: return false
        if (token.isEmpty() || url.isEmpty()) return false

        apiClient.configure(url, token)

        val me = apiClient.getMe()
        if (me != null) {
            val role = me.optString("role", "user")
            dataStore.edit { it[KEY_ROLE] = role }
            return true
        }
        clearAuth()
        return false
    }
}
