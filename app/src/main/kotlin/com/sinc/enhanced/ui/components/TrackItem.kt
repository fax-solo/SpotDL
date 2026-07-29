package com.sinc.enhanced.ui.components

import androidx.compose.animation.core.tween
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.QueueMusic
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.rememberAsyncImagePainter
import coil.request.ImageRequest
import androidx.compose.ui.platform.LocalContext
import com.sinc.enhanced.data.model.Track

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun TrackItem(
    track: Track,
    onClick: () -> Unit,
    onLongClick: (() -> Unit)? = null,
    onPreview: (() -> Unit)? = null,
    trailing: @Composable (() -> Unit)? = null,
    subtitle: String? = null,
    modifier: Modifier = Modifier,
    showSourceBadge: Boolean = true
) {
    var showMenu by remember { mutableStateOf(false) }
    val haptic = LocalHapticFeedback.current

    Surface(
        modifier = modifier
            .fillMaxWidth()
            .combinedClickable(
                onClick = {
                    haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                    onClick()
                },
                onLongClick = {
                    haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                    (onLongClick ?: { showMenu = true })()
                }
            ),
        color = MaterialTheme.colorScheme.surface,
        shape = RoundedCornerShape(12.dp)
    ) {
        Row(
            modifier = Modifier
                .padding(8.dp)
                .fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            if (track.artworkUrl != null) {
                var alpha by remember { mutableStateOf(0f) }
                LaunchedEffect(track.artworkUrl) {
                    kotlinx.coroutines.delay(50)
                    alpha = 1f
                }
                Image(
                    painter = rememberAsyncImagePainter(
                        ImageRequest.Builder(LocalContext.current)
                            .data(track.artworkUrl ?: "")
                            .size(96)
                            .crossfade(true)
                            .build()
                    ),
                    contentDescription = "${track.title} by ${track.artist}",
                    modifier = Modifier
                        .size(48.dp)
                        .clip(RoundedCornerShape(8.dp))
                        .graphicsLayer(alpha = alpha),
                    contentScale = ContentScale.Crop
                )
            } else {
                Surface(
                    modifier = Modifier
                        .size(48.dp)
                        .clip(RoundedCornerShape(8.dp)),
                    color = MaterialTheme.colorScheme.surfaceVariant
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Text(
                            text = track.title.firstOrNull()?.toString() ?: "?",
                            style = MaterialTheme.typography.titleLarge,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }

            Spacer(Modifier.width(12.dp))

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = track.title,
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Spacer(Modifier.height(2.dp))
                Row {
                    Text(
                        text = subtitle ?: track.artist,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    if (showSourceBadge) {
                        Spacer(Modifier.width(8.dp))
                        SourceBadge(track.source)
                    }
                }
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

            if (trailing != null) {
                Spacer(Modifier.width(8.dp))
                trailing()
            }
        }
    }

            DropdownMenu(
                expanded = showMenu,
                onDismissRequest = { showMenu = false }
            ) {
                DropdownMenuItem(
                    text = { Text("Play") },
                    onClick = { showMenu = false; haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove); onClick() },
                    leadingIcon = { Icon(Icons.Default.PlayArrow, contentDescription = "Play track") }
                )
                if (onPreview != null) {
                    DropdownMenuItem(
                        text = { Text("Preview (30s)") },
                        onClick = { showMenu = false; haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove); onPreview() },
                        leadingIcon = { Icon(Icons.Default.PlayArrow, contentDescription = "Preview track") }
                    )
                }
                DropdownMenuItem(
                    text = { Text("Add to queue") },
                    onClick = { showMenu = false; haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove) },
                    leadingIcon = { Icon(Icons.Default.QueueMusic, contentDescription = "Add to queue") }
                )
                DropdownMenuItem(
                    text = { Text("Download") },
                    onClick = { showMenu = false; haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove) },
                    leadingIcon = { Icon(Icons.Default.Download, contentDescription = "Download track") }
                )
                DropdownMenuItem(
                    text = { Text("Share") },
                    onClick = { showMenu = false; haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove) },
                    leadingIcon = { Icon(Icons.Default.Share, contentDescription = "Share track") }
                )
            }
}

@Composable
fun SourceBadge(source: String, modifier: Modifier = Modifier) {
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
