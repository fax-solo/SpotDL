package com.sinc.enhanced.ui.util

import android.graphics.Bitmap
import androidx.compose.ui.graphics.Color as ComposeColor
import androidx.palette.graphics.Palette

object ColorExtractor {

    fun extractColorsFromBitmap(bitmap: Bitmap): Pair<ComposeColor, ComposeColor> {
        val palette = Palette.from(bitmap).generate()
        val vibrant = palette.vibrantSwatch
        val muted = palette.mutedSwatch
        val darkVibrant = palette.darkVibrantSwatch

        val primary = vibrant?.rgb ?: darkVibrant?.rgb ?: muted?.rgb ?: 0xFF1DB954
        val secondary = muted?.rgb ?: darkVibrant?.rgb ?: vibrant?.rgb ?: 0xFF10B981

        return Pair(
            ComposeColor(primary.toInt()),
            ComposeColor(secondary.toInt())
        )
    }
}