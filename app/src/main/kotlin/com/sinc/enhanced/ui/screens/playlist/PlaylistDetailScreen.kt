package com.sinc.enhanced.ui.screens.playlist

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import kotlinx.coroutines.launch
import com.sinc.enhanced.data.local.entity.PlaylistTrackEntity
import com.sinc.enhanced.data.model.Track
import com.sinc.enhanced.ui.components.TrackItem

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PlaylistDetailScreen(
    playlistId: Int,
    onPlayTrack: (Track) -> Unit,
    onNavigateBack: () -> Unit,
    viewModel: PlaylistDetailViewModel = viewModel(factory = PlaylistDetailViewModel.Factory(playlistId))
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(uiState.playlist?.name ?: "Playlist") },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back")
                    }
                },
                actions = {
                    val playlist = uiState.playlist
                    if (playlist != null) {
                        val scope = rememberCoroutineScope()
                        IconButton(onClick = { viewModel.showEditDialog() }) {
                            Icon(Icons.Default.Edit, "Edit")
                        }
                        IconButton(onClick = {
                            scope.launch {
                                com.sinc.enhanced.SincApp.instance.container.playlistRepository.delete(playlist.id)
                                onNavigateBack()
                            }
                        }) {
                            Icon(Icons.Default.Delete, "Delete", tint = MaterialTheme.colorScheme.error)
                        }
                    }
                }
            )
        }
    ) { padding ->
        if (uiState.isLoading) {
            Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
        } else if (uiState.tracks.isEmpty()) {
            Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(Icons.Default.QueueMusic, null, modifier = Modifier.size(64.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(Modifier.height(16.dp))
                    Text("This playlist is empty", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(Modifier.height(8.dp))
                    Text("Add tracks from the Library", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxSize().padding(padding).padding(horizontal = 16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                item {
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
                    ) {
                        val p = uiState.playlist
                        Column(modifier = Modifier.padding(16.dp)) {
                            Text(p?.name ?: "", style = MaterialTheme.typography.headlineSmall)
                            if (p?.description?.isNotEmpty() == true) {
                                Text(p.description, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            Spacer(Modifier.height(8.dp))
                            Text("${uiState.tracks.size} tracks", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }

                items(uiState.tracks, key = { it.id }) { trackEntity ->
                    val url = trackEntity.filePath
                    val track = Track(
                        id = trackEntity.trackId,
                        title = trackEntity.title,
                        artist = trackEntity.artist,
                        album = trackEntity.album,
                        durationMs = trackEntity.durationMs,
                        artworkUrl = trackEntity.artworkUrl,
                        source = trackEntity.source,
                        previewUrl = url
                    )
                    TrackItem(
                        track = track,
                        onClick = { if (url != null) onPlayTrack(track) },
                        trailing = {
                            IconButton(onClick = { viewModel.removeTrack(trackEntity.trackId) }) {
                                Icon(Icons.Default.RemoveCircleOutline, "Remove", tint = MaterialTheme.colorScheme.error)
                            }
                        }
                    )
                }
            }
        }
    }

    if (uiState.showEditDialog) {
        val p = uiState.playlist
        var name by remember { mutableStateOf(p?.name ?: "") }
        var description by remember { mutableStateOf(p?.description ?: "") }
        AlertDialog(
            onDismissRequest = { viewModel.hideEditDialog() },
            title = { Text("Edit Playlist") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(value = name, onValueChange = { name = it }, label = { Text("Name") }, singleLine = true)
                    OutlinedTextField(value = description, onValueChange = { description = it }, label = { Text("Description") }, singleLine = true)
                }
            },
            confirmButton = {
                Button(onClick = { if (name.isNotBlank()) viewModel.updatePlaylist(name, description) }) { Text("Save") }
            },
            dismissButton = { TextButton(onClick = { viewModel.hideEditDialog() }) { Text("Cancel") } }
        )
    }
}
