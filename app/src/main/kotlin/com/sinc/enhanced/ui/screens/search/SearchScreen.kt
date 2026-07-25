package com.sinc.enhanced.ui.screens.search

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.speech.RecognizerIntent
import android.util.Log
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.*
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import coil.compose.rememberAsyncImagePainter
import com.sinc.enhanced.SincApp
import com.sinc.enhanced.data.local.entity.SearchHistoryEntity
import com.sinc.enhanced.data.model.Album
import com.sinc.enhanced.data.model.Artist
import com.sinc.enhanced.data.model.Track
import com.sinc.enhanced.domain.music.SearchResult
import com.sinc.enhanced.ui.components.SearchBar
import com.sinc.enhanced.ui.components.TrackItem

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SearchScreen(
    initialQuery: String = "",
    onPlayTrack: (Track, String) -> Unit,
    onDownloadTrack: (Track, String) -> Unit,
    onNavigateArtist: (String) -> Unit = {},
    onNavigateTrack: (String) -> Unit = {},
    onNavigateSettings: () -> Unit = {},
    onNavigateHistory: () -> Unit = {},
    onRetryPlayback: ((Track) -> Unit)? = null,
    onPreview: ((Track, String) -> Unit)? = null,
    viewModel: SearchViewModel = viewModel(factory = SearchViewModel.Factory()),
    historyViewModel: SearchHistoryViewModel = viewModel(factory = SearchHistoryViewModel.Factory(SincApp.instance.container.database.searchHistoryDao()))
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val searchHistory by historyViewModel.searchHistory.collectAsStateWithLifecycle()
    val listState = rememberLazyListState()

    val shouldLoadMore by remember {
        derivedStateOf {
            val layoutInfo = listState.layoutInfo
            if (layoutInfo.totalItemsCount == 0) return@derivedStateOf false
            val lastVisible = layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: return@derivedStateOf false
            lastVisible >= layoutInfo.totalItemsCount - 3
        }
    }
    LaunchedEffect(shouldLoadMore) {
        if (shouldLoadMore) viewModel.loadMore()
    }

    val spotifyResults = remember(uiState.results) {
        uiState.results.filter { it.track.source == "spotify" }
    }
    val nonSpotifyResults = remember(uiState.results) {
        uiState.results.filter { it.track.source != "spotify" }
    }

    Column(
        modifier = Modifier.fillMaxSize().padding(16.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            Icons.Default.Search, "Search icon",
                            tint = MaterialTheme.colorScheme.onBackground,
                            modifier = Modifier.size(28.dp)
                        )
                        Spacer(Modifier.width(8.dp))
                        Text(
                            text = "Search",
                            style = MaterialTheme.typography.headlineLarge,
                            color = MaterialTheme.colorScheme.onBackground,
                            modifier = Modifier.semantics { contentDescription = "Search page title" }
                        )
            }
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

        val context = LocalContext.current
        val voiceSearchLauncher = rememberLauncherForActivityResult(
            contract = ActivityResultContracts.StartActivityForResult()
        ) { result ->
            val data = result.data
            if (result.resultCode == Activity.RESULT_OK && data != null) {
                val matches = data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)
                if (!matches.isNullOrEmpty()) {
                    viewModel.onSearch(matches[0] ?: return@rememberLauncherForActivityResult)
                }
            }
        }
        SearchBar(
            query = uiState.query,
            onQueryChange = viewModel::onQueryChange,
            onSearch = { viewModel.onSearch(uiState.query) },
            onVoiceSearch = {
                val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                    putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                    putExtra(RecognizerIntent.EXTRA_PROMPT, "Search for music")
                }
                try {
                    voiceSearchLauncher.launch(intent)
                } catch (e: ActivityNotFoundException) {
                    Log.e("SearchScreen", "Voice search not available", e)
                    Toast.makeText(context, "Voice search is not available on this device", Toast.LENGTH_SHORT).show()
                }
            }
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
                        Icon(
                            Icons.Default.ErrorOutline, null,
                            modifier = Modifier.size(48.dp),
                            tint = MaterialTheme.colorScheme.error
                        )
                        Spacer(Modifier.height(12.dp))
                        Text(
                            text = uiState.error ?: "Error",
                            color = MaterialTheme.colorScheme.error,
                            style = MaterialTheme.typography.bodyLarge
                        )
                        Spacer(Modifier.height(12.dp))
                        Button(onClick = { viewModel.onSearch(uiState.query) }) {
                            Text("Retry")
                        }
                    }
                }
            }
            uiState.query.isBlank() -> {
                renderEmptyState(searchHistory, historyViewModel, viewModel)
            }
            else -> {
                renderResults(uiState, spotifyResults, nonSpotifyResults, listState, onPlayTrack, onDownloadTrack, onNavigateTrack, onNavigateArtist, viewModel, onPreview)
            }
        }
    }
}

