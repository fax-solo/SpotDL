package com.sinc.enhanced.data.download

data class DownloadedFile(
    val path: String,
    val bytes: Long,
    val mimeType: String
)
