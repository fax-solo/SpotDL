package com.sinc.enhanced.ui.screens.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.sinc.enhanced.SincApp
import com.sinc.enhanced.data.remote.ApiClient
import com.sinc.enhanced.data.repository.AuthRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

data class LoginUiState(
    val isConnecting: Boolean = false,
    val isAuthenticating: Boolean = false,
    val isLoading: Boolean = false,
    val error: String? = null,
    val isSuccess: Boolean = false,
    val needsServerUrl: Boolean = false
)

class LoginViewModel(
    private val apiClient: ApiClient,
    private val authRepository: AuthRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(LoginUiState())
    val uiState: StateFlow<LoginUiState> = _uiState.asStateFlow()

    fun login(username: String, password: String) {
        if (username.isBlank() || password.isBlank()) {
            _uiState.value = _uiState.value.copy(error = "Enter username and password")
            return
        }
        _uiState.value = _uiState.value.copy(isConnecting = true, isLoading = true, error = null)
        viewModelScope.launch {
            try {
                val serverUrl = authRepository.serverUrl.first()
                if (serverUrl.isBlank()) {
                    _uiState.value = _uiState.value.copy(isLoading = false, isConnecting = false, error = null, needsServerUrl = true)
                    return@launch
                }
                apiClient.configure(serverUrl.trim(), apiClient.token)
                _uiState.value = _uiState.value.copy(isConnecting = false, isAuthenticating = true)
                val result = apiClient.login(username.trim(), password)
                if (result != null) {
                    val (token, json) = result
                    val role = json.optJSONObject("user")?.optString("role", "user") ?: "user"
                    val uid = json.optJSONObject("user")?.optLong("id", 0) ?: 0
                    authRepository.saveAuth(token, username.trim(), uid, role, serverUrl.trim())
                    _uiState.value = _uiState.value.copy(isLoading = false, isAuthenticating = false, isSuccess = true)
                } else {
                    _uiState.value = _uiState.value.copy(isLoading = false, isAuthenticating = false, error = "Login failed. Check credentials.")
                }
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(isLoading = false, isConnecting = false, isAuthenticating = false, error = "Connection error: ${e.message}")
            }
        }
    }

    fun setServerUrl(url: String) {
        viewModelScope.launch {
            try {
                authRepository.setServerUrl(url)
            } catch (_: Exception) {}
        }
    }

    fun clearError() {
        _uiState.value = _uiState.value.copy(error = null)
    }

    class Factory : ViewModelProvider.Factory {
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            @Suppress("UNCHECKED_CAST")
            val c = SincApp.instance.container
            return LoginViewModel(c.apiClient, c.authRepository) as T
        }
    }
}
