package com.sinc.enhanced.ui.components

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.unit.dp
import com.sinc.enhanced.data.util.generateWaveform
import kotlin.math.PI
import kotlin.math.sin

/**
 * Waveform-as-structure progress. Deterministic per track id so the mini bar
 * and full player render the same shape (mirrors the web UI). Tap or drag
 * anywhere to seek.
 */
@Composable
fun WaveformProgressBar(
    trackId: String?,
    progress: Float,
    isPlaying: Boolean,
    onSeek: (Float) -> Unit,
    modifier: Modifier = Modifier,
    bars: Int = 36,
    barHeight: Int = 28,
    barWidth: Int = 3,
    activeColor: Color = Color(0xFF10B981),
    idleColor: Color = Color(0xFF232B3D)
) {
    val amplitudes = remember(trackId, bars) {
        if (trackId.isNullOrEmpty()) generateWaveform("sinc", bars)
        else generateWaveform(trackId, bars)
    }
    val playedCount = (progress.coerceIn(0f, 1f) * bars).toInt().coerceIn(0, bars)
    val infinite = rememberInfiniteTransition(label = "waveform")
    val phase by infinite.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(tween(1600, easing = LinearEasing)),
        label = "waveform-phase"
    )

    Row(
        modifier = modifier
            .fillMaxWidth()
            .height(barHeight.dp)
            .pointerInput(bars) {
                detectTapGestures { offset ->
                    onSeek((offset.x / size.width).coerceIn(0f, 1f))
                }
            }
            .pointerInput(Unit) {
                detectHorizontalDragGestures { change, _ ->
                    change.consume()
                    onSeek((change.position.x / size.width).coerceIn(0f, 1f))
                }
            },
        horizontalArrangement = Arrangement.spacedBy(2.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        amplitudes.forEachIndexed { index, amp ->
            val played = index < playedCount
            val breathe = isPlaying && played
            Box(
                modifier = Modifier
                    .width(barWidth.dp)
                    .height(((amp * barHeight).coerceAtLeast(3f)).dp)
                    .graphicsLayer {
                        if (breathe) {
                            val p = (phase + index.toFloat() / bars) % 1f
                            scaleY = 0.86f + 0.14f * sin((2 * PI * p).toFloat())
                        }
                    }
                    .background(
                        color = if (played) activeColor else idleColor,
                        shape = RoundedCornerShape(999.dp)
                    )
            )
        }
    }
}
