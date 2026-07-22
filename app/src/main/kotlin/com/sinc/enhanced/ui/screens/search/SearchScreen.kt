package com.sinc.enhanced.ui.screens.search

import androidx.compose.foundation.Image
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Album
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import coil.compose.rememberAsyncImagePainter
import com.sinc.enhanced.data.model.Album
import com.sinc.enhanced.ui.components.SearchBar
import com.sinc.enhanced.ui.components.TrackItem

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SearchScreen(
    onPlayTrack: (String, String) -> Unit,
    onDownloadTrack: (String, String) -> Unit,
    onNavigateSettings: () -> Unit = {},
    onNavigateHistory: () -> Unit = {},
    viewModel: SearchViewModel = viewModel(factory = SearchViewModel.Factory())
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
                text = "Search",
                style = MaterialTheme.typography.headlineLarge,
                color = MaterialTheme.colorScheme.onBackground
            )
            Row {
                IconButton(onClick = onNavigateHistory) {
                    Icon(Icons.Default.History, "History", tint = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                IconButton(onClick = onNavigateSettings) {
                    Icon(Icons.Default.Settings, "Settings", tint = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }

        Spacer(Modifier.height(16.dp))

        SearchBar(
            query = uiState.query,
            onQueryChange = viewModel::onQueryChange,
            onSearch = { viewModel.onSearch(uiState.query) }
        )

        Spacer(Modifier.height(16.dp))

        when {
            uiState.isSearching -> {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                    CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
                }
            }
            uiState.error != null -> {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(
                            text = uiState.error ?: "Error",
                            color = MaterialTheme.colorScheme.error,
                            style = MaterialTheme.typography.bodyLarge
                        )
                        Spacer(Modifier.height(8.dp))
                        Button(onClick = { viewModel.onSearch(uiState.query) }) {
                            Text("Retry")
                        }
                    }
                }
            }
            uiState.query.isBlank() -> {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = "Search for music by artist, album, or song name",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        style = MaterialTheme.typography.bodyLarge
                    )
                }
            }
            else -> {
                LazyColumn(
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    if (uiState.albums.isNotEmpty()) {
                        item {
                            Text(
                                text = "Albums",
                                style = MaterialTheme.typography.titleMedium,
                                color = MaterialTheme.colorScheme.onSurface,
                                modifier = Modifier.padding(vertical = 8.dp)
                            )
                        }
                        item {
                            LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                items(uiState.albums) { album ->
                                    AlbumCard(
                                        album = album,
                                        onClick = { viewModel.selectAlbum(album) }
                                    )
                                }
                            }
                        }
                        item { Spacer(Modifier.height(8.dp)) }
                    }

                    if (uiState.results.isNotEmpty()) {
                        item {
                            Text(
                                text = "Tracks",
                                style = MaterialTheme.typography.titleMedium,
                                color = MaterialTheme.colorScheme.onSurface,
                                modifier = Modifier.padding(vertical = 8.dp)
                            )
                        }
                        items(uiState.results) { enriched ->
                            TrackItem(
                                track = enriched.track,
                                onClick = {
                                    enriched.audioUrl?.let { url ->
                                        onPlayTrack(enriched.track.id, url)
                                    }
                                },
                                trailing = {
                                    Row {
                                        if (enriched.audioUrl != null) {
                                            IconButton(onClick = { onPlayTrack(enriched.track.id, enriched.audioUrl) }) {
                                                Icon(
                                                    imageVector = Icons.Default.PlayArrow,
                                                    contentDescription = "Play",
                                                    tint = MaterialTheme.colorScheme.primary
                                                )
                                            }
                                            IconButton(onClick = { onDownloadTrack(enriched.track.id, enriched.audioUrl) }) {
                                                Icon(
                                                    imageVector = Icons.Default.Download,
                                                    contentDescription = "Download",
                                                    tint = MaterialTheme.colorScheme.primary
                                                )
                                            }
                                        }
                                    }
                                }
                            )
                        }
                    }

                    if (uiState.results.isEmpty() && uiState.albums.isEmpty() && uiState.query.isNotBlank()) {
                        item {
                            Box(
                                modifier = Modifier.fillMaxWidth().padding(top = 48.dp),
                                contentAlignment = Alignment.Center
                            ) {
                                Text(
                                    text = "No results found",
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    style = MaterialTheme.typography.bodyLarge
                                )
                            }
                        }
                    }
                }
            }
        }
    }

    uiState.selectedAlbum?.let { album ->
        AlbumDetailDialog(
            album = album,
            tracks = uiState.albumTracks,
            onDismiss = { viewModel.dismissAlbum() },
            onDownloadTrack = onDownloadTrack,
            onPlayTrack = onPlayTrack
        )
    }
}

@Composable
private fun AlbumCard(
    album: Album,
    onClick: () -> Unit
) {
    Surface(
        modifier = Modifier
            .width(150.dp)
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(12.dp),
        color = MaterialTheme.colorScheme.surfaceVariant
    ) {
        Column(modifier = Modifier.padding(8.dp)) {
            if (album.artworkUrl != null) {
                Image(
                    painter = rememberAsyncImagePainter(album.artworkUrl),
                    contentDescription = null,
                    modifier = Modifier
                        .size(134.dp)
                        .clip(RoundedCornerShape(8.dp)),
                    contentScale = ContentScale.Crop
                )
            } else {
                Box(
                    modifier = Modifier
                        .size(134.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(Icons.Default.Album, null, modifier = Modifier.size(48.dp))
                }
            }
            Spacer(Modifier.height(4.dp))
            Text(
                text = album.name,
                style = MaterialTheme.typography.bodyMedium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Text(
                text = album.artist,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
    }
}

@Composable
private fun AlbumDetailDialog(
    album: Album,
    tracks: List<com.sinc.enhanced.data.model.Track>,
    onDismiss: () -> Unit,
    onDownloadTrack: (String, String) -> Unit,
    onPlayTrack: (String, String) -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Column {
                Text(album.name, style = MaterialTheme.typography.titleLarge)
                Text(
                    text = album.artist,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        },
        text = {
            if (tracks.isEmpty()) {
                Text("Loading tracks...")
            } else {
                LazyColumn(modifier = Modifier.heightIn(max = 400.dp)) {
                    items(tracks) { track ->
                        TrackItem(
                            track = track,
                            onClick = {
                                track.previewUrl?.let { onPlayTrack(track.id, it) }
                            },
                            trailing = {
                                Row {
                                    IconButton(onClick = {
                                        track.previewUrl?.let { onPlayTrack(track.id, it) }
                                    }) {
                                        Icon(Icons.Default.PlayArrow, "Play")
                                    }
                                    IconButton(onClick = {
                                        track.previewUrl?.let { onDownloadTrack(track.id, it) }
                                    }) {
                                        Icon(Icons.Default.Download, "Download")
                                    }
                                }
                            }
                        )
                    }
                }
            }
        },
        confirmButton = {
            if (tracks.isNotEmpty()) {
                Button(onClick = {
                    tracks.forEach { track ->
                        track.previewUrl?.let { onDownloadTrack(track.id, it) }
                    }
                    onDismiss()
                }) {
                    Icon(Icons.Default.Download, null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(4.dp))
                    Text("Download All (${tracks.size})")
                }
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Close")
            }
        }
    )
}
