package com.sinc.enhanced.data.audio

import com.sinc.enhanced.data.remote.JamendoClient
import com.sinc.enhanced.data.model.Track
import com.sinc.enhanced.data.util.MatchScorer
import com.sinc.enhanced.data.util.MatchScorer.MatchOptions
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.withTimeout

class JamendoAudioResolver(
    private val jamendoClient: JamendoClient,
    private val timeoutMs: Long = 5000L,
    private val maxResults: Int = 2
) : AudioResolver {

    override suspend fun resolve(track: Track, context: ResolutionContext): AudioCandidate? {
        val expectedDurationSec = if (track.durationMs > 0) track.durationMs / 1000 else null
        val queries = generateQueries(track.artist, track.title)

        for (query in queries) {
            try {
                val results = withTimeout(timeoutMs) {
                    jamendoClient.search(query, limit = maxResults)
                }
                if (results.isEmpty()) continue

                for (result in results) {
                    if (result.audioUrl == null) continue
                    val score = MatchScorer.computeScore(MatchOptions(
                        expectedTitle = track.title,
                        expectedArtist = track.artist,
                        foundTitle = result.title,
                        foundAuthor = result.artist,
                        foundDurationSec = result.duration.toLong(),
                        expectedDurationSec = expectedDurationSec,
                        expectedIsrc = track.isrc
                    ))
                    if (score >= MatchScorer.MIN_CONFIDENCE) {
                        return AudioCandidate(result.audioUrl, "jamendo", score)
                    }
                }
            } catch (_: TimeoutCancellationException) { continue }
              catch (_: Exception) { continue }
        }
        return null
    }

    private fun generateQueries(artist: String, title: String): List<String> {
        return listOfNotNull(
            "$artist - $title",
            "$artist $title",
            title
        ).distinct().filter { it.length > 2 }
    }
}
