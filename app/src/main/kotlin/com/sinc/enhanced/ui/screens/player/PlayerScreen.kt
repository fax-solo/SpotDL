package com.sinc.enhanced.ui.screens.player

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.automirrored.filled.QueueMusic
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import coil.compose.rememberAsyncImagePainter
import com.sinc.enhanced.SincApp
import com.sinc.enhanced.data.model.Track
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

@Composable
fun PlayerScreen(
    onNavigateArtist: (String) -> Unit = {},
    onNavigateQueue: (() -> Unit)? = null,
    viewModel: PlayerViewModel = viewModel(factory = PlayerViewModel.Factory())
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val track = uiState.currentTrack
    val scrollState = rememberScrollState()

    Box(modifier = Modifier.fillMaxSize()) {
        if (track != null) {
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

            if (artworkUrl != null) {
                Image(
                    painter = rememberAsyncImagePainter(artworkUrl),
                    contentDescription = null,
                    modifier = Modifier.fillMaxSize(),
                    contentScale = ContentScale.Crop,
                    alpha = 0.2f
                )
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(
                            Brush.verticalGradient(
                                colors = listOf(
                                    Color.Transparent,
                                    MaterialTheme.colorScheme.background
                                ),
                                startY = 0f,
                                endY = Float.POSITIVE_INFINITY
                            )
                        )
                )
            }
        }

        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(scrollState)
                .padding(horizontal = 24.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            if (track == null) {
                Spacer(Modifier.weight(1f))
                Icon(
                    imageVector = Icons.Default.MusicNote,
                    contentDescription = null,
                    modifier = Modifier.size(72.dp),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f)
                )
                Spacer(Modifier.height(16.dp))
                Text(
                    text = "No track playing",
                    style = MaterialTheme.typography.titleLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(Modifier.height(8.dp))
                Text(
                    text = "Select a track to start playing",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f)
                )
                Spacer(Modifier.weight(1f))
                return@Column
            }

            Spacer(Modifier.height(8.dp))

            var currentArtwork by remember(track.id, track.artworkUrl) { mutableStateOf(track.artworkUrl) }
            LaunchedEffect(track.id, track.artworkUrl) {
                if (track.artworkUrl == null) {
                    withContext(Dispatchers.IO) {
                        val fallback = SincApp.instance.container.artworkClient.findArtwork(track.title, track.artist)
                        withContext(Dispatchers.Main) {
                            if (fallback != null) currentArtwork = fallback
                        }
                    }
                }
            }

            if (currentArtwork != null) {
                Card(
                    modifier = Modifier.size(280.dp),
                    shape = RoundedCornerShape(24.dp),
                    elevation = CardDefaults.cardElevation(defaultElevation = 8.dp)
                ) {
                    Image(
                        painter = rememberAsyncImagePainter(currentArtwork),
                        contentDescription = null,
                        modifier = Modifier.fillMaxSize(),
                        contentScale = ContentScale.Crop
                    )
                }
            } else {
                Card(
                    modifier = Modifier.size(280.dp),
                    shape = RoundedCornerShape(24.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
                    elevation = CardDefaults.cardElevation(defaultElevation = 8.dp)
                ) {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Icon(
                            imageVector = Icons.Default.MusicNote,
                            contentDescription = null,
                            modifier = Modifier.size(64.dp),
                            tint = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }

            Spacer(Modifier.height(24.dp))

            Text(
                text = track.title,
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                textAlign = TextAlign.Center
            )

            Spacer(Modifier.height(8.dp))

            Text(
                text = track.artist,
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.primary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )

            Spacer(Modifier.height(32.dp))

            val positionMinutes = (uiState.position / 60000).toInt()
            val positionSeconds = ((uiState.position % 60000) / 1000).toInt()
            val totalMinutes = (uiState.duration / 60000).toInt()
            val totalSeconds = ((uiState.duration % 60000) / 1000).toInt()

            Slider(
                value = if (uiState.duration > 0) uiState.position.toFloat() / uiState.duration.toFloat() else 0f,
                onValueChange = { viewModel.seekTo((it * uiState.duration).toLong()) },
                modifier = Modifier.fillMaxWidth().height(24.dp),
                colors = SliderDefaults.colors(
                    thumbColor = MaterialTheme.colorScheme.primary,
                    activeTrackColor = MaterialTheme.colorScheme.primary,
                    inactiveTrackColor = MaterialTheme.colorScheme.surfaceVariant
                )
            )

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    text = "%d:%02d".format(positionMinutes, positionSeconds),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Text(
                    text = "%d:%02d".format(totalMinutes, totalSeconds),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            Spacer(Modifier.height(24.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceEvenly,
                verticalAlignment = Alignment.CenterVertically
            ) {
                IconButton(
                    onClick = { viewModel.skipToPrevious() },
                    modifier = Modifier.size(48.dp)
                ) {
                    Icon(
                        Icons.Default.SkipPrevious, "Previous",
                        modifier = Modifier.size(28.dp),
                        tint = MaterialTheme.colorScheme.onSurface
                    )
                }

                Surface(
                    modifier = Modifier.size(72.dp),
                    shape = CircleShape,
                    color = MaterialTheme.colorScheme.primary,
                    tonalElevation = 8.dp,
                    shadowElevation = 8.dp
                ) {
                    IconButton(onClick = { viewModel.togglePlayPause() }) {
                        Icon(
                            imageVector = if (uiState.isPlaying) Icons.Default.Pause else Icons.Default.PlayArrow,
                            contentDescription = if (uiState.isPlaying) "Pause" else "Play",
                            modifier = Modifier.size(36.dp),
                            tint = MaterialTheme.colorScheme.onPrimary
                        )
                    }
                }

                IconButton(
                    onClick = { viewModel.skipToNext() },
                    modifier = Modifier.size(48.dp)
                ) {
                    Icon(
                        Icons.Default.SkipNext, "Next",
                        modifier = Modifier.size(28.dp),
                        tint = MaterialTheme.colorScheme.onSurface
                    )
                }
            }

            Spacer(Modifier.height(32.dp))

            if (uiState.isLoadingLyrics) {
                Box(Modifier.fillMaxWidth().height(100.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(modifier = Modifier.size(24.dp))
                }
            } else if (uiState.lyrics != null) {
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(16.dp),
                    color = MaterialTheme.colorScheme.surface.copy(alpha = 0.8f),
                    tonalElevation = 2.dp
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text(
                            text = "Lyrics",
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.primary
                        )
                        Spacer(Modifier.height(8.dp))
                        Text(
                            text = uiState.lyrics!!,
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.85f),
                            lineHeight = MaterialTheme.typography.bodyMedium.lineHeight
                        )
                    }
                }
            } else {
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(16.dp),
                    color = MaterialTheme.colorScheme.surface.copy(alpha = 0.5f)
                ) {
                    Box(
                        modifier = Modifier.padding(16.dp).fillMaxWidth(),
                        contentAlignment = Alignment.Center
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            @Suppress("DEPRECATION")
                            Icon(
                                Icons.Default.QueueMusic, null,
                                tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f),
                                modifier = Modifier.size(32.dp)
                            )
                            Spacer(Modifier.height(4.dp))
                            Text(
                                text = "No lyrics found",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f)
                            )
                        }
                    }
                }
            }

            Spacer(Modifier.height(32.dp))
        }
    }
}
