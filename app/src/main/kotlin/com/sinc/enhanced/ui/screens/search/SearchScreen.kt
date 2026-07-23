package com.sinc.enhanced.ui.screens.search

import androidx.compose.foundation.Image
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Album
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Person
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
    onPlayTrack: (com.sinc.enhanced.data.model.Track, String) -> Unit,
    onDownloadTrack: (com.sinc.enhanced.data.model.Track, String) -> Unit,
    onNavigateArtist: (String) -> Unit = {},
    onNavigateTrack: (String) -> Unit = {},
    onNavigateSettings: () -> Unit = {},
    onNavigateHistory: () -> Unit = {},
    viewModel: SearchViewModel = viewModel(factory = SearchViewModel.Factory())
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val listState = rememberLazyListState()

    LaunchedEffect(listState) {
        snapshotFlow {
            val layoutInfo = listState.layoutInfo
            val totalItems = layoutInfo.totalItemsCount
            val lastVisible = layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0
            lastVisible >= totalItems - 2
        }.collect { nearEnd ->
            if (nearEnd) viewModel.loadMore()
        }
    }

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
                    state = listState,
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    if (uiState.artists.isNotEmpty()) {
                        item {
                            Text(
                                text = "Artists",
                                style = MaterialTheme.typography.titleMedium,
                                color = MaterialTheme.colorScheme.onSurface,
                                modifier = Modifier.padding(vertical = 8.dp)
                            )
                        }
                        item {
                            LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                items(uiState.artists, key = { it.id }) { artist ->
                                    ArtistCard(
                                        artist = artist,
                                        onClick = { onNavigateArtist(artist.id) }
                                    )
                                }
                            }
                        }
                        item { Spacer(Modifier.height(8.dp)) }
                    }

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
                                items(uiState.albums, key = { it.id }) { album ->
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
                        items(uiState.results, key = { it.track.id }) { enriched ->
                            TrackItem(
                                track = enriched.track,
                                onClick = { onNavigateTrack(enriched.track.id) },
                                trailing = {
                                    Row {
                                        if (enriched.audioUrl != null) {
                                            IconButton(onClick = {
                                                enriched.audioUrl?.let { onPlayTrack(enriched.track, it) }
                                            }) {
                                                Icon(
                                                    imageVector = Icons.Default.PlayArrow,
                                                    contentDescription = "Play",
                                                    tint = MaterialTheme.colorScheme.primary
                                                )
                                            }
                                            IconButton(onClick = {
                                                enriched.audioUrl?.let { onDownloadTrack(enriched.track, it) }
                                            }) {
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

                        if (uiState.hasMore) {
                            item {
                                Box(
                                    modifier = Modifier.fillMaxWidth().padding(16.dp),
                                    contentAlignment = Alignment.Center
                                ) {
                                    if (uiState.isLoadingMore) {
                                        CircularProgressIndicator(
                                            modifier = Modifier.size(24.dp),
                                            strokeWidth = 2.dp
                                        )
                                    } else {
                                        Text(
                                            text = "More tracks available — scroll down",
                                            style = MaterialTheme.typography.bodySmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant
                                        )
                                    }
                                }
                            }
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
            audioUrls = uiState.albumAudioUrls,
            onDismiss = { viewModel.dismissAlbum() },
            onDownloadTrack = onDownloadTrack,
            onPlayTrack = onPlayTrack,
            onNavigateTrack = onNavigateTrack
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
private fun ArtistCard(
    artist: com.sinc.enhanced.data.model.Artist,
    onClick: () -> Unit
) {
    Surface(
        modifier = Modifier
            .width(160.dp)
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(16.dp),
        color = MaterialTheme.colorScheme.surfaceVariant
    ) {
        Column(modifier = Modifier.padding(12.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            if (artist.imageUrl != null) {
                Image(
                    painter = rememberAsyncImagePainter(artist.imageUrl),
                    contentDescription = null,
                    modifier = Modifier
                        .size(120.dp)
                        .clip(CircleShape),
                    contentScale = ContentScale.Crop
                )
            } else {
                Surface(
                    modifier = Modifier.size(120.dp),
                    shape = CircleShape,
                    color = MaterialTheme.colorScheme.surfaceContainer
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(Icons.Default.Person, null, modifier = Modifier.size(48.dp))
                    }
                }
            }
            Spacer(Modifier.height(8.dp))
            Text(
                text = artist.name,
                style = MaterialTheme.typography.titleSmall,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                color = MaterialTheme.colorScheme.onSurface
            )
            if (artist.genres.isNotEmpty()) {
                Text(
                    text = artist.genres.take(2).joinToString(", "),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
        }
    }
}

@Composable
private fun AlbumDetailDialog(
    album: Album,
    tracks: List<com.sinc.enhanced.data.model.Track>,
    audioUrls: Map<String, String> = emptyMap(),
    onDismiss: () -> Unit,
    onDownloadTrack: (com.sinc.enhanced.data.model.Track, String) -> Unit,
    onPlayTrack: (com.sinc.enhanced.data.model.Track, String) -> Unit,
    onNavigateTrack: (String) -> Unit = {}
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
                    items(tracks, key = { it.id }) { track ->
                        val url = audioUrls[track.id] ?: track.previewUrl
                        TrackItem(
                            track = track,
                            onClick = { onNavigateTrack(track.id) },
                            trailing = {
                                if (url != null) {
                                    Row {
                                        IconButton(onClick = { onPlayTrack(track, url) }) {
                                            Icon(Icons.Default.PlayArrow, "Play")
                                        }
                                        IconButton(onClick = { onDownloadTrack(track, url) }) {
                                            Icon(Icons.Default.Download, "Download")
                                        }
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
                        val url = audioUrls[track.id] ?: track.previewUrl
                        if (url != null) onDownloadTrack(track, url)
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
