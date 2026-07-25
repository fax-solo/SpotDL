package com.sinc.enhanced.data.model

data class Track(
    val id: String,
    val title: String,
    val artist: String,
    val album: String,
    val albumId: String? = null,
    val durationMs: Long = 0,
    val artworkUrl: String? = null,
    val isrc: String? = null,
    val previewUrl: String? = null,
    val source: String = "spotify",
    val trackNumber: Int = 0,
    val discNumber: Int = 1,
    val artists: List<String> = emptyList(),
    val genres: List<String> = emptyList(),
    val releaseYear: Int? = null
) {
    val durationFormatted: String
        get() {
            val totalSec = durationMs / 1000
            val min = totalSec / 60
            val sec = totalSec % 60
            return "%d:%02d".format(min, sec)
        }

    val displayTitle: String
        get() = "$artist - $title"

    companion object {
        fun fromSpotify(item: Map<String, Any?>): Track? {
            val albumMap = item["album"] as? Map<*, *> ?: return null
            val images = albumMap["images"] as? List<Map<String, Any?>>
            val artistsList = item["artists"] as? List<Map<String, Any?>>
            val firstArtist = artistsList?.firstOrNull()

            return Track(
                id = item["id"] as? String ?: "",
                title = item["name"] as? String ?: "Unknown",
                artist = firstArtist?.get("name") as? String ?: "Unknown",
                album = albumMap["name"] as? String ?: "Unknown",
                albumId = albumMap["id"] as? String,
                durationMs = (item["duration_ms"] as? Number)?.toLong() ?: 0,
                artworkUrl = images?.firstOrNull()?.get("url") as? String,
                isrc = (item["external_ids"] as? Map<*, *>)?.get("isrc") as? String,
                previewUrl = item["preview_url"] as? String,
                source = "spotify",
                trackNumber = (item["track_number"] as? Number)?.toInt() ?: 0,
                discNumber = (item["disc_number"] as? Number)?.toInt() ?: 1,
                artists = artistsList?.mapNotNull { it["name"] as? String } ?: listOf<String>(),
                releaseYear = try {
                    (albumMap["release_date"] as? String)?.take(4)?.toInt()
                } catch (_: Exception) { null }
            )
        }
    }
}
