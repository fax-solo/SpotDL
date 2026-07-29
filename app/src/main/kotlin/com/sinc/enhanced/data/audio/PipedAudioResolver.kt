package com.sinc.enhanced.data.audio

import com.sinc.enhanced.data.remote.PipedClient
import com.sinc.enhanced.data.model.Track
import com.sinc.enhanced.data.util.MatchScorer
import com.sinc.enhanced.data.util.MatchScorer.MatchOptions
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.withTimeout

class PipedAudioResolver(
    private val pipedClient: PipedClient,
    private val searchTimeoutMs: Long = 6000L,
    private val streamTimeoutMs: Long = 4000L,
    private val maxResults: Int = 3
) : AudioResolver {

    override suspend fun resolve(track: Track, context: ResolutionContext): AudioCandidate? {
        val expectedDurationSec = if (track.durationMs > 0) track.durationMs / 1000 else null
        val queries = generateQueries(track.artist, track.title)

        for (query in queries) {
            try {
                val results = withTimeout(searchTimeoutMs) {
                    pipedClient.search(query, limit = maxResults, filter = "music")
                }
                if (results.isEmpty()) continue

                for (result in results) {
                    try {
                        val stream = withTimeout(streamTimeoutMs) {
                            pipedClient.getStreams(result.videoId)
                        } ?: continue

                        val audioUrl = stream.audioTrackUrl ?: stream.url
                        if (audioUrl.isEmpty()) continue

                        val score = MatchScorer.computeScore(MatchOptions(
                            expectedTitle = track.title,
                            expectedArtist = track.artist,
                            foundTitle = result.title,
                            foundAuthor = result.uploader,
                            foundDurationSec = result.duration,
                            expectedDurationSec = expectedDurationSec,
                            expectedIsrc = track.isrc
                        ))

                        if (score >= MatchScorer.MIN_CONFIDENCE) {
                            return AudioCandidate(audioUrl, "youtube", score)
                        }
                    } catch (_: TimeoutCancellationException) { continue }
                      catch (_: Exception) { continue }
                }
            } catch (_: TimeoutCancellationException) { continue }
              catch (_: Exception) { continue }
        }
        return null
    }

    private fun generateQueries(artist: String, title: String): List<String> {
        return listOfNotNull(
            "$artist - $title audio",
            "$artist - $title",
            "$artist $title",
            title
        ).distinct().filter { it.length > 2 }
    }
}
