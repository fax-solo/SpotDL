package com.sinc.enhanced.ui.components

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.sinc.enhanced.ui.theme.Surface as SurfaceColor

@Composable
fun ShimmerBrush(targetValue: Float = 1000f): Brush {
    val transition = rememberInfiniteTransition(label = "shimmer")
    val translateAnim by transition.animateFloat(
        initialValue = 0f,
        targetValue = targetValue,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 1200, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "shimmerTranslate"
    )
    return Brush.linearGradient(
        colors = listOf(
            Color.Transparent,
            Color.White.copy(alpha = 0.05f),
            Color.White.copy(alpha = 0.1f),
            Color.White.copy(alpha = 0.05f),
            Color.Transparent
        ),
        start = Offset(translateAnim - 200f, 0f),
        end = Offset(translateAnim, 0f)
    )
}

@Composable
fun ShimmerBox(
    modifier: Modifier = Modifier,
    shimmerBrush: Brush = ShimmerBrush()
) {
    Box(
        modifier = modifier
            .background(SurfaceColor)
            .then(
                Modifier.background(shimmerBrush)
            )
    )
}

@Composable
fun TrackCardShimmer(modifier: Modifier = Modifier) {
    val brush = ShimmerBrush()
    Box(
        modifier = modifier.width(150.dp).clip(RoundedCornerShape(12.dp)).background(SurfaceColor)
    ) {
        Column(modifier = Modifier.padding(8.dp)) {
            ShimmerBox(modifier = Modifier.size(134.dp).clip(RoundedCornerShape(8.dp)), shimmerBrush = brush)
            Spacer(Modifier.height(8.dp))
            ShimmerBox(modifier = Modifier.fillMaxWidth().height(12.dp).clip(RoundedCornerShape(4.dp)), shimmerBrush = brush)
            Spacer(Modifier.height(4.dp))
            ShimmerBox(modifier = Modifier.width(80.dp).height(10.dp).clip(RoundedCornerShape(4.dp)), shimmerBrush = brush)
        }
    }
}

@Composable
fun TrackItemShimmer(modifier: Modifier = Modifier) {
    val brush = ShimmerBrush()
    Box(
        modifier = modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(SurfaceColor)
    ) {
        Row(
            modifier = Modifier.padding(8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            ShimmerBox(modifier = Modifier.size(48.dp).clip(RoundedCornerShape(8.dp)), shimmerBrush = brush)
            Spacer(Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                ShimmerBox(modifier = Modifier.fillMaxWidth(0.7f).height(14.dp).clip(RoundedCornerShape(4.dp)), shimmerBrush = brush)
                Spacer(Modifier.height(8.dp))
                ShimmerBox(modifier = Modifier.fillMaxWidth(0.4f).height(12.dp).clip(RoundedCornerShape(4.dp)), shimmerBrush = brush)
            }
        }
    }
}

@Composable
fun HomeShimmer() {
    val brush = ShimmerBrush()
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        ShimmerBox(
            modifier = Modifier.fillMaxWidth().height(48.dp).clip(RoundedCornerShape(16.dp)),
            shimmerBrush = brush
        )
        Spacer(Modifier.height(8.dp))
        ShimmerBox(
            modifier = Modifier.fillMaxWidth().height(56.dp).clip(RoundedCornerShape(16.dp)),
            shimmerBrush = brush
        )
        Spacer(Modifier.height(16.dp))
        ShimmerBox(
            modifier = Modifier.width(150.dp).height(20.dp).clip(RoundedCornerShape(4.dp)),
            shimmerBrush = brush
        )
        Spacer(Modifier.height(8.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            repeat(4) {
                TrackCardShimmer()
            }
        }
        Spacer(Modifier.height(16.dp))
        ShimmerBox(
            modifier = Modifier.width(170.dp).height(20.dp).clip(RoundedCornerShape(4.dp)),
            shimmerBrush = brush
        )
        Spacer(Modifier.height(8.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            repeat(4) {
                TrackCardShimmer()
            }
        }
    }
}
