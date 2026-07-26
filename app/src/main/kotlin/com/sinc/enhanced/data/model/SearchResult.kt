package com.sinc.enhanced.data.model

data class SearchResult(
    val track: Track,
    val source: String,
    val confidence: Float = 0.0f,
    @Deprecated("Use audioUrl instead") val streamUrl: String? = null,
    val audioUrl: String? = null,
    val isDownloadable: Boolean = false
)
