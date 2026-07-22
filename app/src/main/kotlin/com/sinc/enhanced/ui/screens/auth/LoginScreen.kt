package com.sinc.enhanced.ui.screens.auth

import androidx.compose.foundation.layout.*
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

        OutlinedTextField(
            value = serverUrl,
            onValueChange = { serverUrl = it },
            label = { Text("Backend Server URL") },
            placeholder = { Text("https://your-worker.workers.dev") },
            supportingText = { Text("Optional — needed only for account sync") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            keyboardOptions = KeyboardOptions(
                keyboardType = KeyboardType.Uri,
                imeAction = ImeAction.Next
            ),
            shape = RoundedCornerShape(12.dp)
        )

        Spacer(Modifier.height(12.dp))

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
                text = error!!,
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodySmall
            )
        }

        Spacer(Modifier.height(24.dp))

        Button(
            onClick = {
                if (serverUrl.isBlank() || username.isBlank() || password.isBlank()) {
                    error = "Enter server URL, username, and password — or tap \"Skip\" for offline"
                    return@Button
                }
                loading = true
                error = null
                scope.launch {
                    try {
                        apiClient.configure(serverUrl, "")
                        val result = apiClient.login(username, password)
                        if (result != null) {
                            val (token, json) = result
                            val role = json.optJSONObject("user")?.optString("role", "user") ?: "user"
                            val uid = json.optJSONObject("user")?.optLong("id", 0) ?: 0
                            authRepository.saveAuth(token, username, uid, role, serverUrl)
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
