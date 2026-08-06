package com.sinc.enhanced.data.download

data class DownloadRequest(
    val trackId: String,
    val title: String,
    val artist: String,
    val album: String?,
    val source: String
)
