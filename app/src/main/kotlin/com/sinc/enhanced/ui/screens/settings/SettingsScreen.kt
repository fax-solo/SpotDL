package com.sinc.enhanced.ui.screens.settings

import android.content.Intent
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.sinc.enhanced.BuildConfig
import com.sinc.enhanced.SincApp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    onLogout: () -> Unit = {},
    onNavigateAdmin: () -> Unit = {},
    viewModel: SettingsViewModel = viewModel(factory = SettingsViewModel.Factory(LocalContext.current))
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val authRepository = SincApp.instance.container.authRepository
    val authState by authRepository.authState.collectAsStateWithLifecycle(initialValue = com.sinc.enhanced.data.repository.AuthState())
    val scope = rememberCoroutineScope()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 16.dp)
            .verticalScroll(rememberScrollState())
    ) {
        Spacer(Modifier.height(8.dp))

        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(
                Icons.Default.Settings, null,
                tint = MaterialTheme.colorScheme.onSurface,
                modifier = Modifier.size(28.dp)
            )
            Spacer(Modifier.width(8.dp))
            Text(
                text = "Settings",
                style = MaterialTheme.typography.headlineLarge,
                color = MaterialTheme.colorScheme.onBackground
            )
        }

        Spacer(Modifier.height(24.dp))

        SettingsGroup(title = "Account & Server", icon = Icons.Default.Person) {
            Surface(
                shape = RoundedCornerShape(12.dp),
                color = MaterialTheme.colorScheme.surfaceVariant
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.Person, null, tint = MaterialTheme.colorScheme.primary)
                        Spacer(Modifier.width(12.dp))
                        Column {
                            Text(
                                text = if (authState.isLoggedIn) authState.username else "Not logged in",
                                style = MaterialTheme.typography.bodyMedium,
                                fontWeight = FontWeight.Medium
                            )
                            Text(
                                text = if (authState.isLoggedIn) {
                                    if (authState.isAdmin) "Admin account" else "User account"
                                } else "Login to sync across devices",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                    if (authState.isAdmin && authState.serverUrl.isNotEmpty()) {
                        Spacer(Modifier.height(8.dp))
                        HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.3f))
                        Spacer(Modifier.height(8.dp))
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.Cloud, null, modifier = Modifier.size(16.dp), tint = MaterialTheme.colorScheme.primary)
                            Spacer(Modifier.width(8.dp))
                            Text(
                                text = authState.serverUrl,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                    Spacer(Modifier.height(12.dp))
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
                    if (authState.isAdmin) {
                        Spacer(Modifier.height(12.dp))
                        var showServerField by remember { mutableStateOf(false) }
                        if (!showServerField) {
                            TextButton(onClick = { showServerField = true }) {
                                Icon(Icons.Default.Cloud, null, modifier = Modifier.size(16.dp))
                                Spacer(Modifier.width(4.dp))
                                Text(if (authState.serverUrl.isEmpty()) "Set Server URL" else "Change Server URL")
                            }
                        } else {
                            var serverInput by remember(authState.serverUrl) { mutableStateOf(authState.serverUrl) }
                            OutlinedTextField(
                                value = serverInput,
                                onValueChange = { serverInput = it },
                                label = { Text("Worker URL") },
                                placeholder = { Text("https://your-worker.workers.dev") },
                                modifier = Modifier.fillMaxWidth(),
                                singleLine = true,
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri, imeAction = ImeAction.Done),
                                shape = RoundedCornerShape(12.dp)
                            )
                            Spacer(Modifier.height(8.dp))
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                Button(
                                    onClick = {
                                        scope.launch {
                                            authRepository.setServerUrl(serverInput)
                                            showServerField = false
                                        }
                                    },
                                    shape = RoundedCornerShape(8.dp),
                                    enabled = serverInput.isNotBlank()
                                ) { Text("Save") }
                                OutlinedButton(
                                    onClick = { showServerField = false },
                                    shape = RoundedCornerShape(8.dp)
                                ) { Text("Cancel") }
                            }
                        }
                    }
                }
            }
        }

        Spacer(Modifier.height(16.dp))

        SettingsGroup(title = "Audio Quality", icon = Icons.Default.Speed) {
            Text("Streaming", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf(128, 192, 320).forEach { quality ->
                    FilterChip(
                        selected = uiState.streamingQuality == quality,
                        onClick = { viewModel.setStreamingQuality(quality) },
                        label = { Text("${quality}kbps") },
                        shape = RoundedCornerShape(8.dp)
                    )
                }
                    }
                    Spacer(Modifier.height(8.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                        val downloadCount by SincApp.instance.container.downloadRepository.completedDownloads.collectAsStateWithLifecycle(initialValue = emptyList())
                        ProfileStat(label = "Downloads", value = downloadCount.size.toString())
                        ProfileStat(label = "Sources", value = "7")
                    }
                    Spacer(Modifier.height(12.dp))
            HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.3f))
            Spacer(Modifier.height(12.dp))
            Text("Download", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf(128, 192, 320).forEach { quality ->
                    FilterChip(
                        selected = uiState.downloadQuality == quality,
                        onClick = { viewModel.setDownloadQuality(quality) },
                        label = { Text("${quality}kbps") },
                        shape = RoundedCornerShape(8.dp)
                    )
                }
            }
        }

        Spacer(Modifier.height(16.dp))

        SettingsGroup(title = "Download Format", icon = Icons.Default.AudioFile) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf("mp3", "aac", "opus", "flac").forEach { format ->
                    FilterChip(
                        selected = uiState.downloadFormat == format,
                        onClick = { viewModel.setDownloadFormat(format) },
                        label = { Text(format.uppercase()) },
                        shape = RoundedCornerShape(8.dp)
                    )
                }
            }
        }

        Spacer(Modifier.height(16.dp))

        SettingsGroup(title = "Download Options", icon = Icons.Default.Download) {
            Surface(
                shape = RoundedCornerShape(12.dp),
                color = MaterialTheme.colorScheme.surfaceVariant
            ) {
                Row(
                    modifier = Modifier.padding(16.dp).fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = "Download Lyrics",
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.Medium,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                        Text(
                            text = "Save lyrics when downloading songs for offline viewing",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    Switch(
                        checked = uiState.downloadLyrics,
                        onCheckedChange = viewModel::setDownloadLyrics
                    )
                }
            }
        }

        Spacer(Modifier.height(16.dp))

        SettingsGroup(title = "Deezer ARL", icon = Icons.Default.Key) {
            Surface(
                shape = RoundedCornerShape(12.dp),
                color = MaterialTheme.colorScheme.surfaceVariant
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(
                        text = "Enter your Deezer ARL for high quality downloads",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Spacer(Modifier.height(8.dp))
                    var showArl by remember { mutableStateOf(false) }
                    OutlinedTextField(
                        value = uiState.deezerArl,
                        onValueChange = viewModel::setDeezerArl,
                        label = { Text("ARL Cookie") },
                        placeholder = { Text("Paste your Deezer ARL...") },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                        visualTransformation = if (showArl) VisualTransformation.None else PasswordVisualTransformation(),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
                        keyboardActions = KeyboardActions(onDone = { }),
                        trailingIcon = {
                            TextButton(onClick = { showArl = !showArl }) {
                                Text(if (showArl) "Hide" else "Show")
                            }
                        },
                        shape = RoundedCornerShape(12.dp)
                    )
                }
            }
        }

        Spacer(Modifier.height(16.dp))

        SettingsGroup(title = "Audio Processing", icon = Icons.Default.Tune) {
            Surface(shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.surfaceVariant) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("Downmix to Mono", style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium, color = MaterialTheme.colorScheme.onSurface)
                        Switch(checked = false, onCheckedChange = { })
                    }
                    Spacer(Modifier.height(8.dp))
                    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("Dynamic Range Compression", style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium, color = MaterialTheme.colorScheme.onSurface)
                        Switch(checked = false, onCheckedChange = { })
                    }
                    Spacer(Modifier.height(8.dp))
                    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("Crossfeed (Headphones)", style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium, color = MaterialTheme.colorScheme.onSurface)
                        Switch(checked = false, onCheckedChange = { })
                    }
                    Spacer(Modifier.height(8.dp))
                    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("Bit-perfect Playback", style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium, color = MaterialTheme.colorScheme.onSurface)
                        Switch(checked = false, onCheckedChange = { })
                    }
                }
            }
        }

        Spacer(Modifier.height(16.dp))

        SettingsGroup(title = "Scrobbling", icon = Icons.Default.MusicNote) {
            Surface(shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.surfaceVariant) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text("Scrobble to Last.fm", style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium, color = MaterialTheme.colorScheme.onSurface)
                            Text("Send listening data to Last.fm", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        Switch(checked = false, onCheckedChange = { })
                    }
                }
            }
        }

        Spacer(Modifier.height(16.dp))

        SettingsGroup(title = "Cache Management", icon = Icons.Default.Storage) {
            Surface(shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.surfaceVariant) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text("Cache stores resolved audio URLs for faster loading.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(Modifier.height(12.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedButton(onClick = { SincApp.instance.container.searchRepository.invalidateCache() }, shape = RoundedCornerShape(8.dp)) {
                            Icon(Icons.Default.Delete, null, modifier = Modifier.size(16.dp)); Spacer(Modifier.width(4.dp)); Text("Clear Cache")
                        }
                        OutlinedButton(onClick = { }, shape = RoundedCornerShape(8.dp)) {
                            Icon(Icons.Default.Save, null, modifier = Modifier.size(16.dp)); Spacer(Modifier.width(4.dp)); Text("Export Library")
                        }
                        OutlinedButton(onClick = { }, shape = RoundedCornerShape(8.dp)) {
                            Icon(Icons.Default.Restore, null, modifier = Modifier.size(16.dp)); Spacer(Modifier.width(4.dp)); Text("Import Library")
                        }
                    }
                }
            }
        }

        Spacer(Modifier.height(16.dp))

        SettingsGroup(title = "Language", icon = Icons.Default.Language) {
            Surface(shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.surfaceVariant) {
                Row(modifier = Modifier.padding(16.dp).fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text("App Language", style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium, color = MaterialTheme.colorScheme.onSurface)
                        Text("Requires app restart", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    var expanded by remember { mutableStateOf(false) }
                    ExposedDropdownMenuBox(expanded = expanded, onExpandedChange = { expanded = it }) {
                        OutlinedTextField(value = "System Default", onValueChange = { }, readOnly = true, modifier = Modifier.menuAnchor().width(180.dp), singleLine = true, textStyle = MaterialTheme.typography.bodySmall)
                        ExposedDropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                            listOf("System Default", "English", "Spanish", "French", "German", "Arabic", "Hindi").forEach { lang ->
                                DropdownMenuItem(text = { Text(lang) }, onClick = { expanded = false })
                            }
                        }
                    }
                }
            }
        }

        Spacer(Modifier.height(24.dp))

        HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.5f))

        Spacer(Modifier.height(16.dp))

        SettingsGroup(title = "About", icon = Icons.Default.Info) {
            Surface(
                shape = RoundedCornerShape(12.dp),
                color = MaterialTheme.colorScheme.surface,
                tonalElevation = 1.dp
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Surface(
                            modifier = Modifier.size(40.dp),
                            shape = RoundedCornerShape(10.dp),
                            color = MaterialTheme.colorScheme.primary.copy(alpha = 0.15f)
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Icon(Icons.Default.MusicNote, null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(24.dp))
                            }
                        }
                        Spacer(Modifier.width(12.dp))
                        Column {
                            Text(
                                text = "Sinc Enhanced",
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onSurface
                            )
                            Text(
                                text = "Version ${BuildConfig.VERSION_NAME}",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                    Spacer(Modifier.height(12.dp))
                    Text(
                        text = "A native Android music downloader.\nSearch, download, and play music from Spotify, YouTube, Deezer, and SoundCloud.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }

        Spacer(Modifier.height(32.dp))
    }
}

@Composable
private fun SettingsGroup(
    title: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    content: @Composable ColumnScope.() -> Unit
) {
    Column {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(
                icon, null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(20.dp)
            )
            Spacer(Modifier.width(8.dp))
            Text(
                text = title,
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onSurface
            )
        }
        Spacer(Modifier.height(8.dp))
        content()
    }
}

@Composable
private fun ProfileStat(label: String, value: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(text = value, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
        Text(text = label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
