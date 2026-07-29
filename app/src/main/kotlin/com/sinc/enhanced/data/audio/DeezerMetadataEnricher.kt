package com.sinc.enhanced.data.audio

import com.sinc.enhanced.data.model.Track
import com.sinc.enhanced.data.remote.DeezerClient

class DeezerMetadataEnricher(
    private val deezerClient: DeezerClient
) {
    suspend fun enrich(track: Track): Track {
        if (track.artworkUrl != null && track.artworkUrl.isNotEmpty()) return track
        if (track.isrc == null) return track

        return try {
            val deezerTrack = deezerClient.getTrackByIsrc(track.isrc)
                ?: return track

            track.copy(
                artworkUrl = track.artworkUrl ?: deezerTrack.artworkUrl,
                releaseYear = track.releaseYear
                    ?: try { deezerTrack.duration.toString().take(4).toInt() } catch (_: Exception) { null }
            )
        } catch (_: Exception) { track }
    }

    suspend fun enrichBatch(tracks: List<Track>): List<Track> {
        return tracks.map { enrich(it) }
    }
}
