package com.sinc.enhanced.ui.screens.auth

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.clickable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.sinc.enhanced.SincApp
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

@Composable
fun LoginScreen(
    onLoginSuccess: () -> Unit,
    onNavigateRegister: () -> Unit,
    onSkip: () -> Unit
) {
    var showServerField by remember { mutableStateOf(false) }
    var serverUrl by remember { mutableStateOf("") }
    var username by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var loading by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    val apiClient = SincApp.instance.container.apiClient
    val authRepository = SincApp.instance.container.authRepository

    LaunchedEffect(Unit) {
        serverUrl = authRepository.serverUrl.first()
        if (serverUrl.isEmpty()) showServerField = true
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text(
            text = "Sinc Enhanced",
            style = MaterialTheme.typography.headlineLarge,
            color = MaterialTheme.colorScheme.primary
        )
        Spacer(Modifier.height(8.dp))
        Text(
            text = "Login to track stats & sync across devices",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Text(
            text = "Optional — you can skip and use the app offline",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )

        Spacer(Modifier.height(32.dp))

        if (!showServerField && serverUrl.isNotEmpty()) {
            Surface(
                modifier = Modifier.fillMaxWidth().clickable { showServerField = true },
                shape = RoundedCornerShape(12.dp),
                color = MaterialTheme.colorScheme.surfaceVariant
            ) {
                Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text("Server: $serverUrl", style = MaterialTheme.typography.bodySmall, modifier = Modifier.weight(1f))
                    Text("Change", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
                }
            }
            Spacer(Modifier.height(12.dp))
        }
        if (showServerField) {
            OutlinedTextField(
                value = serverUrl,
                onValueChange = { serverUrl = it },
                label = { Text("Backend Server URL") },
                placeholder = { Text("https://your-worker.workers.dev") },
                supportingText = { Text("Required for login") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri, imeAction = ImeAction.Next),
                shape = RoundedCornerShape(12.dp)
            )
            Spacer(Modifier.height(12.dp))
        }

        OutlinedTextField(
            value = username,
            onValueChange = { username = it },
            label = { Text("Username") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
            shape = RoundedCornerShape(12.dp)
        )

        Spacer(Modifier.height(12.dp))

        OutlinedTextField(
            value = password,
            onValueChange = { password = it },
            label = { Text("Password") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(
                keyboardType = KeyboardType.Password,
                imeAction = ImeAction.Done
            ),
            shape = RoundedCornerShape(12.dp)
        )

        if (error != null) {
            Spacer(Modifier.height(12.dp))
            Text(
                text = error ?: "",
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodySmall
            )
        }

        Spacer(Modifier.height(24.dp))

        Button(
            onClick = {
                if (username.isBlank() || password.isBlank()) {
                    error = "Enter username and password — or tap \"Skip\" for offline"
                    return@Button
                }
                if (serverUrl.isBlank()) {
                    error = "Enter the backend server URL"
                    return@Button
                }
                loading = true
                error = null
                scope.launch {
                    try {
                        apiClient.configure(serverUrl.trim(), "")
                        val result = apiClient.login(username.trim(), password)
                        if (result != null) {
                            val (token, json) = result
                            val role = json.optJSONObject("user")?.optString("role", "user") ?: "user"
                            val uid = json.optJSONObject("user")?.optLong("id", 0) ?: 0
                            authRepository.saveAuth(token, username.trim(), uid, role, serverUrl.trim())
                            onLoginSuccess()
                        } else {
                            error = "Login failed. Check credentials and server URL."
                        }
                    } catch (e: Exception) {
                        error = "Connection error: ${e.message}"
                    } finally {
                        loading = false
                    }
                }
            },
            modifier = Modifier.fillMaxWidth().height(50.dp),
            enabled = !loading,
            shape = RoundedCornerShape(12.dp)
        ) {
            if (loading) CircularProgressIndicator(modifier = Modifier.size(24.dp), color = MaterialTheme.colorScheme.onPrimary)
            else Text("Login")
        }

        Spacer(Modifier.height(12.dp))

        TextButton(onClick = onNavigateRegister) {
            Text("Create new account")
        }

        TextButton(onClick = onSkip) {
            Text("Skip — use offline")
        }
    }
}
