package com.sinc.enhanced.ui.screens.track

import androidx.compose.foundation.Image
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.MusicNote
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Radio
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
import com.sinc.enhanced.SincApp
import com.sinc.enhanced.data.model.Track
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TrackDetailScreen(
    trackId: String,
    onPlayTrack: (Track, String) -> Unit,
    onNavigateArtist: (String) -> Unit,
    onNavigateBack: () -> Unit,
    onTrackRadio: ((String) -> Unit)? = null,
    viewModel: TrackDetailViewModel = viewModel(factory = TrackDetailViewModel.Factory(trackId))
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(uiState.track?.title ?: "Track") },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back")
                    }
                }
            )
        }
    ) { padding ->
        if (uiState.isLoading) {
            Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
        } else if (uiState.error != null) {
            Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(uiState.error ?: "Error", color = MaterialTheme.colorScheme.error)
                    Spacer(Modifier.height(8.dp))
                    TextButton(onClick = onNavigateBack) { Text("Go Back") }
                }
            }
        } else {
            val track = uiState.track
            LazyColumn(
                modifier = Modifier.fillMaxSize().padding(padding).padding(horizontal = 16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                if (track != null) {
                    item {
                        var artworkUrl by remember(track.id, track.artworkUrl) { mutableStateOf(track.artworkUrl) }
                        LaunchedEffect(track.id, track.artworkUrl) {
                            if (track.artworkUrl == null) {
                                withContext(Dispatchers.IO) {
                                    val fallback = SincApp.instance.container.artworkClient.findArtwork(track.title, track.artist)
                                    withContext(Dispatchers.Main) {
                                        if (fallback != null) artworkUrl = fallback
                                    }
                                }
                            }
                        }
                        Column(
                            modifier = Modifier.fillMaxWidth().padding(vertical = 16.dp),
                            horizontalAlignment = Alignment.CenterHorizontally
                        ) {
                            if (artworkUrl != null) {
                                Image(
                                    painter = rememberAsyncImagePainter(artworkUrl),
                                    contentDescription = null,
                                    modifier = Modifier.size(250.dp).clip(RoundedCornerShape(24.dp)),
                                    contentScale = ContentScale.Crop
                                )
                            } else {
                                Surface(
                                    modifier = Modifier.size(250.dp),
                                    shape = RoundedCornerShape(24.dp),
                                    color = MaterialTheme.colorScheme.surfaceVariant
                                ) {
                                    Box(contentAlignment = Alignment.Center) {
                                        Icon(Icons.Default.MusicNote, null, modifier = Modifier.size(64.dp))
                                    }
                                }
                            }
                            Spacer(Modifier.height(16.dp))
                            Text(track.title, style = MaterialTheme.typography.headlineMedium, maxLines = 2, overflow = TextOverflow.Ellipsis)
                            Text(
                                text = track.artist,
                                style = MaterialTheme.typography.titleMedium,
                                color = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.clickable {
                                    uiState.artist?.let { onNavigateArtist(it.id) }
                                }
                            )
                            if (track.album.isNotEmpty()) {
                                Text(track.album, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            Text(track.durationFormatted, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Spacer(Modifier.height(8.dp))
                            val playUrl = uiState.audioUrl ?: track.previewUrl
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                if (playUrl != null) {
                                    Button(onClick = { onPlayTrack(track, playUrl) }) {
                                        Icon(Icons.Default.PlayArrow, null)
                                        Spacer(Modifier.width(8.dp))
                                        Text("Play")
                                    }
                                }
                                if (onTrackRadio != null) {
                                    OutlinedButton(onClick = { onTrackRadio("${track.title} ${track.artist}") }, shape = RoundedCornerShape(8.dp)) {
                                        Icon(Icons.Default.Radio, null, modifier = Modifier.size(16.dp))
                                        Spacer(Modifier.width(4.dp))
                                        Text("Track Radio")
                                    }
                                }
                            }
                        }
                    }

                    val artist = uiState.artist
                    if (uiState.lyrics != null) {
                        item {
                            Text("Lyrics", style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(vertical = 8.dp))
                        }
                        item {
                            Surface(
                                modifier = Modifier.fillMaxWidth(),
                                shape = RoundedCornerShape(12.dp),
                                color = MaterialTheme.colorScheme.surfaceVariant
                            ) {
                                Text(
                                    text = uiState.lyrics ?: "",
                                    modifier = Modifier.padding(16.dp),
                                    style = MaterialTheme.typography.bodyMedium
                                )
                            }
                        }
                    } else {
                        item {
                            Text(
                                text = "No lyrics found",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(vertical = 8.dp)
                            )
                        }
                    }

                    if (artist != null) {
                        item {
                            Text("Artist", style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(vertical = 8.dp))
                        }
                        item {
                            Surface(
                                modifier = Modifier.fillMaxWidth().clickable { onNavigateArtist(artist.id) },
                                shape = RoundedCornerShape(12.dp),
                                color = MaterialTheme.colorScheme.surfaceVariant
                            ) {
                                Row(
                                    modifier = Modifier.padding(16.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    if (artist.imageUrl != null) {
                                        Image(
                                            painter = rememberAsyncImagePainter(artist.imageUrl),
                                            contentDescription = null,
                                            modifier = Modifier.size(56.dp).clip(RoundedCornerShape(28.dp)),
                                            contentScale = ContentScale.Crop
                                        )
                                    } else {
                                        Icon(Icons.Default.Person, null, modifier = Modifier.size(56.dp))
                                    }
                                    Spacer(Modifier.width(12.dp))
                                    Text(artist.name, style = MaterialTheme.typography.titleMedium)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
