package com.sinc.enhanced.ui.screens.album

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.OpenInNew
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import coil.compose.rememberAsyncImagePainter
import coil.request.ImageRequest
import com.sinc.enhanced.data.model.Album
import com.sinc.enhanced.data.model.Track
import com.sinc.enhanced.ui.components.TrackItem

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AlbumDetailScreen(
    albumId: String,
    onPlayTrack: (Track, String) -> Unit,
    onDownloadTrack: (Track, String) -> Unit,
    onNavigateBack: () -> Unit,
    viewModel: AlbumDetailViewModel = viewModel(factory = AlbumDetailViewModel.Factory(albumId))
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(uiState.album?.name ?: "Album") },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back")
                    }
                }
            )
        }
    ) { padding ->
        when {
            uiState.isLoading -> {
                Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            }
            uiState.error != null -> {
                Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(uiState.error ?: "Error", color = MaterialTheme.colorScheme.error)
                        Spacer(Modifier.height(8.dp))
                        TextButton(onClick = onNavigateBack) { Text("Go Back") }
                    }
                }
            }
            else -> {
                val album = uiState.album
                val tracks = uiState.tracks
                val playable = tracks.mapNotNull { track ->
                    val url = uiState.resolvedAudioUrls[track.id] ?: track.previewUrl
                    if (url != null) track to url else null
                }
                LazyColumn(
                    modifier = Modifier.fillMaxSize().padding(padding).padding(horizontal = 16.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    if (album != null) {
                        item {
                            AlbumHeader(
                                album = album,
                                playable = playable,
                                onDownloadTrack = onDownloadTrack
                            )
                        }
                    }

                    if (tracks.isNotEmpty()) {
                        item {
                            Text(
                                text = "Tracks",
                                style = MaterialTheme.typography.titleLarge,
                                modifier = Modifier.padding(vertical = 8.dp)
                            )
                        }
                        items(tracks, key = { it.id }) { track ->
                            TrackItem(
                                track = track,
                                onClick = {
                                    val url = uiState.resolvedAudioUrls[track.id] ?: track.previewUrl
                                    if (url != null) onPlayTrack(track, url)
                                },
                                trailing = {
                                    AlbumTrackActions(
                                        track = track,
                                        resolvedUrl = uiState.resolvedAudioUrls[track.id],
                                        onPlayTrack = onPlayTrack,
                                        onDownloadTrack = onDownloadTrack
                                    )
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
private fun AlbumHeader(
    album: Album,
    playable: List<Pair<Track, String>>,
    onDownloadTrack: (Track, String) -> Unit
) {
    Column(
        modifier = Modifier.fillMaxWidth().padding(vertical = 16.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        if (album.artworkUrl != null) {
            Image(
                painter = rememberAsyncImagePainter(
                    ImageRequest.Builder(LocalContext.current)
                        .data(album.artworkUrl)
                        .size(400)
                        .crossfade(true)
                        .build()
                ),
                contentDescription = null,
                modifier = Modifier.size(200.dp).clip(RoundedCornerShape(16.dp)),
                contentScale = ContentScale.Crop
            )
        } else {
            Surface(
                modifier = Modifier.size(200.dp),
                shape = RoundedCornerShape(16.dp),
                color = MaterialTheme.colorScheme.surfaceVariant
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Icon(Icons.Default.OpenInNew, null, modifier = Modifier.size(80.dp))
                }
            }
        }
        Spacer(Modifier.height(16.dp))
        Text(
            text = album.name,
            style = MaterialTheme.typography.headlineMedium,
            textAlign = TextAlign.Center
        )
        Text(
            text = album.artist,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(top = 4.dp)
        )
        Text(
            text = "${album.totalTracks} tracks \u2022 ${album.releaseYear ?: "Unknown year"}",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f),
            modifier = Modifier.padding(top = 2.dp)
        )
        Spacer(Modifier.height(12.dp))
        OutlinedButton(
            onClick = { playable.forEach { (track, url) -> onDownloadTrack(track, url) } },
            enabled = playable.isNotEmpty()
        ) {
            Icon(Icons.Default.Download, null, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(4.dp))
            Text("Download All")
        }
    }
}

@Composable
private fun AlbumTrackActions(
    track: Track,
    resolvedUrl: String?,
    onPlayTrack: (Track, String) -> Unit,
    onDownloadTrack: (Track, String) -> Unit
) {
    if (resolvedUrl != null || track.previewUrl != null) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(
                onClick = {
                    val url = resolvedUrl ?: track.previewUrl
                    if (url != null) onPlayTrack(track, url)
                }
            ) {
                Icon(Icons.Default.PlayArrow, "Play", tint = MaterialTheme.colorScheme.primary)
            }
            IconButton(
                onClick = {
                    val url = resolvedUrl ?: track.previewUrl
                    if (url != null) onDownloadTrack(track, url)
                }
            ) {
                Icon(Icons.Default.Download, "Download", tint = MaterialTheme.colorScheme.primary)
            }
        }
    }
}
