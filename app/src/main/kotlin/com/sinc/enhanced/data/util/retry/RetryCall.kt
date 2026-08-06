package com.sinc.enhanced.data.util.retry

import android.util.Log
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout

/**
 * Executes [block] with bounded retries per [policy]. When [breaker] is given,
 * the circuit is checked before the first attempt (open circuit short-circuits
 * to null) and failures/successes are recorded per [key].
 *
 * Returns the first non-null result, or null after exhausting retries.
 */
suspend fun <T> retryCall(
    key: String,
    policy: RetryPolicy = RetryPolicy(),
    breaker: CircuitBreaker? = null,
    label: String = "",
    block: suspend () -> T?
): T? {
    if (breaker != null && breaker.isOpen(key)) return null

    var lastError: String? = null
    for (attempt in 0..policy.maxRetries) {
        if (!currentCoroutineContext().isActive) return null
        try {
            val result = withTimeout(policy.timeoutMs) {
                withContext(Dispatchers.IO) { block() }
            }
            if (result != null || !policy.retryOnNull) {
                breaker?.recordSuccess(key)
                return result
            }
            lastError = "null result"
        } catch (ce: CancellationException) {
            throw ce
        } catch (e: Exception) {
            lastError = e.message ?: e.javaClass.simpleName
        }
        if (attempt < policy.maxRetries) {
            delay(policy.delayForAttempt(attempt))
        }
    }
    breaker?.recordFailure(key)
    if (label.isNotBlank()) {
        Log.w("retryCall", "[$label] failed after ${policy.maxRetries + 1} attempts: $lastError")
    }
    return null
}
