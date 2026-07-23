package com.sinc.enhanced.ui.screens.queue

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.sinc.enhanced.data.local.entity.DownloadEntity
import com.sinc.enhanced.data.model.Track
import com.sinc.enhanced.ui.components.DownloadProgress
import com.sinc.enhanced.ui.components.TrackItem

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun QueueScreen(
    onPlayTrack: (Track, String) -> Unit = { _, _ -> },
    viewModel: QueueViewModel = viewModel(factory = QueueViewModel.Factory(LocalContext.current))
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Downloads") },
                actions = {
                    if (uiState.downloads.isNotEmpty()) {
                        TextButton(onClick = { viewModel.clearAll() }) {
                            Text("Clear all")
                        }
                    }
                    IconButton(onClick = { viewModel.refresh() }) {
                        Icon(Icons.Default.Refresh, "Refresh")
                    }
                }
            )
        }
    ) { padding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            when {
                uiState.isLoading -> {
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center
                    ) {
                        CircularProgressIndicator()
                    }
                }
                uiState.error != null -> {
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text(
                                text = uiState.error!!,
                                color = MaterialTheme.colorScheme.error,
                                style = MaterialTheme.typography.bodyLarge
                            )
                            Spacer(Modifier.height(8.dp))
                            Button(onClick = { viewModel.refresh() }) {
                                Text("Retry")
                            }
                        }
                    }
                }
                uiState.downloads.isEmpty() -> {
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text(
                                text = "No downloads yet",
                                style = MaterialTheme.typography.titleLarge,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            Spacer(Modifier.height(8.dp))
                            Text(
                                text = "Search for music and start downloading",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }
                else -> {
                    LazyColumn(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(horizontal = 16.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                        contentPadding = PaddingValues(vertical = 16.dp)
                    ) {
                        items(uiState.downloads, key = { it.trackId }) { download ->
                            DownloadItem(
                                download = download,
                                onPlay = {
                                    val track = Track(
                                        id = download.trackId,
                                        title = download.title,
                                        artist = download.artist,
                                        album = download.album,
                                        artworkUrl = download.artworkUrl,
                                        durationMs = download.durationMs,
                                        isrc = download.isrc,
                                        source = download.source
                                    )
                                    download.filePath?.let { onPlayTrack(track, it) }
                                },
                                onRemove = { viewModel.removeDownload(download.trackId) },
                                onRetry = { viewModel.retryDownload(download.trackId) }
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun DownloadItem(
    download: DownloadEntity,
    onPlay: () -> Unit,
    onRemove: () -> Unit,
    onRetry: () -> Unit
) {
    val track = Track(
        id = download.trackId,
        title = download.title,
        artist = download.artist,
        album = download.album,
        artworkUrl = download.artworkUrl,
        durationMs = download.durationMs,
        isrc = download.isrc,
        source = download.source
    )

    TrackItem(
        track = track,
        onClick = {
            if (download.status == "completed") {
                onPlay()
            }
        },
        trailing = {
            Column {
                when (download.status) {
                    "downloading", "queued" -> {
                        IconButton(onClick = onRemove) {
                            Icon(Icons.Default.Delete, "Remove", tint = MaterialTheme.colorScheme.error)
                        }
                    }
                    "error" -> {
                        IconButton(onClick = onRetry) {
                            Icon(Icons.Default.Refresh, "Retry", tint = MaterialTheme.colorScheme.primary)
                        }
                    }
                    "completed" -> {
                        Row {
                            IconButton(onClick = onPlay) {
                                Icon(Icons.Default.PlayArrow, "Play", tint = MaterialTheme.colorScheme.primary)
                            }
                            IconButton(onClick = onRemove) {
                                Icon(Icons.Default.Delete, "Remove", tint = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                    }
                }
            }
        }
    )
    if (download.status == "downloading") {
        DownloadProgress(progress = download.progress, status = download.status)
    }
}
