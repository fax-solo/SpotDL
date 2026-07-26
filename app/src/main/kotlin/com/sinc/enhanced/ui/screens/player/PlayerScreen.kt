package com.sinc.enhanced.ui.screens.player

import android.content.res.Configuration
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
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
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onKeyEvent
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import coil.compose.rememberAsyncImagePainter
import com.sinc.enhanced.SincApp
import com.sinc.enhanced.data.model.Track
import com.sinc.enhanced.ui.components.DownloadProgress

@OptIn(ExperimentalMaterial3Api::class, ExperimentalComposeUiApi::class)
@Composable
fun PlayerScreen(
    onNavigateArtist: (String) -> Unit = {},
    onNavigateQueue: (() -> Unit)? = null,
    onShareTrack: ((String, String) -> Unit)? = null,
    viewModel: PlayerViewModel = viewModel(factory = PlayerViewModel.Factory())
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val track = uiState.currentTrack
    val scrollState = rememberScrollState()

    var showSpeedDialog by remember { mutableStateOf(false) }
    var showSleepTimerDialog by remember { mutableStateOf(false) }

    val primaryColor = Color(0xFF1DB954)
    val secondaryColor = Color(0xFF10B981)

    val musicPlayer = SincApp.instance.container.musicPlayer

    val configuration = LocalConfiguration.current
    val isLandscape = configuration.orientation == Configuration.ORIENTATION_LANDSCAPE

    if (showSpeedDialog) {
        SpeedDialog(
            currentSpeed = uiState.speed,
            onSpeedSelected = { speed ->
                viewModel.setSpeed(speed)
                showSpeedDialog = false
            },
            onDismiss = { showSpeedDialog = false }
        )
    }

    if (showSleepTimerDialog) {
        SleepTimerDialog(
            currentMinutes = uiState.sleepTimerMinutes,
            onTimerSelected = { minutes ->
                viewModel.setSleepTimer(minutes)
                showSleepTimerDialog = false
            },
            onCancel = {
                viewModel.cancelSleepTimer()
                showSleepTimerDialog = false
            },
            onDismiss = { showSleepTimerDialog = false }
        )
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .onKeyEvent { event ->
                when (event.key) {
                    Key.Spacebar -> { musicPlayer.togglePlayPause(); true }
                    Key.MediaPlayPause -> { musicPlayer.togglePlayPause(); true }
                    Key.DirectionRight -> { musicPlayer.skipToNext(); true }
                    Key.DirectionLeft -> { musicPlayer.skipToPrevious(); true }
                    else -> false
                }
            }
    ) {
        if (track != null) {
            DynamicBackground(
                primaryColor = primaryColor,
                secondaryColor = secondaryColor
            )
        }

        if (track != null && track.artworkUrl != null) {
            Image(
                painter = rememberAsyncImagePainter(track.artworkUrl),
                contentDescription = "Album artwork background",
                modifier = Modifier.fillMaxSize().blur(50.dp).scale(1.2f),
                contentScale = ContentScale.Crop,
                alpha = 0.3f
            )
        }

        if (isLandscape && track != null) {
            Row(
                modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                AnimatedArtwork(
                    artworkUrl = track.artworkUrl,
                    primaryColor = primaryColor,
                    onDoubleTap = { viewModel.toggleLike() },
                    indicator = if (uiState.isLiked) Icons.Default.Favorite else null,
                    modifier = Modifier.sizeIn(maxWidth = 240.dp)
                )
                Spacer(Modifier.width(16.dp))
                Column(
                    modifier = Modifier.fillMaxWidth().verticalScroll(scrollState),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    TrackInfo(title = track.title, artist = track.artist, source = track.source, primaryColor = primaryColor)
                    Spacer(Modifier.height(16.dp))
                    ProgressBar(
                        progress = if (uiState.duration > 0) uiState.position.toFloat() / uiState.duration.toFloat() else 0f,
                        position = uiState.position, duration = uiState.duration,
                        onSeek = { viewModel.seekTo((it * uiState.duration).toLong()) },
                        primaryColor = primaryColor
                    )
                    Spacer(Modifier.height(16.dp))
                    PlaybackControls(isPlaying = uiState.isPlaying, onPlayPause = { viewModel.togglePlayPause() }, onSkipNext = { viewModel.skipToNext() }, onSkipPrevious = { viewModel.skipToPrevious() }, primaryColor = primaryColor)
                    Spacer(Modifier.height(16.dp))
                    SecondaryControls(speed = uiState.speed, sleepTimerMinutes = uiState.sleepTimerMinutes, repeatMode = uiState.repeatMode, shuffleMode = uiState.shuffleMode, onSpeedChange = { viewModel.setSpeed(it) }, onSleepTimerChange = { viewModel.setSleepTimer(it) }, onRepeatChange = { viewModel.setRepeatMode(it) }, onShuffleChange = { viewModel.setShuffleMode(it) }, onSpeedClick = { showSpeedDialog = true }, onSleepTimerClick = { showSleepTimerDialog = true }, onNavigateQueue = onNavigateQueue, onShare = if (onShareTrack != null) { { onShareTrack(track.title, track.artist) } } else null, primaryColor = primaryColor)
                }
            }
        } else {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(scrollState)
                    .padding(horizontal = 24.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                if (track == null) {
                    EmptyPlayerState()
                    return@Column
                }

                Spacer(Modifier.height(8.dp))

                AnimatedArtwork(
                    artworkUrl = track.artworkUrl,
                    primaryColor = primaryColor,
                    onDoubleTap = { viewModel.toggleLike() },
                    indicator = if (uiState.isLiked) Icons.Default.Favorite else null
                )

            Spacer(Modifier.height(24.dp))

            TrackInfo(
                title = track.title,
                artist = track.artist,
                source = track.source,
                primaryColor = primaryColor
            )

            Spacer(Modifier.height(32.dp))

            ProgressBar(
                progress = if (uiState.duration > 0) uiState.position.toFloat() / uiState.duration.toFloat() else 0f,
                position = uiState.position,
                duration = uiState.duration,
                onSeek = { viewModel.seekTo((it * uiState.duration).toLong()) },
                primaryColor = primaryColor
            )

            Spacer(Modifier.height(24.dp))

            PlaybackControls(
                isPlaying = uiState.isPlaying,
                onPlayPause = { viewModel.togglePlayPause() },
                onSkipNext = { viewModel.skipToNext() },
                onSkipPrevious = { viewModel.skipToPrevious() },
                primaryColor = primaryColor
            )

            Spacer(Modifier.height(24.dp))

            SecondaryControls(
                speed = uiState.speed,
                sleepTimerMinutes = uiState.sleepTimerMinutes,
                repeatMode = uiState.repeatMode,
                shuffleMode = uiState.shuffleMode,
                onSpeedChange = { viewModel.setSpeed(it) },
                onSleepTimerChange = { viewModel.setSleepTimer(it) },
                onRepeatChange = { viewModel.setRepeatMode(it) },
                onShuffleChange = { viewModel.setShuffleMode(it) },
                onSpeedClick = { showSpeedDialog = true },
                onSleepTimerClick = { showSleepTimerDialog = true },
                onNavigateQueue = onNavigateQueue,
                onShare = if (onShareTrack != null) { { onShareTrack(track.title, track.artist) } } else null,
                primaryColor = primaryColor
            )

            Spacer(Modifier.height(32.dp))

            LyricsSection(
                lyrics = uiState.lyrics,
                isLoading = uiState.isLoadingLyrics,
                positionMs = uiState.position,
                primaryColor = primaryColor
            )

            Spacer(Modifier.height(32.dp))

            if (uiState.queue.isNotEmpty()) {
                QueueSection(
                    queue = uiState.queue,
                    currentIndex = uiState.currentQueueIndex,
                    primaryColor = primaryColor,
                    onClearQueue = { musicPlayer.clearQueue() },
                    onPlayTrack = { index -> musicPlayer.play(uiState.queue[index]) },
                    onRemoveTrack = { index -> musicPlayer.removeFromQueue(uiState.queue[index].id) },
                    onMoveUp = { index -> musicPlayer.reorderQueue(index, index - 1) },
                    onMoveDown = { index -> musicPlayer.reorderQueue(index, index + 1) }
                )
            }

            Spacer(Modifier.height(32.dp))
            }
        }
    }
}

