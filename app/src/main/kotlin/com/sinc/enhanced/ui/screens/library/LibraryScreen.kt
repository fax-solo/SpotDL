package com.sinc.enhanced.ui.screens.library

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.FileDownload
import androidx.compose.material.icons.filled.LibraryMusic
import androidx.compose.material.icons.automirrored.filled.QueueMusic
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.MusicNote
import androidx.compose.material.icons.filled.HourglassEmpty
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import coil.compose.rememberAsyncImagePainter
import com.sinc.enhanced.data.local.entity.DownloadEntity
import com.sinc.enhanced.data.model.Track
import com.sinc.enhanced.data.repository.MusicRepository
import com.sinc.enhanced.ui.components.TrackItem
import com.sinc.enhanced.ui.permission.AudioPermissionState
import com.sinc.enhanced.ui.permission.PermissionRequestEffect
import com.sinc.enhanced.ui.permission.PermissionRequiredContent
import com.sinc.enhanced.ui.screens.playlist.AddToPlaylistSheet

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LibraryScreen(
    onPlayLocal: (MusicRepository.LocalTrack) -> Unit,
    onPlayDownloaded: (DownloadEntity) -> Unit,
    onNavigatePlaylists: () -> Unit,
    onNavigateImportPlaylist: () -> Unit,
    viewModel: LibraryViewModel = viewModel(factory = LibraryViewModel.Factory())
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    var permissionState by remember { mutableStateOf<AudioPermissionState>(AudioPermissionState.NotAsked) }

    PermissionRequestEffect(
        permissionState = permissionState,
        onPermissionResult = { newState ->
            permissionState = newState
            viewModel.setPermissionState(newState)
            if (newState is AudioPermissionState.Granted) {
                viewModel.loadLocalMusic()
            }
        }
    )

    var addToPlaylistTrack by remember { mutableStateOf<Pair<Track, String?>?>(null) }

    addToPlaylistTrack?.let { (track, filePath) ->
        AddToPlaylistSheet(
            track = track,
            filePath = filePath,
            onDismiss = { addToPlaylistTrack = null },
            onPlaylistCreated = { addToPlaylistTrack = null }
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Library") },
                actions = {
                    IconButton(onClick = onNavigateImportPlaylist) {
                        Icon(Icons.Default.FileDownload, "Import Playlist")
                    }
                    IconButton(onClick = onNavigatePlaylists) {
                        Icon(Icons.AutoMirrored.Filled.QueueMusic, "Playlists")
                    }
                }
            )
        }
    ) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding)) {
            TabRow(
                selectedTabIndex = uiState.selectedTab,
                containerColor = MaterialTheme.colorScheme.surface
            ) {
                Tab(
                    selected = uiState.selectedTab == 0,
                    onClick = { viewModel.selectTab(0) },
                    text = {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                Icons.Default.LibraryMusic, null,
                                modifier = Modifier.size(18.dp),
                                tint = if (uiState.selectedTab == 0)
                                    MaterialTheme.colorScheme.primary
                                else MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            Spacer(Modifier.width(6.dp))
                            Text("Local")
                        }
                    }
                )
                Tab(
                    selected = uiState.selectedTab == 1,
                    onClick = { viewModel.selectTab(1) },
                    text = {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                Icons.Default.FileDownload, null,
                                modifier = Modifier.size(18.dp),
                                tint = if (uiState.selectedTab == 1)
                                    MaterialTheme.colorScheme.primary
                                else MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            Spacer(Modifier.width(6.dp))
                            Text("Downloaded")
                        }
                    }
                )
            }

            when (uiState.selectedTab) {
                0 -> LocalTab(
                    permissionState = permissionState,
                    uiState = uiState,
                    onRequestPermission = { permissionState = AudioPermissionState.NotAsked },
                    onRefresh = { viewModel.loadLocalMusic() },
                    onPlayLocal = onPlayLocal,
                    onAddToPlaylist = { track, filePath -> addToPlaylistTrack = track to filePath }
                )
                1 -> DownloadedTab(
                    downloadedTracks = uiState.downloadedTracks,
                    onPlay = onPlayDownloaded,
                    onAddToPlaylist = { track, filePath -> addToPlaylistTrack = track to filePath }
                )
            }
        }
    }
}

