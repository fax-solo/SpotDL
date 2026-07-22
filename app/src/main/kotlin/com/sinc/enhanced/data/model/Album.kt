package com.sinc.enhanced.data.model

data class Album(
    val id: String,
    val name: String,
    val artist: String,
    val artists: List<String> = listOf(artist),
    val artworkUrl: String? = null,
    val releaseYear: Int? = null,
    val totalTracks: Int = 0,
    val tracks: List<Track> = emptyList(),
    val source: String = "spotify"
)
