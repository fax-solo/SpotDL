package com.sinc.enhanced.ui.screens.history

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.sinc.enhanced.ui.components.TrackItem

@Composable
fun HistoryScreen(
    onPlayTrack: (com.sinc.enhanced.data.model.Track, String) -> Unit,
    viewModel: HistoryViewModel = viewModel(factory = HistoryViewModel.Factory())
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
                text = "History",
                style = MaterialTheme.typography.headlineLarge,
                color = MaterialTheme.colorScheme.onBackground
            )
            if (uiState.history.isNotEmpty()) {
                TextButton(onClick = { viewModel.clearHistory() }) {
                    Text("Clear history")
                }
            }
        }

        Spacer(Modifier.height(16.dp))

        if (uiState.history.isEmpty()) {
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = "No history yet",
                    style = MaterialTheme.typography.titleLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        } else {
            LazyColumn(
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                items(uiState.history, key = { it.id }) { item ->
                    val track = com.sinc.enhanced.data.model.Track(
                        id = item.trackId,
                        title = item.title,
                        artist = item.artist,
                        album = item.album,
                        artworkUrl = item.artworkUrl,
                        durationMs = item.durationMs,
                        source = item.source,
                        previewUrl = item.filePath
                    )
                    TrackItem(
                        track = track,
                        onClick = { item.filePath?.let { onPlayTrack(track, it) } },
                        trailing = {
                            IconButton(onClick = { item.filePath?.let { onPlayTrack(track, it) } }) {
                                Icon(
                                    Icons.Default.PlayArrow,
                                    "Play",
                                    tint = MaterialTheme.colorScheme.primary
                                )
                            }
                        }
                    )
                }
            }
        }
    }
}
