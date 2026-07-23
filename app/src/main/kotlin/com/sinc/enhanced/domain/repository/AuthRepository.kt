package com.sinc.enhanced.domain.repository

import com.sinc.enhanced.data.repository.AuthState
import kotlinx.coroutines.flow.Flow

interface AuthRepository {
    val authState: Flow<AuthState>
    val serverUrl: Flow<String>
    suspend fun saveAuth(token: String, username: String, userId: Long, role: String, serverUrl: String)
    suspend fun clearAuth()
    suspend fun setServerUrl(url: String)
    suspend fun restoreSession(): Boolean
}
