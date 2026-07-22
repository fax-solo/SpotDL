package com.sinc.enhanced.ui.screens.settings

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.sinc.enhanced.SincApp
import kotlinx.coroutines.launch

@Composable
fun SettingsScreen(
    onLogout: () -> Unit = {},
    onNavigateAdmin: () -> Unit = {},
    viewModel: SettingsViewModel = viewModel(factory = SettingsViewModel.Factory(LocalContext.current))
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val authRepository = SincApp.instance.container.authRepository
    val authState by authRepository.authState.collectAsStateWithLifecycle(initialValue = com.sinc.enhanced.data.repository.AuthState())

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp)
            .verticalScroll(rememberScrollState())
    ) {
        Text(
            text = "Settings",
            style = MaterialTheme.typography.headlineLarge,
            color = MaterialTheme.colorScheme.onBackground
        )

        Spacer(Modifier.height(24.dp))

        Text(
            text = "Account & Server",
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.onSurface
        )
        Spacer(Modifier.height(8.dp))

        Surface(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(12.dp),
            color = MaterialTheme.colorScheme.surfaceVariant
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.Person, null, tint = MaterialTheme.colorScheme.primary)
                    Spacer(Modifier.width(8.dp))
                    if (authState.isLoggedIn) {
                        Column {
                            Text(authState.username, style = MaterialTheme.typography.bodyMedium)
                            Text(
                                text = if (authState.isAdmin) "Admin" else "User",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    } else {
                        Text("Not logged in", style = MaterialTheme.typography.bodyMedium)
                    }
                }
                Spacer(Modifier.height(8.dp))
                Text(
                    text = "Server: ${authState.serverUrl.ifEmpty { "None (offline mode)" }}",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (authState.isAdmin) {
                        OutlinedButton(
                            onClick = onNavigateAdmin,
                            shape = RoundedCornerShape(8.dp)
                        ) {
                            Icon(Icons.Default.Info, null, modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(4.dp))
                            Text("Dashboard")
                        }
                    }
                    if (authState.isLoggedIn) {
                        OutlinedButton(
                            onClick = onLogout,
                            shape = RoundedCornerShape(8.dp)
                        ) {
                            Icon(Icons.AutoMirrored.Filled.Logout, null, modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(4.dp))
                            Text("Logout")
                        }
                    } else {
                        OutlinedButton(
                            onClick = onLogout,
                            shape = RoundedCornerShape(8.dp)
                        ) {
                            Text("Login / Register")
                        }
                    }
                }
            }
        }

        Spacer(Modifier.height(24.dp))

        Text(
            text = "Download Quality",
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.onSurface
        )
        Spacer(Modifier.height(8.dp))
        Row {
            listOf(128, 192, 320).forEach { quality ->
                FilterChip(
                    selected = uiState.downloadQuality == quality,
                    onClick = { viewModel.setDownloadQuality(quality) },
                    label = { Text("${quality}kbps") },
                    modifier = Modifier.padding(end = 8.dp)
                )
            }
        }

        Spacer(Modifier.height(24.dp))

        Text(
            text = "Download Format",
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.onSurface
        )
        Spacer(Modifier.height(8.dp))
        Row {
            listOf("mp3", "aac", "flac").forEach { format ->
                FilterChip(
                    selected = uiState.downloadFormat == format,
                    onClick = { viewModel.setDownloadFormat(format) },
                    label = { Text(format.uppercase()) },
                    modifier = Modifier.padding(end = 8.dp)
                )
            }
        }

        Spacer(Modifier.height(24.dp))

        Text(
            text = "Deezer ARL",
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.onSurface
        )
        Spacer(Modifier.height(8.dp))

        var showArl by remember { mutableStateOf(false) }
        OutlinedTextField(
            value = uiState.deezerArl,
            onValueChange = viewModel::setDeezerArl,
            label = { Text("ARL Cookie") },
            placeholder = { Text("Enter your Deezer ARL for high quality downloads") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            visualTransformation = if (showArl) VisualTransformation.None else PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(
                keyboardType = KeyboardType.Password,
                imeAction = ImeAction.Done
            ),
            keyboardActions = KeyboardActions(onDone = { }),
            trailingIcon = {
                TextButton(onClick = { showArl = !showArl }) {
                    Text(if (showArl) "Hide" else "Show")
                }
            },
            shape = RoundedCornerShape(12.dp)
        )

        Spacer(Modifier.height(32.dp))

        HorizontalDivider(color = MaterialTheme.colorScheme.outline)
        Spacer(Modifier.height(16.dp))

        Text(
            text = "About",
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.onSurface
        )
        Spacer(Modifier.height(8.dp))
        Surface(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(12.dp),
            color = MaterialTheme.colorScheme.surface
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.Info, null, tint = MaterialTheme.colorScheme.primary)
                    Spacer(Modifier.width(8.dp))
                    Text("Sinc Enhanced", style = MaterialTheme.typography.titleMedium)
                }
                Spacer(Modifier.height(4.dp))
                Text(
                    text = "Version 1.0.0",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(Modifier.height(8.dp))
                Text(
                    text = "A native Android music downloader.\nSearch, download, and play music from Spotify, YouTube, Deezer, and SoundCloud.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }

        Spacer(Modifier.height(24.dp))
    }
}
