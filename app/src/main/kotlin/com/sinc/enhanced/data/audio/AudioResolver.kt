package com.sinc.enhanced.data.audio

import com.sinc.enhanced.data.model.Track
import com.sinc.enhanced.data.util.MatchScorer
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.withTimeout

data class AudioCandidate(
    val audioUrl: String,
    val source: String,
    val score: Float,
    val isPreview: Boolean = false
)

data class ResolutionContext(
    val track: Track,
    val startNanos: Long = System.nanoTime()
)

interface AudioResolver {
    suspend fun resolve(track: Track, context: ResolutionContext = ResolutionContext(track)): AudioCandidate?
}

class AudioResolverPipeline(
    private val resolvers: List<AudioResolver>,
    private val overallTimeoutMs: Long = 8000L
) {
    suspend fun resolve(track: Track): Pair<String, String>? {
        return try {
            withTimeout(overallTimeoutMs) {
                val context = ResolutionContext(track)
                coroutineScope {
                    val deferreds = resolvers.map { resolver ->
                        async {
                            try {
                                resolver.resolve(track, context)
                            } catch (_: Exception) { null }
                        }
                    }

                    deferreds.firstCompletedOrNull { candidate ->
                        candidate != null && !candidate.isPreview && candidate.score >= MatchScorer.GOOD_CONFIDENCE
                    }?.let { Pair(it.audioUrl, it.source) }
                        ?: deferreds.firstCompletedOrNull { candidate ->
                            candidate != null && !candidate.isPreview && candidate.score >= MatchScorer.MIN_CONFIDENCE
                        }?.let { Pair(it.audioUrl, it.source) }
                        ?: deferreds.firstCompletedOrNull { candidate ->
                            candidate != null && candidate.score >= MatchScorer.GOOD_CONFIDENCE
                        }?.let { Pair(it.audioUrl, it.source) }
                        ?: deferreds.firstCompletedOrNull { candidate ->
                            candidate != null && candidate.score >= MatchScorer.MIN_CONFIDENCE
                        }?.let { Pair(it.audioUrl, it.source) }
                }
            }
        } catch (_: TimeoutCancellationException) { null }
    }

    suspend fun resolveWithLowerThreshold(track: Track, minScore: Float = 0.0f): Pair<String, String>? {
        return try {
            withTimeout(overallTimeoutMs) {
                val context = ResolutionContext(track)
                coroutineScope {
                    val deferreds = resolvers.map { resolver ->
                        async {
                            try {
                                resolver.resolve(track, context)
                            } catch (_: Exception) { null }
                        }
                    }

                    deferreds.firstCompletedOrNull { candidate ->
                        candidate != null && !candidate.isPreview && candidate.score >= minScore
                    }?.let { Pair(it.audioUrl, it.source) }
                        ?: deferreds.firstCompletedOrNull { candidate ->
                            candidate != null && candidate.score >= minScore
                        }?.let { Pair(it.audioUrl, it.source) }
                }
            }
        } catch (_: TimeoutCancellationException) { null }
    }

    suspend fun resolveAll(track: Track): List<AudioCandidate> {
        val context = ResolutionContext(track)
        return resolvers.mapNotNull { resolver ->
            try {
                resolver.resolve(track, context)
            } catch (_: Exception) { null }
        }.sortedByDescending { it.score }
    }
}

private suspend fun <T> List<kotlinx.coroutines.Deferred<T?>>.firstCompletedOrNull(
    predicate: (T) -> Boolean
): T? {
    val remaining = this.toMutableList()
    while (remaining.isNotEmpty()) {
        val (done, rest) = remaining.partition { it.isCompleted }
        for (d in done) {
            val result = d.await()
            if (result != null && predicate(result)) return result
        }
        remaining.clear()
        remaining.addAll(rest)
        if (remaining.isEmpty()) break
        kotlinx.coroutines.yield()
    }
    return null
}
