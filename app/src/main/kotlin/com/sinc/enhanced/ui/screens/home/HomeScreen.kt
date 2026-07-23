package com.sinc.enhanced.ui.screens.home

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.MusicNote
import androidx.compose.material.icons.filled.Search
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
import kotlinx.coroutines.launch

@Composable
fun HomeScreen(
    onSearch: () -> Unit,
    onSearchQuery: (String) -> Unit = {},
    onNavigateSettings: () -> Unit = {},
    onNavigateHistory: () -> Unit = {},
    onPlayTrack: (Track, String) -> Unit = { _, _ -> },
    viewModel: HomeViewModel = viewModel(factory = HomeViewModel.Factory())
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()

    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Home",
                    style = MaterialTheme.typography.headlineLarge,
                    color = MaterialTheme.colorScheme.onBackground
                )
                Row {
                    IconButton(onClick = onNavigateHistory) {
                        Icon(Icons.Default.History, "History")
                    }
                }
            }
        }

        item {
            OutlinedTextField(
                value = "",
                onValueChange = {},
                placeholder = { Text("Search for music...") },
                modifier = Modifier.fillMaxWidth().clickable { onSearch() },
                shape = RoundedCornerShape(16.dp),
                readOnly = true,
                enabled = false,
                colors = OutlinedTextFieldDefaults.colors(
                    disabledBorderColor = MaterialTheme.colorScheme.outline,
                    disabledContainerColor = MaterialTheme.colorScheme.surface,
                    disabledTextColor = MaterialTheme.colorScheme.onSurfaceVariant,
                    disabledPlaceholderColor = MaterialTheme.colorScheme.onSurfaceVariant,
                    disabledTrailingIconColor = MaterialTheme.colorScheme.onSurfaceVariant,
                    disabledLeadingIconColor = MaterialTheme.colorScheme.onSurfaceVariant
                ),
                leadingIcon = { Icon(Icons.Default.Search, "Search") },
                singleLine = true
            )
        }

        item { Spacer(Modifier.height(8.dp)) }

        if (uiState.isLoading) {
            item {
                Box(Modifier.fillMaxWidth().height(200.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            }
        } else if (uiState.error != null) {
            item {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer)
                ) {
                    Column(modifier = Modifier.padding(16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(
                            text = uiState.error!!,
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onErrorContainer
                        )
                        Spacer(Modifier.height(12.dp))
                        Button(onClick = { viewModel.refresh() }) {
                            Text("Retry")
                        }
                    }
                }
            }
        } else {
            if (uiState.recentlyPlayed.isNotEmpty()) {
                item {
                    SectionHeader("Recently Played")
                }
                item {
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        items(uiState.recentlyPlayed, key = { it.id }) { track ->
                            TrackCard(track = track, onClick = {
                                scope.launch {
                                    val audio = viewModel.resolveAudioUrl(track)
                                    if (audio != null) onPlayTrack(track, audio.first)
                                }
                            })
                        }
                    }
                }
                item { Spacer(Modifier.height(8.dp)) }
            }

            if (uiState.recentlyDownloaded.isNotEmpty()) {
                item {
                    SectionHeader("Recently Downloaded")
                }
                item {
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        items(uiState.recentlyDownloaded, key = { it.trackId }) { download ->
                            DownloadedCard(
                                download = download,
                                onClick = {
                                    trackFromDownload(download)?.let { track ->
                                        download.filePath?.let { onPlayTrack(track, it) }
                                    }
                                }
                            )
                        }
                    }
                }
                item { Spacer(Modifier.height(8.dp)) }
            }

            if (uiState.recentSearches.isNotEmpty()) {
                item {
                    SectionHeader("Recent Searches")
                }
                items(uiState.recentSearches, key = { it }) { query ->
                    Surface(
                        modifier = Modifier.fillMaxWidth().clickable { onSearchQuery(query) },
                        shape = RoundedCornerShape(12.dp),
                        color = MaterialTheme.colorScheme.surfaceVariant
                    ) {
                        Row(
                            modifier = Modifier.padding(12.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(
                                Icons.Default.History, null,
                                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.size(20.dp)
                            )
                            Spacer(Modifier.width(12.dp))
                            Text(
                                text = query,
                                style = MaterialTheme.typography.bodyMedium,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                        }
                    }
                }
            }

            if (uiState.recommendations.isNotEmpty()) {
                item {
                    Spacer(Modifier.height(16.dp))
                    SectionHeader("You Might Also Like")
                }
                item {
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        items(uiState.recommendations, key = { it.id }) { track ->
                            RecommenderCard(track = track, onClick = {
                                scope.launch {
                                    val audio = viewModel.resolveAudioUrl(track)
                                    if (audio != null) onPlayTrack(track, audio.first)
                                }
                            })
                        }
                    }
                }
                item { Spacer(Modifier.height(8.dp)) }
            }

            if (uiState.recentSearches.isEmpty() && uiState.recommendations.isEmpty()
                && uiState.recentlyPlayed.isEmpty() && uiState.recentlyDownloaded.isEmpty()) {
                item {
                    Box(
                        modifier = Modifier.fillMaxWidth().padding(top = 64.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text(
                                text = "Welcome!",
                                style = MaterialTheme.typography.titleLarge,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            Spacer(Modifier.height(8.dp))
                            Text(
                                text = "Search for music to get started",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun SectionHeader(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.titleMedium,
        fontWeight = FontWeight.Bold,
        color = MaterialTheme.colorScheme.onSurface
    )
}

@Composable
private fun TrackCard(track: Track, onClick: () -> Unit) {
    Surface(
        modifier = Modifier.width(150.dp).clickable(onClick = onClick),
        shape = RoundedCornerShape(12.dp),
        color = MaterialTheme.colorScheme.surfaceVariant
    ) {
        Column(modifier = Modifier.padding(8.dp)) {
            if (track.artworkUrl != null) {
                androidx.compose.foundation.Image(
                    painter = rememberAsyncImagePainter(track.artworkUrl),
                    contentDescription = null,
                    modifier = Modifier.size(134.dp).clip(RoundedCornerShape(8.dp)),
                    contentScale = ContentScale.Crop
                )
            } else {
                Box(
                    modifier = Modifier.size(134.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(Icons.Default.MusicNote, null, modifier = Modifier.size(48.dp))
                }
            }
            Spacer(Modifier.height(4.dp))
            Text(
                text = track.title,
                style = MaterialTheme.typography.bodyMedium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Text(
                text = track.artist,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
    }
}

@Composable
private fun DownloadedCard(download: DownloadEntity, onClick: () -> Unit) {
    Surface(
        modifier = Modifier.width(150.dp).clickable(onClick = onClick),
        shape = RoundedCornerShape(12.dp),
        color = MaterialTheme.colorScheme.surfaceVariant
    ) {
        Column(modifier = Modifier.padding(8.dp)) {
            if (download.artworkUrl != null) {
                androidx.compose.foundation.Image(
                    painter = rememberAsyncImagePainter(download.artworkUrl),
                    contentDescription = null,
                    modifier = Modifier.size(134.dp).clip(RoundedCornerShape(8.dp)),
                    contentScale = ContentScale.Crop
                )
            } else {
                Box(
                    modifier = Modifier.size(134.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(Icons.Default.MusicNote, null, modifier = Modifier.size(48.dp))
                }
            }
            Spacer(Modifier.height(4.dp))
            Text(
                text = download.title,
                style = MaterialTheme.typography.bodyMedium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Text(
                text = download.artist,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
    }
}

@Composable
private fun RecommenderCard(track: Track, onClick: () -> Unit) {
    Surface(
        modifier = Modifier.width(160.dp).clickable(onClick = onClick),
        shape = RoundedCornerShape(12.dp),
        color = MaterialTheme.colorScheme.surfaceVariant
    ) {
        Column(modifier = Modifier.padding(8.dp)) {
            if (track.artworkUrl != null) {
                androidx.compose.foundation.Image(
                    painter = rememberAsyncImagePainter(track.artworkUrl),
                    contentDescription = null,
                    modifier = Modifier
                        .width(144.dp)
                        .height(144.dp)
                        .clip(RoundedCornerShape(8.dp)),
                    contentScale = ContentScale.Crop
                )
            } else {
                Box(
                    modifier = Modifier.size(144.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(Icons.Default.MusicNote, null, modifier = Modifier.size(48.dp))
                }
            }
            Spacer(Modifier.height(6.dp))
            Text(
                text = track.title,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Spacer(Modifier.height(2.dp))
            Text(
                text = track.artist,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Text(
                text = track.album,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
    }
}

private fun trackFromDownload(download: DownloadEntity): Track? {
    return Track(
        id = download.trackId,
        title = download.title,
        artist = download.artist,
        album = download.album,
        artworkUrl = download.artworkUrl,
        durationMs = download.durationMs,
        source = download.source,
        previewUrl = download.filePath
    )
}
