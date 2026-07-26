package com.sinc.enhanced.data.repository

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.emptyPreferences
import com.sinc.enhanced.data.remote.ApiClient
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.runTest
import okhttp3.OkHttpClient
import org.json.JSONObject
import org.junit.Test
import org.mockito.Mockito
import org.mockito.kotlin.mock
import org.mockito.kotlin.whenever
import org.junit.Assert.*

class FakeDataStore : DataStore<Preferences> {
    private val _data = MutableStateFlow(emptyPreferences())
    override val data: Flow<Preferences> = _data.asStateFlow()

    override suspend fun updateData(transform: suspend (Preferences) -> Preferences): Preferences {
        val newValue = transform(_data.value)
        _data.value = newValue
        return newValue
    }
}

class AuthRepositoryTest {

    @Test
    fun `restoreSession with valid token and API success returns true`() = runTest {
        val dataStore = FakeDataStore()
        val apiClient = mock<ApiClient>()
        val repo = AuthRepository(dataStore, apiClient, "https://example.com")

        val meJson = JSONObject().apply { put("role", "user") }
        whenever(apiClient.getMe()).thenReturn(meJson)

        repo.saveAuth("valid-token", "testuser", 1L, "user", "https://example.com")

        val result = repo.restoreSession()
        assertTrue("restoreSession should return true when API succeeds", result)
    }

    @Test
    fun `restoreSession with no token returns false`() = runTest {
        val dataStore = FakeDataStore()
        val apiClient = mock<ApiClient>()
        val repo = AuthRepository(dataStore, apiClient, "https://example.com")

        val result = repo.restoreSession()
        assertFalse("restoreSession should return false with no token", result)
    }

    @Test
    fun `restoreSession with token but API returns null returns false`() = runTest {
        val dataStore = FakeDataStore()
        val apiClient = mock<ApiClient>()
        val repo = AuthRepository(dataStore, apiClient, "https://example.com")

        whenever(apiClient.getMe()).thenReturn(null)

        repo.saveAuth("invalid-token", "testuser", 1L, "user", "https://example.com")

        val result = repo.restoreSession()
        assertFalse("restoreSession should return false when API returns null", result)

        val state = repo.authState.first()
        assertFalse("Auth should be cleared when API returns null", state.isLoggedIn)
    }

    @Test
    fun `saveAuth and clearAuth cycle works correctly`() = runTest {
        val dataStore = FakeDataStore()
        val apiClient = mock<ApiClient>()
        val repo = AuthRepository(dataStore, apiClient, "https://example.com")

        repo.saveAuth("token123", "user1", 42L, "admin", "https://server.example.com")

        var state = repo.authState.first()
        assertTrue(state.isLoggedIn)
        assertEquals("user1", state.username)
        assertEquals(42L, state.userId)
        assertTrue(state.isAdmin)

        repo.clearAuth()

        state = repo.authState.first()
        assertFalse(state.isLoggedIn)
        assertEquals("", state.username)
    }

    @Test
    fun `serverUrl flow returns correct URL`() = runTest {
        val dataStore = FakeDataStore()
        val apiClient = mock<ApiClient>()
        val repo = AuthRepository(dataStore, apiClient, "https://default.example.com")

        var url = repo.serverUrl.first()
        assertEquals("Default URL should be returned", "https://default.example.com", url)

        repo.saveAuth("t", "u", 1L, "user", "https://custom.example.com")
        url = repo.serverUrl.first()
        assertEquals("Custom URL after saveAuth", "https://custom.example.com", url)
    }

    @Test
    fun `restoreSession with token but API throws exception returns false`() = runTest {
        val dataStore = FakeDataStore()
        val apiClient = mock<ApiClient>()
        val repo = AuthRepository(dataStore, apiClient, "https://example.com")

        whenever(apiClient.getMe()).thenThrow(RuntimeException("Network error"))

        repo.saveAuth("valid-token", "testuser", 1L, "user", "https://example.com")

        val result = repo.restoreSession()
        assertFalse("restoreSession should return false when API throws", result)

        val state = repo.authState.first()
        assertFalse("Auth should be cleared on exception", state.isLoggedIn)
    }
}