@Composable
private fun renderEmptyState(
    searchHistory: List<SearchHistoryEntity>,
    historyViewModel: SearchHistoryViewModel,
    viewModel: SearchViewModel
) {
    val searchHistoryList = searchHistory.take(10)
    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center
    ) {
        if (searchHistoryList.isNotEmpty()) {
            LazyColumn(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(horizontal = 16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                item {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "Recent searches",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                        TextButton(onClick = { historyViewModel.clearHistory() }) {
                            Text("Clear all")
                        }
                    }
                }
                items(searchHistoryList) { entry ->
                    SearchHistoryItem(
                        entry = entry,
                        onClick = { viewModel.onSearch(entry.query) }
                    )
                }
                item {
                    Spacer(Modifier.height(16.dp))
                    Text(
                        text = "Trending",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                }
                items(
                    listOf(
                        "Top 50 Global",
                        "Viral 50",
                        "New Music Friday",
                        "Discover Weekly",
                        "Release Radar"
                    )
                ) { trending ->
                    TrendingItem(
                        title = trending,
                        onClick = { viewModel.onSearch(trending) }
                    )
                }
            }
        } else {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Icon(
                    Icons.Default.Search, null,
                    modifier = Modifier.size(72.dp),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.3f)
                )
                Spacer(Modifier.height(16.dp))
                Text(
                    text = "Search for music",
                    style = MaterialTheme.typography.titleLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(Modifier.height(8.dp))
                Text(
                    text = "Find by artist, album, or song name",
                    color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f),
                    style = MaterialTheme.typography.bodyMedium
                )
            }
        }
    }
}

