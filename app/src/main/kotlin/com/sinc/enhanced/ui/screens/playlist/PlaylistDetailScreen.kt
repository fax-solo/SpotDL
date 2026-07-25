package com.sinc.enhanced.ui.screens.playlist

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.QueueMusic
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import android.content.Intent
import kotlinx.coroutines.launch
import com.sinc.enhanced.data.local.entity.PlaylistTrackEntity
import com.sinc.enhanced.data.model.Track
import com.sinc.enhanced.ui.components.TrackItem

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PlaylistDetailScreen(
    playlistId: Int,
    onPlayTrack: (Track) -> Unit,
    onPlayAll: (List<Track>) -> Unit,
    onNavigateBack: () -> Unit,
    viewModel: PlaylistDetailViewModel = viewModel(factory = PlaylistDetailViewModel.Factory(playlistId))
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val snackbarHostState = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    var showDeleteConfirm by remember { mutableStateOf(false) }
    var lastDeletedTrack by remember { mutableStateOf<PlaylistTrackEntity?>(null) }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
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
                        val context = LocalContext.current
                        val scope = rememberCoroutineScope()
                        if (uiState.isSelectionMode) {
                            if (uiState.selectedTrackIds.isNotEmpty()) {
                                IconButton(onClick = { viewModel.removeSelectedTracks() }) {
                                    Icon(Icons.Default.Delete, "${uiState.selectedTrackIds.size} selected", tint = MaterialTheme.colorScheme.error)
                                }
                            }
                            IconButton(onClick = { viewModel.toggleSelectionMode() }) {
                                Icon(Icons.Default.Close, "Done")
                            }
                        } else {
                            IconButton(onClick = { viewModel.refresh() }) {
                                Icon(Icons.Default.Refresh, "Refresh")
                            }
                            IconButton(onClick = {
                                val shareText = buildString {
                                    append("Check out my playlist \"${playlist.name}\" on Sinc Enhanced\n\n")
                                    uiState.tracks.take(50).forEachIndexed { i, t ->
                                        append("${i + 1}. ${t.title} - ${t.artist}\n")
                                    }
                                }
                                val intent = Intent(Intent.ACTION_SEND).apply {
                                    type = "text/plain"
                                    putExtra(Intent.EXTRA_SUBJECT, "Playlist: ${playlist.name}")
                                    putExtra(Intent.EXTRA_TEXT, shareText)
                                }
                                context.startActivity(Intent.createChooser(intent, "Share playlist"))
                            }) {
                                Icon(Icons.Default.Share, "Share playlist")
                            }
                            IconButton(onClick = { viewModel.showEditDialog() }) {
                                Icon(Icons.Default.Edit, "Edit")
                            }
                            IconButton(onClick = { viewModel.toggleSelectionMode() }) {
                                Icon(Icons.Default.FormatListBulleted, "Select")
                            }
                            IconButton(onClick = { showDeleteConfirm = true }) {
                                Icon(Icons.Default.Delete, "Delete", tint = MaterialTheme.colorScheme.error)
                            }
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
        } else if (uiState.error != null) {
            Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(Icons.Default.ErrorOutline, null, modifier = Modifier.size(64.dp), tint = MaterialTheme.colorScheme.error)
                    Spacer(Modifier.height(16.dp))
                    Text(uiState.error!!, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.error)
                    Spacer(Modifier.height(16.dp))
                    OutlinedButton(onClick = { viewModel.refresh() }) {
                        Text("Retry")
                    }
                }
            }
        } else if (uiState.tracks.isEmpty()) {
            Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(Icons.AutoMirrored.Filled.QueueMusic, null, modifier = Modifier.size(64.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
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
                val playlistRepositoryRef = com.sinc.enhanced.SincApp.instance.container.playlistRepository
                val snackRef = snackbarHostState
                item {
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
                    ) {
                        val p = uiState.playlist
                        val tracks = uiState.tracks.map { e ->
                            Track(
                                id = e.trackId,
                                title = e.title,
                                artist = e.artist,
                                album = e.album,
                                durationMs = e.durationMs,
                                artworkUrl = e.artworkUrl,
                                source = e.source,
                                previewUrl = e.filePath
                            )
                        }
                        Column(modifier = Modifier.padding(16.dp)) {
                            Text(p?.name ?: "", style = MaterialTheme.typography.headlineSmall)
                            if (p?.description?.isNotEmpty() == true) {
                                Text(p.description, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            Spacer(Modifier.height(8.dp))
                            Text("${uiState.tracks.size} tracks", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Spacer(Modifier.height(12.dp))
                            Button(
                                onClick = { onPlayAll(tracks) },
                                enabled = tracks.isNotEmpty()
                            ) {
                                Icon(Icons.Default.PlayArrow, null)
                                Spacer(Modifier.width(8.dp))
                                Text("Play All")
                            }
                        }
                    }
                }

                itemsIndexed(uiState.tracks, key = { _, item -> item.id }) { index, trackEntity ->
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
                    if (uiState.isSelectionMode) {
                        val isSelected = trackEntity.trackId in uiState.selectedTrackIds
                        Surface(
                            onClick = { viewModel.toggleTrackSelection(trackEntity.trackId) },
                            color = if (isSelected) MaterialTheme.colorScheme.primaryContainer
                                    else MaterialTheme.colorScheme.surface,
                            shape = RoundedCornerShape(12.dp)
                        ) {
                            Row(
                                modifier = Modifier.fillMaxWidth().padding(8.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Checkbox(
                                    checked = isSelected,
                                    onCheckedChange = { viewModel.toggleTrackSelection(trackEntity.trackId) }
                                )
                                Spacer(Modifier.width(8.dp))
                                TrackItem(
                                    track = track,
                                    onClick = { viewModel.toggleTrackSelection(trackEntity.trackId) },
                                    modifier = Modifier.fillMaxWidth()
                                )
                            }
                        }
                    } else {
                        TrackItem(
                            track = track,
                            onClick = { if (url != null) onPlayTrack(track) },
                            trailing = {
                                Row {
                                    if (index > 0) {
                                        IconButton(onClick = {
                                            viewModel.reorderTrack(index, index - 1)
                                        }) {
                                            Icon(Icons.Default.ArrowDropUp, "Move up")
                                        }
                                    }
                                    if (index < uiState.tracks.size - 1) {
                                        IconButton(onClick = {
                                            viewModel.reorderTrack(index, index + 1)
                                        }) {
                                            Icon(Icons.Default.ArrowDropDown, "Move down")
                                        }
                                    }
                                    IconButton(onClick = {
                                        val removedEntity = trackEntity
                                        viewModel.removeTrack(removedEntity.trackId)
                                        lastDeletedTrack = removedEntity
                                        scope.launch {
                                            val result = snackRef.showSnackbar("Track removed", actionLabel = "Undo")
                                            if (result == SnackbarResult.ActionPerformed) {
                                                lastDeletedTrack?.let { restored ->
                                                    val repo = playlistRepositoryRef
                                                    val p = uiState.playlist
                                                    if (p != null) {
                                                        val t = Track(id = restored.trackId, title = restored.title, artist = restored.artist, album = restored.album, durationMs = restored.durationMs, artworkUrl = restored.artworkUrl, source = restored.source)
                                                        repo.addTrack(p.id, t, restored.filePath)
                                                    }
                                                }
                                            }
                                        }
                                    }) {
                                        Icon(Icons.Default.RemoveCircleOutline, "Remove", tint = MaterialTheme.colorScheme.error)
                                    }
                                }
                            }
                        )
                    }
                }
            }
        }
    }

    if (showDeleteConfirm) {
        AlertDialog(
            onDismissRequest = { showDeleteConfirm = false },
            title = { Text("Delete Playlist") },
            text = { Text("Are you sure you want to delete this playlist? This action cannot be undone.") },
            confirmButton = {
                Button(onClick = {
                    showDeleteConfirm = false
                    scope.launch {
                        com.sinc.enhanced.SincApp.instance.container.playlistRepository.delete(playlistId)
                        onNavigateBack()
                    }
                }, colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error)) {
                    Text("Delete", color = MaterialTheme.colorScheme.onError)
                }
            },
            dismissButton = { TextButton(onClick = { showDeleteConfirm = false }) { Text("Cancel") } }
        )
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
