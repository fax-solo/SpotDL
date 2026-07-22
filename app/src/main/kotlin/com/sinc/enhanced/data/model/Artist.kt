package com.sinc.enhanced.data.model

data class Artist(
    val id: String,
    val name: String,
    val imageUrl: String? = null,
    val genres: List<String> = emptyList(),
    val followers: Int = 0,
    val popularity: Int = 0,
    val topTracks: List<Track> = emptyList(),
    val albums: List<Album> = emptyList(),
    val relatedArtists: List<Artist> = emptyList()
)