@Composable
private fun renderResults(
    uiState: SearchUiState,
    spotifyResults: List<SearchResult>,
    nonSpotifyResults: List<SearchResult>,
    listState: LazyListState,
    onPlayTrack: (Track, String) -> Unit,
    onDownloadTrack: (Track, String) -> Unit,
    onNavigateTrack: (String) -> Unit,
    onNavigateArtist: (String) -> Unit,
    viewModel: SearchViewModel,
    onPreview: ((Track, String) -> Unit)? = null
) {
    LazyColumn(
        state = listState,
        modifier = Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        if (uiState.topResult != null) {
            item(key = "top_result") {
                TopResultCard(
                    result = uiState.topResult!!,
                    resolvedUrl = uiState.resolvedAudioUrls[uiState.topResult!!.track.id]?.first,
                    onPlay = {
                        val url = uiState.resolvedAudioUrls[uiState.topResult!!.track.id]?.first
                            ?: uiState.topResult!!.audioUrl
                        if (url != null) onPlayTrack(uiState.topResult!!.track, url)
                    },
                    onDownload = {
                        val url = uiState.resolvedAudioUrls[uiState.topResult!!.track.id]?.first
                            ?: uiState.topResult!!.audioUrl
                        if (url != null) onDownloadTrack(uiState.topResult!!.track, url)
                    }
                )
            }
            item { Spacer(Modifier.height(8.dp)) }
        }

        if (uiState.artists.isNotEmpty()) {
            item(key = "artists_header") { SectionLabel("Artists") }
            item(key = "artists_row") {
                LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    items(uiState.artists, key = { it.id }) { artist ->
                        ArtistCard(
                            artist = artist,
                            onClick = { onNavigateArtist(artist.id) }
                        )
                    }
                }
            }
            item(key = "artists_spacer") { Spacer(Modifier.height(8.dp)) }
        }

        if (uiState.albums.isNotEmpty()) {
            item(key = "albums_header") { SectionLabel("Albums") }
            items(uiState.albums, key = { "album_${it.id}" }) { album ->
                AlbumInlineItem(
                    album = album,
                    isExpanded = uiState.expandedAlbum?.id == album.id,
                    tracks = if (uiState.expandedAlbum?.id == album.id) uiState.albumTracks else emptyList(),
                    audioUrls = if (uiState.expandedAlbum?.id == album.id) uiState.albumAudioUrls else emptyMap(),
                    onClick = { viewModel.selectAlbum(album) },
                    onPlayTrack = { track, url -> onPlayTrack(track, url) },
                    onDownloadTrack = { track, url -> onDownloadTrack(track, url) },
                    onNavigateTrack = { trackId -> onNavigateTrack(trackId) }
                )
            }
            item(key = "albums_spacer") { Spacer(Modifier.height(8.dp)) }
        }

        if (spotifyResults.isNotEmpty()) {
            item(key = "spotify_header") {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = "Spotify",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Spacer(Modifier.width(8.dp))
                    SourceBadge("spotify")
                }
            }
            items(spotifyResults.take(uiState.results.size), key = { it.track.id }) { enriched ->
                val resolvedUrl = uiState.resolvedAudioUrls[enriched.track.id]?.first
                val displayUrl = enriched.audioUrl ?: resolvedUrl
                TrackItem(
                    track = enriched.track,
                    onClick = { onNavigateTrack(enriched.track.id) },
                    onPreview = if (displayUrl != null && onPreview != null) { { onPreview(enriched.track, displayUrl) } } else null,
                    trailing = {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            SourceBadge(enriched.track.source)
                            Spacer(Modifier.width(4.dp))
                            if (displayUrl != null) {
                                IconButton(onClick = { onPlayTrack(enriched.track, displayUrl) }) {
                                    Icon(Icons.Default.PlayArrow, "Play", tint = MaterialTheme.colorScheme.primary)
                                }
                                IconButton(onClick = { onDownloadTrack(enriched.track, displayUrl) }) {
                                    Icon(Icons.Default.Download, "Download", tint = MaterialTheme.colorScheme.primary)
                                }
                            } else {
                                CircularProgressIndicator(
                                    modifier = Modifier.size(20.dp).padding(2.dp),
                                    strokeWidth = 2.dp,
                                    color = MaterialTheme.colorScheme.primary
                                )
                            }
                        }
                    }
                )
            }
        }

        if (nonSpotifyResults.isNotEmpty()) {
            item(key = "non_spotify_header") {
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 8.dp)) {
                    Text(
                        text = "More Results",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Spacer(Modifier.width(8.dp))
                    nonSpotifyResults.map { it.track.source }.distinct().forEach { source ->
                        SourceBadge(source)
                        Spacer(Modifier.width(4.dp))
                    }
                }
            }
            val nonSpotifyVisible = nonSpotifyResults.take(
                maxOf(0, uiState.results.size - spotifyResults.size)
            )
            items(nonSpotifyVisible, key = { it.track.id }) { enriched ->
                val resolvedUrl = uiState.resolvedAudioUrls[enriched.track.id]?.first
                val displayUrl = enriched.audioUrl ?: resolvedUrl
                TrackItem(
                    track = enriched.track,
                    subtitle = enriched.track.artist,
                    onClick = { onNavigateTrack(enriched.track.id) },
                    trailing = {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            SourceBadge(enriched.track.source)
                            Spacer(Modifier.width(4.dp))
                            if (displayUrl != null) {
                                IconButton(onClick = { onPlayTrack(enriched.track, displayUrl) }) {
                                    Icon(Icons.Default.PlayArrow, "Play", tint = MaterialTheme.colorScheme.primary)
                                }
                                IconButton(onClick = { onDownloadTrack(enriched.track, displayUrl) }) {
                                    Icon(Icons.Default.Download, "Download", tint = MaterialTheme.colorScheme.primary)
                                }
                            } else {
                                CircularProgressIndicator(
                                    modifier = Modifier.size(20.dp).padding(2.dp),
                                    strokeWidth = 2.dp,
                                    color = MaterialTheme.colorScheme.primary
                                )
                            }
                        }
                    }
                )
            }
        }

        if (uiState.hasMore) {
            item(key = "load_more") {
                Box(
                    modifier = Modifier.fillMaxWidth().padding(16.dp),
                    contentAlignment = Alignment.Center
                ) {
                    if (uiState.isLoadingMore) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(24.dp),
                            strokeWidth = 2.dp
                        )
                    }
                }
            }
        }

        if (uiState.results.isEmpty() && uiState.albums.isEmpty() && uiState.query.isNotBlank()) {
            item(key = "empty") {
                Box(
                    modifier = Modifier.fillMaxWidth().padding(top = 48.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(
                            Icons.Default.SearchOff, null,
                            modifier = Modifier.size(64.dp),
                            tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f)
                        )
                        Spacer(Modifier.height(12.dp))
                        Text(
                            text = "No results found",
                            style = MaterialTheme.typography.titleMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Spacer(Modifier.height(4.dp))
                        Text(
                            text = "Try a different search term",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f)
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun SourceBadge(source: String, modifier: Modifier = Modifier) {
    val (label, color) = when (source.lowercase()) {
        "spotify" -> "Spotify" to Color(0xFF1DB954)
        "youtube" -> "YouTube" to Color(0xFFFF0000)
        "deezer" -> "Deezer" to Color(0xFFFF00FF)
        "soundcloud" -> "SC" to Color(0xFFFF5500)
        "audius" -> "Audius" to Color(0xFF6C5CE7)
        "jamendo" -> "Jamendo" to Color(0xFF00B894)
        "fma" -> "FMA" to Color(0xFFE17055)
        "bandcamp" -> "BC" to Color(0xFF636E72)
        else -> source.replaceFirstChar { if (it.isLowerCase()) it.titlecase() else it.toString() } to MaterialTheme.colorScheme.primary
    }
    Surface(
        modifier = modifier,
        color = color.copy(alpha = 0.15f),
        shape = RoundedCornerShape(4.dp),
        border = androidx.compose.foundation.BorderStroke(1.dp, color.copy(alpha = 0.5f))
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            color = color,
            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
            fontWeight = FontWeight.Bold,
            fontSize = 10.sp
        )
    }
}

@Composable
private fun TopResultCard(
    result: SearchResult,
    resolvedUrl: String?,
    onPlay: () -> Unit,
    onDownload: () -> Unit
) {
    val track = result.track
    val displayUrl = track.previewUrl ?: resolvedUrl
    val bgColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.15f)
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onPlay),
        color = MaterialTheme.colorScheme.surface,
        shape = RoundedCornerShape(16.dp),
        tonalElevation = 4.dp,
        border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.primary.copy(alpha = 0.3f))
    ) {
        Row(
            modifier = Modifier
                .padding(12.dp)
                .fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            if (track.artworkUrl != null) {
                Image(
                    painter = rememberAsyncImagePainter(track.artworkUrl!!),
                    contentDescription = null,
                    modifier = Modifier
                        .size(64.dp)
                        .clip(RoundedCornerShape(10.dp)),
                    contentScale = ContentScale.Crop
                )
            } else {
                Box(
                    modifier = Modifier
                        .size(64.dp)
                        .clip(RoundedCornerShape(10.dp))
                        .background(bgColor),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(Icons.Default.MusicNote, null, modifier = Modifier.size(28.dp), tint = MaterialTheme.colorScheme.primary)
                }
            }

            Spacer(Modifier.width(12.dp))

            Column(modifier = Modifier.weight(1f)) {
                Row {
                    Text(
                        text = "Top Result",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.primary,
                        fontWeight = FontWeight.Bold
                    )
                    Spacer(Modifier.width(8.dp))
                    SourceBadge(track.source)
                    if (track.isrc != null) {
                        Spacer(Modifier.width(8.dp))
                        Badge(text = "ISRC")
                    }
                }
                Spacer(Modifier.height(4.dp))
                Text(
                    text = track.title,
                    style = MaterialTheme.typography.headlineSmall,
                    color = MaterialTheme.colorScheme.onSurface,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Spacer(Modifier.height(2.dp))
                Text(
                    text = track.artist,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Spacer(Modifier.height(4.dp))
                Row {
                    Text(
                        text = track.album,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f, fill = false)
                    )
                    if (track.durationMs > 0) {
                        Spacer(Modifier.width(8.dp))
                        Text(
                            text = track.durationFormatted,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }

            Row {
                if (displayUrl != null) {
                    IconButton(onClick = onPlay) {
                        Icon(
                            Icons.Default.PlayArrow,
                            contentDescription = "Play",
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(28.dp)
                        )
                    }
                    IconButton(onClick = onDownload) {
                        Icon(
                            Icons.Default.Download,
                            contentDescription = "Download",
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(28.dp)
                        )
                    }
                } else {
                    CircularProgressIndicator(
                        modifier = Modifier.size(24.dp).padding(2.dp),
                        strokeWidth = 3.dp,
                        color = MaterialTheme.colorScheme.primary
                    )
                }
            }
        }
    }
}

@Composable
private fun Badge(text: String) {
    Surface(
        color = MaterialTheme.colorScheme.primaryContainer,
        shape = RoundedCornerShape(4.dp)
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onPrimaryContainer,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
        )
    }
}

@Composable
private fun AlbumInlineItem(
    album: Album,
    isExpanded: Boolean,
    tracks: List<Track>,
    audioUrls: Map<String, String>,
    onClick: () -> Unit,
    onPlayTrack: (Track, String) -> Unit,
    onDownloadTrack: (Track, String) -> Unit,
    onNavigateTrack: (String) -> Unit
) {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .animateContentSize(),
        color = MaterialTheme.colorScheme.surface,
        shape = RoundedCornerShape(14.dp),
        tonalElevation = 2.dp
    ) {
        Column {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                if (album.artworkUrl != null) {
                    Image(
                        painter = rememberAsyncImagePainter(album.artworkUrl!!),
                        contentDescription = null,
                        modifier = Modifier
                            .size(56.dp)
                            .clip(RoundedCornerShape(10.dp)),
                        contentScale = ContentScale.Crop
                    )
                } else {
                    Box(
                        modifier = Modifier
                            .size(56.dp)
                            .clip(RoundedCornerShape(10.dp))
                            .background(MaterialTheme.colorScheme.surfaceVariant),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(Icons.Default.Album, null, modifier = Modifier.size(24.dp))
                    }
                }

                Spacer(Modifier.width(12.dp))

                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = album.name,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    Text(
                        text = album.artist,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    Text(
                        text = "${album.totalTracks} tracks \u2022 ${album.releaseYear ?: "Unknown"}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f)
                    )
                }

                Icon(
                    imageVector = if (isExpanded) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                    contentDescription = if (isExpanded) "Collapse" else "Expand",
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(24.dp)
                )
            }

            AnimatedVisibility(
                visible = isExpanded,
                enter = expandVertically(),
                exit = shrinkVertically()
            ) {
                Column(modifier = Modifier.fillMaxWidth()) {
                    tracks.forEachIndexed { index, track ->
                        val url = audioUrls[track.id] ?: track.previewUrl
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 12.dp)
                        ) {
                            if (index > 0) Divider(modifier = Modifier.padding(start = 68.dp))
                            TrackItem(
                                track = track,
                                onClick = { onNavigateTrack(track.id) },
                                trailing = {
                                    if (url != null) {
                                        Row(verticalAlignment = Alignment.CenterVertically) {
                                            IconButton(onClick = { onPlayTrack(track, url) }) {
                                                Icon(Icons.Default.PlayArrow, "Play", tint = MaterialTheme.colorScheme.primary)
                                            }
                                            IconButton(onClick = { onDownloadTrack(track, url) }) {
                                                Icon(Icons.Default.Download, "Download", tint = MaterialTheme.colorScheme.primary)
                                            }
                                        }
                                    }
                                }
                            )
                        }
                    }
                    if (tracks.isNotEmpty()) {
                        Button(
                            onClick = {
                                tracks.forEach { track ->
                                    val url = audioUrls[track.id] ?: track.previewUrl
                                    if (url != null) onDownloadTrack(track, url)
                                }
                            },
                            modifier = Modifier.padding(12.dp).fillMaxWidth(),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = MaterialTheme.colorScheme.primaryContainer,
                                contentColor = MaterialTheme.colorScheme.onPrimaryContainer
                            )
                        ) {
                            Icon(Icons.Default.Download, null, modifier = Modifier.size(18.dp))
                            Spacer(Modifier.width(4.dp))
                            Text("Download All (${tracks.size})")
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun SectionLabel(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.titleMedium,
        fontWeight = FontWeight.Bold,
        color = MaterialTheme.colorScheme.onSurface,
        modifier = Modifier.padding(vertical = 8.dp)
    )
}

@Composable
private fun SearchHistoryItem(
    entry: SearchHistoryEntity,
    onClick: () -> Unit
) {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 8.dp, horizontal = 12.dp)
            .clickable(onClick = onClick),
        color = MaterialTheme.colorScheme.surfaceVariant,
        shape = RoundedCornerShape(12.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    Icons.Default.History, null,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(20.dp)
                )
                Spacer(Modifier.width(12.dp))
                Text(
                    text = entry.query,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
            Icon(
                Icons.Default.ArrowRight, null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(20.dp)
            )
        }
    }
}

@Composable
private fun TrendingItem(
    title: String,
    onClick: () -> Unit
) {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 8.dp, horizontal = 12.dp)
            .clickable(onClick = onClick),
        color = MaterialTheme.colorScheme.surfaceVariant,
        shape = RoundedCornerShape(12.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    Icons.Default.TrendingUp, null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(20.dp)
                )
                Spacer(Modifier.width(12.dp))
                Text(
                    text = title,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
            Icon(
                Icons.Default.ArrowRight, null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(20.dp)
            )
        }
    }
}

@Composable
private fun ArtistCard(artist: Artist, onClick: () -> Unit) {
    Surface(
        modifier = Modifier.width(160.dp).clickable(onClick = onClick),
        shape = RoundedCornerShape(16.dp),
        color = MaterialTheme.colorScheme.surfaceVariant,
        tonalElevation = 2.dp
    ) {
        Column(modifier = Modifier.padding(12.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            if (artist.imageUrl != null) {
                Image(
                    painter = rememberAsyncImagePainter(artist.imageUrl!!),
                    contentDescription = null,
                    modifier = Modifier.size(120.dp).clip(CircleShape),
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
                fontWeight = FontWeight.SemiBold,
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