@Composable
private fun DynamicBackground(
    primaryColor: androidx.compose.ui.graphics.Color,
    secondaryColor: androidx.compose.ui.graphics.Color
) {
    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = androidx.compose.ui.Alignment.Center
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.verticalGradient(
                        colors = listOf(
                            primaryColor.copy(alpha = 0.15f),
                            secondaryColor.copy(alpha = 0.1f),
                            MaterialTheme.colorScheme.background
                        )
                    )
                )
        )
    }
}

@Composable
private fun EmptyPlayerState() {
    Column(
        modifier = Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
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
    }
}

@Composable
private fun AnimatedArtwork(
    artworkUrl: String?,
    primaryColor: androidx.compose.ui.graphics.Color,
    onDoubleTap: (() -> Unit)? = null,
    indicator: androidx.compose.ui.graphics.vector.ImageVector? = null,
    modifier: Modifier = Modifier
) {
    var scale by remember { mutableStateOf(1f) }
    Box(
        modifier = modifier
            .size(280.dp)
            .then(
                if (onDoubleTap != null) Modifier.pointerInput(Unit) {
                    detectTapGestures(onDoubleTap = { onDoubleTap() })
                } else Modifier
            )
            .pointerInput(Unit) {
                detectTransformGestures { _, _, zoom, _ ->
                    scale = (scale * zoom).coerceIn(1f, 3f)
                }
            },
        contentAlignment = androidx.compose.ui.Alignment.Center
    ) {
        if (indicator != null) {
            Icon(
                imageVector = indicator,
                contentDescription = "Liked",
                tint = Color(0xFFE91E63),
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .size(32.dp)
                    .padding(4.dp)
            )
        }
        if (artworkUrl != null) {
            Image(
                painter = rememberAsyncImagePainter(artworkUrl),
                contentDescription = "Album artwork",
                modifier = Modifier
                    .size(280.dp)
                    .scale(scale)
                    .clip(RoundedCornerShape(24.dp)),
                contentScale = ContentScale.Crop
            )
        } else {
            Card(
                modifier = Modifier.size(280.dp),
                shape = RoundedCornerShape(24.dp),
                elevation = CardDefaults.cardElevation(defaultElevation = 8.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
            ) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = androidx.compose.ui.Alignment.Center) {
                    Icon(
                        imageVector = Icons.Default.MusicNote,
                        contentDescription = "Placeholder artwork",
                        modifier = Modifier.size(64.dp),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }
    }
}

@Composable
private fun TrackInfo(
    title: String,
    artist: String,
    source: String?,
    primaryColor: androidx.compose.ui.graphics.Color
) {
    Column(horizontalAlignment = androidx.compose.ui.Alignment.CenterHorizontally) {
        Text(
            text = title,
            style = MaterialTheme.typography.headlineMedium,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onSurface,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            textAlign = TextAlign.Center
        )

        Spacer(Modifier.height(8.dp))

        Row(
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = artist,
                style = MaterialTheme.typography.titleMedium,
                color = primaryColor,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            source?.let { src ->
                Spacer(Modifier.width(8.dp))
                SourceBadge(source = src)
            }
        }
    }
}

@Composable
private fun SourceBadge(source: String) {
    val (label, color) = when (source.lowercase()) {
        "spotify" -> "Spotify" to Color(0xFF1DB954)
        "youtube" -> "YouTube" to Color(0xFFFF0000)
        "deezer" -> "Deezer" to Color(0xFFFF00FF)
        "soundcloud" -> "SC" to Color(0xFFFF5500)
        "audius" -> "Audius" to Color(0xFF6C5CE7)
        "jamendo" -> "Jamendo" to Color(0xFF00B894)
        "fma" -> "FMA" to Color(0xFFE17055)
        "bandcamp" -> "BC" to Color(0xFF636E72)
        else -> source.replaceFirstChar { it.uppercase() } to MaterialTheme.colorScheme.primary
    }
    Surface(
        color = color.copy(alpha = 0.15f),
        shape = RoundedCornerShape(4.dp),
        border = androidx.compose.foundation.BorderStroke(1.dp, color.copy(alpha = 0.5f))
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            color = color,
            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
            fontWeight = androidx.compose.ui.text.font.FontWeight.Bold,
            fontSize = 10.sp
        )
    }
}

@Composable
private fun ProgressBar(
    progress: Float,
    position: Long,
    duration: Long,
    onSeek: (Float) -> Unit,
    primaryColor: androidx.compose.ui.graphics.Color
) {
    val posMin = (position / 60000).toInt()
    val posSec = ((position % 60000) / 1000).toInt()
    val durMin = (duration / 60000).toInt()
    val durSec = ((duration % 60000) / 1000).toInt()

    Column(modifier = Modifier.fillMaxWidth()) {
        Slider(
            value = progress,
            onValueChange = onSeek,
            modifier = Modifier.fillMaxWidth().height(24.dp),
            colors = SliderDefaults.colors(
                thumbColor = primaryColor,
                activeTrackColor = primaryColor,
                inactiveTrackColor = MaterialTheme.colorScheme.surfaceVariant
            )
        )

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text(
                text = "%d:%02d".format(posMin, posSec),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Text(
                text = "%d:%02d".format(durMin, durSec),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

@Composable
private fun PlaybackControls(
    isPlaying: Boolean,
    onPlayPause: () -> Unit,
    onSkipNext: () -> Unit,
    onSkipPrevious: () -> Unit,
    primaryColor: androidx.compose.ui.graphics.Color
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceEvenly,
        verticalAlignment = Alignment.CenterVertically
    ) {
        IconButton(onClick = onSkipPrevious, modifier = Modifier.size(48.dp)) {
            Icon(Icons.Default.SkipPrevious, "Previous", modifier = Modifier.size(28.dp), tint = MaterialTheme.colorScheme.onSurface)
        }

        Surface(
            modifier = Modifier.size(72.dp),
            shape = CircleShape,
            color = primaryColor,
            tonalElevation = 8.dp,
            shadowElevation = 8.dp
        ) {
            IconButton(onClick = onPlayPause) {
                Icon(
                    imageVector = if (isPlaying) Icons.Default.Pause else Icons.Default.PlayArrow,
                    contentDescription = if (isPlaying) "Pause" else "Play",
                    modifier = Modifier.size(36.dp),
                    tint = MaterialTheme.colorScheme.onPrimary
                )
            }
        }

        IconButton(onClick = onSkipNext, modifier = Modifier.size(48.dp)) {
            Icon(Icons.Default.SkipNext, "Next", modifier = Modifier.size(28.dp), tint = MaterialTheme.colorScheme.onSurface)
        }
    }
}

@Composable
private fun SecondaryControls(
    speed: Float,
    sleepTimerMinutes: Int,
    repeatMode: com.sinc.enhanced.domain.player.RepeatMode,
    shuffleMode: com.sinc.enhanced.domain.player.ShuffleMode,
    onSpeedChange: (Float) -> Unit,
    onSleepTimerChange: (Int) -> Unit,
    onRepeatChange: (com.sinc.enhanced.domain.player.RepeatMode) -> Unit,
    onShuffleChange: (com.sinc.enhanced.domain.player.ShuffleMode) -> Unit,
    onSpeedClick: () -> Unit,
    onSleepTimerClick: () -> Unit,
    onNavigateQueue: (() -> Unit)?,
    onShare: (() -> Unit)? = null,
    primaryColor: androidx.compose.ui.graphics.Color
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceEvenly,
        verticalAlignment = Alignment.CenterVertically
    ) {
        if (onShare != null) {
            IconButton(onClick = onShare, modifier = Modifier.size(48.dp)) {
                Icon(Icons.Default.Share, "Share", modifier = Modifier.size(24.dp), tint = MaterialTheme.colorScheme.onSurface)
            }
        }

        IconButton(onClick = onSpeedClick, modifier = Modifier.size(48.dp)) {
            Icon(Icons.Default.FastForward, "Speed", modifier = Modifier.size(24.dp), tint = if (speed != 1.0f) primaryColor else MaterialTheme.colorScheme.onSurface)
        }

        Text(
            text = "Speed: ${"%.2f".format(speed)}x",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurface
        )

        IconButton(onClick = onSleepTimerClick, modifier = Modifier.size(48.dp)) {
            Icon(Icons.Default.Alarm, "Sleep Timer", modifier = Modifier.size(24.dp), tint = if (sleepTimerMinutes > 0) primaryColor else MaterialTheme.colorScheme.onSurface)
        }

        if (sleepTimerMinutes > 0) {
            Text(
                text = "Sleep: ${sleepTimerMinutes}min",
                style = MaterialTheme.typography.bodySmall,
                color = primaryColor
            )
        }
    }
}

@Composable
private fun SpeedDialog(
    currentSpeed: Float,
    onSpeedSelected: (Float) -> Unit,
    onDismiss: () -> Unit
) {
    val speeds = listOf(0.25f, 0.5f, 0.75f, 1.0f, 1.25f, 1.5f, 1.75f, 2.0f, 3.0f)
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Playback Speed") },
        text = {
            Column {
                speeds.forEach { speed ->
                    Row(
                        modifier = Modifier.fillMaxWidth().clickable { onSpeedSelected(speed) }.padding(vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        RadioButton(
                            selected = speed == currentSpeed,
                            onClick = { onSpeedSelected(speed) }
                        )
                        Spacer(Modifier.width(8.dp))
                        Text("${"%.2f".format(speed)}x", style = MaterialTheme.typography.bodyLarge)
                    }
                }
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text("Close") } }
    )
}

@Composable
private fun SleepTimerDialog(
    currentMinutes: Int,
    onTimerSelected: (Int) -> Unit,
    onCancel: () -> Unit,
    onDismiss: () -> Unit
) {
    val options = listOf(5 to "5 minutes", 10 to "10 minutes", 15 to "15 minutes", 30 to "30 minutes", 45 to "45 minutes", 60 to "1 hour", 90 to "1.5 hours", 120 to "2 hours")
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Sleep Timer") },
        text = {
            Column {
                if (currentMinutes > 0) {
                    Text("Timer active: ${currentMinutes}min", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.primary)
                    Spacer(Modifier.height(8.dp))
                    OutlinedButton(onClick = onCancel, modifier = Modifier.fillMaxWidth()) {
                        Text("Cancel Timer")
                    }
                    Spacer(Modifier.height(12.dp))
                    HorizontalDivider()
                    Spacer(Modifier.height(8.dp))
                }
                options.forEach { (minutes, label) ->
                    Row(
                        modifier = Modifier.fillMaxWidth().clickable { onTimerSelected(minutes) }.padding(vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        RadioButton(
                            selected = minutes == currentMinutes,
                            onClick = { onTimerSelected(minutes) }
                        )
                        Spacer(Modifier.width(8.dp))
                        Text(label, style = MaterialTheme.typography.bodyLarge)
                    }
                }
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text("Close") } }
    )
}

@Composable
private fun LyricsSection(
    lyrics: String?,
    isLoading: Boolean,
    primaryColor: androidx.compose.ui.graphics.Color,
    positionMs: Long = 0L
) {
    if (isLoading) {
        Box(modifier = Modifier.fillMaxWidth().padding(16.dp), contentAlignment = Alignment.Center) {
            CircularProgressIndicator(modifier = Modifier.size(24.dp))
        }
        return
    }
    if (lyrics != null) {
        val lines = lyrics.lines()
        val hasTimestamps = lines.any { it.startsWith("[") && it.contains("]") }
        if (hasTimestamps) {
            val parsed = remember(lyrics) {
                val list = mutableListOf<Pair<Long, String>>()
                for (line in lines) {
                    val match = Regex("""\[(\d+):(\d+(?:\.\d+)?)\](.*)""").find(line.trim())
                    if (match != null) {
                        val mins = match.groupValues[1].toLong()
                        val secs = match.groupValues[2].toFloat()
                        val text = match.groupValues[3].trim()
                        val timeMs = (mins * 60_000 + (secs * 1000).toLong())
                        list.add(timeMs to text)
                    }
                }
                list.sortedBy { it.first }
            }
            val listState = rememberLazyListState()
            val currentLineIndex = parsed.indexOfLast { it.first <= positionMs }.coerceAtLeast(0)
            LaunchedEffect(currentLineIndex) {
                if (currentLineIndex > 0) {
                    listState.animateScrollToItem(currentLineIndex)
                }
            }
            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
                color = MaterialTheme.colorScheme.surface.copy(alpha = 0.8f),
                tonalElevation = 2.dp
            ) {
                val currentLineTime = if (currentLineIndex < parsed.size) parsed[currentLineIndex].first else -1L
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(text = "Lyrics", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold, color = primaryColor)
                    Spacer(Modifier.height(8.dp))
                    LazyColumn(
                        state = listState,
                        modifier = Modifier.heightIn(max = 300.dp)
                    ) {
                        items(parsed, key = { it.first }) { (time, text) ->
                            val isCurrent = time == currentLineTime
                            Text(
                                text = text,
                                style = MaterialTheme.typography.bodyMedium,
                                color = if (isCurrent) primaryColor else MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                                fontWeight = if (isCurrent) FontWeight.Bold else FontWeight.Normal,
                                modifier = Modifier.padding(vertical = 4.dp)
                            )
                        }
                    }
                }
            }
        } else {
            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
                color = MaterialTheme.colorScheme.surface.copy(alpha = 0.8f),
                tonalElevation = 2.dp
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Row {
                        Text(text = "Lyrics", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold, color = primaryColor)
                    }
                    Spacer(Modifier.height(8.dp))
                    Text(
                        text = lyrics,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.85f),
                        lineHeight = MaterialTheme.typography.bodyMedium.lineHeight
                    )
                }
            }
        }
    } else {
        Surface(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(16.dp),
            color = MaterialTheme.colorScheme.surface.copy(alpha = 0.5f)
        ) {
            Box(modifier = Modifier.padding(16.dp).fillMaxWidth(), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    @Suppress("DEPRECATION")
                    Icon(Icons.AutoMirrored.Filled.QueueMusic, "No lyrics available", tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f), modifier = Modifier.size(32.dp))
                    Spacer(Modifier.height(4.dp))
                    Text(text = "No lyrics found", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f))
                }
            }
        }
    }
}

