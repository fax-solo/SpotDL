package com.sinc.enhanced.ui.screens.queue

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
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
import com.sinc.enhanced.ui.components.DownloadProgress
import com.sinc.enhanced.ui.components.TrackItem

@Composable
fun QueueScreen(
    viewModel: QueueViewModel = viewModel(factory = QueueViewModel.Factory(LocalContext.current))
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = "Downloads",
                style = MaterialTheme.typography.headlineLarge,
                color = MaterialTheme.colorScheme.onBackground
            )
            if (uiState.downloads.isNotEmpty()) {
                TextButton(onClick = { viewModel.clearAll() }) {
                    Text("Clear all")
                }
            }
        }

        Spacer(Modifier.height(16.dp))

        if (uiState.downloads.isEmpty()) {
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
        } else {
            LazyColumn(
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                items(uiState.downloads) { download ->
                    DownloadItem(
                        download = download,
                        onRemove = { viewModel.removeDownload(download.trackId) },
                        onRetry = { viewModel.retryDownload(download.trackId) }
                    )
                }
            }
        }
    }
}

@Composable
private fun DownloadItem(
    download: DownloadEntity,
    onRemove: () -> Unit,
    onRetry: () -> Unit
) {
    val track = com.sinc.enhanced.data.model.Track(
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
        onClick = {},
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
                        IconButton(onClick = onRemove) {
                            Icon(Icons.Default.Delete, "Remove", tint = MaterialTheme.colorScheme.onSurfaceVariant)
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
