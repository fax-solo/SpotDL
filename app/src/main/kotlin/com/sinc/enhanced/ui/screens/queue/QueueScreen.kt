package com.sinc.enhanced.ui.screens.queue

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import coil.compose.rememberAsyncImagePainter
import com.sinc.enhanced.data.local.entity.DownloadEntity
import com.sinc.enhanced.data.model.Track
import com.sinc.enhanced.ui.components.DownloadProgress

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
                title = {
                    Column {
                        Text("Downloads")
                        if (uiState.downloads.isNotEmpty()) {
                            Text(
                                text = "${uiState.downloads.size} items",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                },
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
                            Icon(
                                Icons.Default.ErrorOutline, null,
                                modifier = Modifier.size(48.dp),
                                tint = MaterialTheme.colorScheme.error
                            )
                            Spacer(Modifier.height(12.dp))
                            Text(
                                text = uiState.error!!,
                                color = MaterialTheme.colorScheme.error,
                                style = MaterialTheme.typography.bodyLarge
                            )
                            Spacer(Modifier.height(12.dp))
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
                            Icon(
                                Icons.Default.Download, null,
                                modifier = Modifier.size(64.dp),
                                tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.4f)
                            )
                            Spacer(Modifier.height(16.dp))
                            Text(
                                text = "No downloads yet",
                                style = MaterialTheme.typography.titleLarge,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            Spacer(Modifier.height(8.dp))
                            Text(
                                text = "Search for music and start downloading",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f)
                            )
                        }
                    }
                }
                else -> {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                        contentPadding = PaddingValues(vertical = 8.dp)
                    ) {
                        items(uiState.downloads, key = { it.trackId }) { download ->
                            SwipeToDismissBox(
                                state = rememberSwipeToDismissBoxState(
                                    confirmValueChange = {
                                        if (it == SwipeToDismissBoxValue.EndToStart) {
                                            viewModel.removeDownload(download.trackId)
                                            true
                                        } else false
                                    }
                                ),
                                backgroundContent = {
                                    Box(
                                        modifier = Modifier
                                            .fillMaxSize()
                                            .clip(RoundedCornerShape(12.dp))
                                            .background(Color(0xFFDC2626))
                                            .padding(end = 20.dp),
                                        contentAlignment = Alignment.CenterEnd
                                    ) {
                                        Icon(
                                            Icons.Default.Delete, "Remove",
                                            tint = Color.White,
                                            modifier = Modifier.size(24.dp)
                                        )
                                    }
                                },
                                enableDismissFromStartToEnd = false
                            ) {
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

    Surface(
        shape = RoundedCornerShape(12.dp),
        color = MaterialTheme.colorScheme.surface,
        tonalElevation = 1.dp
    ) {
        Column {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable {
                        if (download.status == "completed") onPlay()
                    }
                    .padding(12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                if (download.artworkUrl != null) {
                    Image(
                        painter = rememberAsyncImagePainter(download.artworkUrl),
                        contentDescription = null,
                        modifier = Modifier
                            .size(48.dp)
                            .clip(RoundedCornerShape(8.dp)),
                        contentScale = ContentScale.Crop
                    )
                } else {
                    Surface(
                        modifier = Modifier.size(48.dp),
                        shape = RoundedCornerShape(8.dp),
                        color = MaterialTheme.colorScheme.surfaceVariant
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(Icons.Default.MusicNote, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }

                Spacer(Modifier.width(12.dp))

                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = download.title,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Medium,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    Spacer(Modifier.height(2.dp))
                    Text(
                        text = download.artist,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    Row {
                        Text(
                            text = download.album,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.weight(1f, fill = false)
                        )
                        if (download.durationMs > 0) {
                            Spacer(Modifier.width(8.dp))
                            Text(
                                text = Track(
                                    id = download.trackId, title = "", artist = "", album = "",
                                    durationMs = download.durationMs
                                ).durationFormatted,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }

                Spacer(Modifier.width(4.dp))

                when (download.status) {
                    "downloading", "queued" -> {
                        IconButton(onClick = onRemove) {
                            Icon(Icons.Default.Close, "Cancel", tint = MaterialTheme.colorScheme.error)
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

            if (download.status == "downloading") {
                DownloadProgress(progress = download.progress, status = download.status)
            }
        }
    }
}
