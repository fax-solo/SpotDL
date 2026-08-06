package com.sinc.enhanced.data.repository

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.emptyPreferences
import com.sinc.enhanced.data.auth.TokenStore
import com.sinc.enhanced.data.remote.ApiClient
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import org.json.JSONObject
import org.junit.Test
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

class FakeTokenStore : TokenStore {
    private var token: String = ""
    private var role: String = ""
    private var savedAt: Long = 0L

    override fun getToken(): String = token
    override fun getRole(): String = role
    override fun getTokenSavedAt(): Long = savedAt

    override fun saveAuth(token: String, role: String) {
        this.token = token
        this.role = role
        this.savedAt = System.currentTimeMillis()
    }

    override fun clear() {
        token = ""
        role = ""
        savedAt = 0L
    }
}

class FakeApiClient(
    private val meResult: JSONObject? = null,
    private val meError: Throwable? = null
) : ApiClient(okhttp3.OkHttpClient()) {
    override suspend fun getMe(): JSONObject? {
        meError?.let { throw it }
        return meResult
    }

    override suspend fun ping(): Boolean = true
}

class AuthRepositoryTest {

    private fun createRepo(
        dataStore: DataStore<Preferences> = FakeDataStore(),
        apiClient: ApiClient = FakeApiClient(),
        tokenStore: TokenStore = FakeTokenStore()
    ) = AuthRepository(tokenStore, dataStore, apiClient, "https://example.com")

    @Test
    fun `restoreSession with valid token and API success returns true`() = runTest {
        val repo = createRepo(apiClient = FakeApiClient(meResult = JSONObject().apply { put("role", "user") }))

        repo.saveAuth("valid-token", "testuser", 1L, "user", "https://example.com")

        val result = repo.restoreSession()
        assertTrue("restoreSession should return true when API succeeds", result)
    }

    @Test
    fun `restoreSession with no token returns false`() = runTest {
        val repo = createRepo()

        val result = repo.restoreSession()
        assertFalse("restoreSession should return false with no token", result)
    }

    @Test
    fun `restoreSession with token but API returns null keeps session`() = runTest {
        val dataStore = FakeDataStore()
        val repo = createRepo(dataStore, FakeApiClient(meResult = null))

        repo.saveAuth("invalid-token", "testuser", 1L, "user", "https://example.com")

        val result = repo.restoreSession()
        assertTrue("restoreSession should tolerate a null API response", result)

        val state = repo.authState.first()
        assertTrue("Auth should be preserved when API response is null", state.isLoggedIn)
    }

    @Test
    fun `saveAuth and clearAuth cycle works correctly`() = runTest {
        val dataStore = FakeDataStore()
        val repo = createRepo(dataStore)

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
        val repo = createRepo(dataStore)

        var url = repo.serverUrl.first()
        assertEquals("Default URL should be returned", "https://example.com", url)

        repo.saveAuth("t", "u", 1L, "user", "https://custom.example.com")
        url = repo.serverUrl.first()
        assertEquals("Custom URL after saveAuth", "https://custom.example.com", url)
    }

    @Test
    fun `restoreSession with token and API exception clears auth and returns false`() = runTest {
        val dataStore = FakeDataStore()
        val repo = createRepo(dataStore, FakeApiClient(meError = ApiClient.ApiException(401)))

        repo.saveAuth("valid-token", "testuser", 1L, "user", "https://example.com")

        val result = repo.restoreSession()
        assertFalse("restoreSession should return false when API rejects the token", result)

        val state = repo.authState.first()
        assertFalse("Auth should be cleared when API rejects the token", state.isLoggedIn)
    }

    @Test
    fun `restoreSession tolerates network errors without clearing auth`() = runTest {
        val dataStore = FakeDataStore()
        val repo = createRepo(dataStore, FakeApiClient(meError = RuntimeException("Network error")))

        repo.saveAuth("valid-token", "testuser", 1L, "user", "https://example.com")

        val result = repo.restoreSession()
        assertTrue("restoreSession should be offline-tolerant", result)

        val state = repo.authState.first()
        assertTrue("Auth should survive network errors", state.isLoggedIn)
    }
}