@Composable
private fun LocalTab(
    permissionState: com.sinc.enhanced.ui.permission.AudioPermissionState,
    uiState: LibraryUiState,
    onRequestPermission: () -> Unit,
    onRefresh: () -> Unit,
    onPlayLocal: (MusicRepository.LocalTrack) -> Unit,
    onAddToPlaylist: (Track, String?) -> Unit = { _, _ -> }
) {
    PermissionRequiredContent(
        permissionState = permissionState,
        onRequestPermission = onRequestPermission
    ) {
        Column(modifier = Modifier.fillMaxSize()) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                if (uiState.localCount > 0) {
                    Text(
                        text = "${uiState.localCount} tracks on device",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                IconButton(onClick = onRefresh) {
                    Icon(Icons.Default.Refresh, "Refresh")
                }
            }

            when {
                uiState.isLoading -> {
                    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator()
                    }
                }
                uiState.error != null -> {
                    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Card(
                            modifier = Modifier.fillMaxWidth().padding(16.dp),
                            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer)
                        ) {
                            Column(
                                modifier = Modifier.padding(16.dp),
                                horizontalAlignment = Alignment.CenterHorizontally
                            ) {
                                Icon(
                                    Icons.Default.HourglassEmpty, null,
                                    tint = MaterialTheme.colorScheme.onErrorContainer,
                                    modifier = Modifier.size(40.dp)
                                )
                                Spacer(Modifier.height(8.dp))
                                Text(
                                    text = uiState.error!!,
                                    color = MaterialTheme.colorScheme.onErrorContainer,
                                    style = MaterialTheme.typography.bodyMedium
                                )
                                Spacer(Modifier.height(12.dp))
                                Button(onClick = onRefresh) {
                                    Text("Retry")
                                }
                            }
                        }
                    }
                }
                uiState.localTracks.isEmpty() -> {
                    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Icon(
                                Icons.Default.MusicNote, null,
                                modifier = Modifier.size(64.dp),
                                tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.4f)
                            )
                            Spacer(Modifier.height(16.dp))
                            Text(
                                text = "No local music found",
                                style = MaterialTheme.typography.titleMedium,
                                color = MaterialTheme.colorScheme.onSurface
                            )
                            Spacer(Modifier.height(8.dp))
                            Text(
                                text = "Download music to see it here",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }
                else -> {
                    val localTracks = remember(uiState.localTracks) {
                        uiState.localTracks.map { localTrack ->
                            Track(
                                id = "local_${localTrack.id}",
                                title = localTrack.title,
                                artist = localTrack.artist,
                                album = localTrack.album,
                                durationMs = localTrack.durationMs,
                                artworkUrl = localTrack.albumArtUri,
                                source = "local"
                            )
                        }
                    }
                    LazyColumn(
                        modifier = Modifier.padding(horizontal = 16.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        itemsIndexed(uiState.localTracks, key = { _, item -> item.id }) { index, localTrack ->
                            val track = localTracks[index]
                            var showMenu by remember { mutableStateOf(false) }
                            TrackItem(
                                track = track,
                                onClick = { onPlayLocal(localTrack) },
                                subtitle = localTrack.filePath?.let {
                                    val segments = it.split("/")
                                    if (segments.size >= 2) segments[segments.size - 2] else null
                                },
                                trailing = {
                                    Row {
                                        IconButton(onClick = { onPlayLocal(localTrack) }) {
                                            Icon(Icons.Default.PlayArrow, "Play", tint = MaterialTheme.colorScheme.primary)
                                        }
                                        Box {
                                            IconButton(onClick = { showMenu = true }) {
                                                Icon(Icons.Default.MoreVert, "More", tint = MaterialTheme.colorScheme.onSurfaceVariant)
                                            }
                                            DropdownMenu(expanded = showMenu, onDismissRequest = { showMenu = false }) {
                                                DropdownMenuItem(
                                                    text = { Text("Add to Playlist") },
                                                    onClick = {
                                                        showMenu = false
                                                        onAddToPlaylist(track, localTrack.filePath)
                                                    }
                                                )
                                            }
                                        }
                                    }
                                }
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun DownloadedTab(
    downloadedTracks: List<DownloadEntity>,
    onPlay: (DownloadEntity) -> Unit,
    onAddToPlaylist: (Track, String?) -> Unit = { _, _ -> }
) {
    Column(modifier = Modifier.fillMaxSize()) {
        Spacer(Modifier.height(8.dp))

        if (downloadedTracks.isEmpty()) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(
                        Icons.Default.FileDownload, null,
                        modifier = Modifier.size(64.dp),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.4f)
                    )
                    Spacer(Modifier.height(16.dp))
                    Text(
                        text = "No downloads yet",
                        style = MaterialTheme.typography.titleMedium,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Spacer(Modifier.height(8.dp))
                    Text(
                        text = "Search for music and download it",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        } else {
            val downloadTracks = remember(downloadedTracks) {
                downloadedTracks.map { download ->
                    Track(
                        id = download.trackId,
                        title = download.title,
                        artist = download.artist,
                        album = download.album,
                        durationMs = download.durationMs,
                        artworkUrl = download.artworkUrl,
                        source = download.source
                    )
                }
            }
            LazyColumn(
                modifier = Modifier.padding(horizontal = 16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                item {
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "${downloadedTracks.size} downloaded",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
                itemsIndexed(downloadedTracks, key = { _, item -> item.trackId }) { index, download ->
                    val track = downloadTracks[index]
                    var showMenu by remember { mutableStateOf(false) }
                    TrackItem(
                        track = track,
                        onClick = { onPlay(download) },
                        subtitle = if (download.completedAt != null) {
                            "Downloaded ${formatTimestamp(download.completedAt)}"
                        } else null,
                        trailing = {
                            Row {
                                IconButton(onClick = { onPlay(download) }) {
                                    Icon(Icons.Default.PlayArrow, "Play", tint = MaterialTheme.colorScheme.primary)
                                }
                                Box {
                                    IconButton(onClick = { showMenu = true }) {
                                        Icon(Icons.Default.MoreVert, "More", tint = MaterialTheme.colorScheme.onSurfaceVariant)
                                    }
                                    DropdownMenu(expanded = showMenu, onDismissRequest = { showMenu = false }) {
                                        DropdownMenuItem(
                                            text = { Text("Add to Playlist") },
                                            onClick = {
                                                showMenu = false
                                                onAddToPlaylist(track, download.filePath)
                                            }
                                        )
                                    }
                                }
                            }
                        }
                    )
                }
            }
        }
    }
}

private fun formatTimestamp(millis: Long): String {
    val diff = System.currentTimeMillis() - millis
    val days = diff / (24 * 60 * 60 * 1000)
    return when {
        days < 1 -> "Today"
        days < 2 -> "Yesterday"
        days < 7 -> "$days days ago"
        days < 30 -> "${days / 7} weeks ago"
        else -> "${days / 30} months ago"
    }
}
