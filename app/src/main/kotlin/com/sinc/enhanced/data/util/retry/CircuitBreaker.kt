package com.sinc.enhanced.data.util.retry

import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/**
 * Per-key circuit breaker. After [failureThreshold] consecutive failures for a
 * key the circuit opens for [openDurationMs]; while open, callers short-circuit
 * without invoking the blocked work. After the window elapses the circuit
 * resets (half-open) and a single failure re-opens it.
 */
class CircuitBreaker(
    private val failureThreshold: Int = 3,
    private val openDurationMs: Long = 30_000L
) {
    init {
        require(failureThreshold > 0) { "failureThreshold must be > 0" }
        require(openDurationMs > 0) { "openDurationMs must be > 0" }
    }

    private class State {
        var failures: Int = 0
        var openedAt: Long = 0
    }

    private val mutex = Mutex()
    private val states = mutableMapOf<String, State>()

    /** True when [key] is currently short-circuiting (open circuit). */
    suspend fun isOpen(key: String): Boolean = mutex.withLock {
        val state = states[key] ?: return@withLock false
        if (state.failures < failureThreshold) return@withLock false
        if (System.currentTimeMillis() - state.openedAt >= openDurationMs) {
            states.remove(key)
            return@withLock false
        }
        true
    }

    suspend fun recordFailure(key: String): Unit = mutex.withLock {
        val state = states.getOrPut(key) { State() }
        state.failures++
        if (state.failures == failureThreshold) {
            state.openedAt = System.currentTimeMillis()
        }
    }

    suspend fun recordSuccess(key: String): Unit = mutex.withLock {
        states.remove(key)
    }

    /** Clears all circuit state (used by tests). */
    fun reset() = states.clear()
}
