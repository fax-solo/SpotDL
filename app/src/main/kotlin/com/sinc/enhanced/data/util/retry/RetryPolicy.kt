package com.sinc.enhanced.data.util.retry

import kotlin.math.min
import kotlin.math.pow
import kotlin.random.Random

/**
 * Configuration for bounded retries with exponential backoff and jitter.
 */
data class RetryPolicy(
    val maxRetries: Int = 2,
    val initialDelayMs: Long = 500,
    val maxDelayMs: Long = 5000,
    val backoffFactor: Double = 2.0,
    val jitterRatio: Double = 0.2,
    val timeoutMs: Long = 12000,
    val retryOnNull: Boolean = true
) {
    init {
        require(maxRetries >= 0) { "maxRetries must be >= 0" }
        require(initialDelayMs >= 0) { "initialDelayMs must be >= 0" }
        require(maxDelayMs >= 0) { "maxDelayMs must be >= 0" }
        require(backoffFactor >= 1.0) { "backoffFactor must be >= 1.0" }
        require(jitterRatio >= 0.0 && jitterRatio <= 1.0) { "jitterRatio must be in [0, 1]" }
    }

    /** Delay before retry [attempt] (0-based). Capped at [maxDelayMs] with optional jitter. */
    fun delayForAttempt(attempt: Int): Long {
        val exponential = min(initialDelayMs * backoffFactor.pow(attempt), maxDelayMs.toDouble())
        val jitter = if (jitterRatio > 0.0) {
            exponential * jitterRatio * Random.nextDouble(-1.0, 1.0)
        } else {
            0.0
        }
        return (exponential + jitter).coerceAtLeast(0.0).toLong()
    }
}