@Composable
private fun QueueSection(
    queue: List<Track>,
    currentIndex: Int,
    primaryColor: androidx.compose.ui.graphics.Color,
    onClearQueue: () -> Unit = {},
    onPlayTrack: (Int) -> Unit = {},
    onRemoveTrack: (Int) -> Unit = {},
    onMoveUp: ((Int) -> Unit)? = null,
    onMoveDown: ((Int) -> Unit)? = null
) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        color = MaterialTheme.colorScheme.surface.copy(alpha = 0.8f),
        tonalElevation = 2.dp
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(text = "Queue (${queue.size})", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold, color = primaryColor)
                TextButton(onClick = onClearQueue) { Text("Clear All") }
            }
            Spacer(Modifier.height(8.dp))
            Column {
                queue.forEachIndexed { index, track ->
                    val isCurrent = index == currentIndex
                    Surface(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 4.dp)
                            .clickable { onPlayTrack(index) },
                        color = if (isCurrent) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceVariant,
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                            if (track.artworkUrl != null) {
                                Image(
                                    painter = rememberAsyncImagePainter(track.artworkUrl!!),
                                    contentDescription = null,
                                    modifier = Modifier.size(40.dp).clip(RoundedCornerShape(8.dp)),
                                    contentScale = ContentScale.Crop
                                )
                            } else {
                                Surface(
                                    modifier = Modifier.size(40.dp).clip(RoundedCornerShape(8.dp)),
                                    color = MaterialTheme.colorScheme.surface
                                ) {
                                    Box(contentAlignment = Alignment.Center) {
                                        Icon(Icons.Default.MusicNote, "Album artwork placeholder", tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(18.dp))
                                    }
                                }
                            }

                            Spacer(Modifier.width(12.dp))

                            Column(modifier = Modifier.fillMaxWidth()) {
                                Text(
                                    text = track.title,
                                    style = MaterialTheme.typography.titleSmall,
                                    fontWeight = FontWeight.Bold,
                                    color = if (isCurrent) MaterialTheme.colorScheme.onPrimaryContainer else MaterialTheme.colorScheme.onSurface,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                                Text(
                                    text = track.artist,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = if (isCurrent) MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.8f) else MaterialTheme.colorScheme.onSurfaceVariant,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                            }

                            if (isCurrent) {
                                Icon(Icons.Default.MusicNote, "Now playing indicator", tint = primaryColor, modifier = Modifier.size(20.dp))
                                Spacer(Modifier.width(8.dp))
                            }

                            if (!isCurrent && queue.size > 1) {
                                if (index > 0 && onMoveUp != null) {
                                    IconButton(onClick = { onMoveUp(index) }) {
                                        Icon(Icons.Default.ArrowDropUp, "Move up", tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(20.dp))
                                    }
                                }
                                if (index < queue.size - 1 && onMoveDown != null) {
                                    IconButton(onClick = { onMoveDown(index) }) {
                                        Icon(Icons.Default.ArrowDropDown, "Move down", tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(20.dp))
                                    }
                                }
                                IconButton(onClick = { onRemoveTrack(index) }) {
                                    Icon(Icons.Default.Close, "Remove", tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(20.dp))
                                }
                            }
                        }
                    }
                }
            }
            Spacer(Modifier.height(16.dp))
        }
    }
}