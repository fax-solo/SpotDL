package com.sinc.enhanced.data.util.retry

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class RetryCallTest {

    @Test
    fun `returns first non-null result`() = runBlocking {
        val result = retryCall(key = "k", policy = RetryPolicy(maxRetries = 2, initialDelayMs = 1)) { "ok" }
        assertEquals("ok", result)
    }

    @Test
    fun `retries until success`() = runBlocking {
        var calls = 0
        val result = retryCall(key = "k", policy = RetryPolicy(maxRetries = 3, initialDelayMs = 1)) {
            calls++
            if (calls < 3) throw RuntimeException("boom") else "ok"
        }
        assertEquals("ok", result)
        assertEquals(3, calls)
    }

    @Test
    fun `returns null after exhausting retries`() = runBlocking {
        var calls = 0
        val result = retryCall(key = "k", policy = RetryPolicy(maxRetries = 2, initialDelayMs = 1)) {
            calls++
            throw RuntimeException("boom")
        }
        assertNull(result)
        assertEquals(3, calls)
    }

    @Test
    fun `retries on null result when retryOnNull`() = runBlocking {
        var calls = 0
        val result = retryCall(key = "k", policy = RetryPolicy(maxRetries = 2, initialDelayMs = 1)) {
            calls++
            if (calls < 3) null else "ok"
        }
        assertEquals("ok", result)
        assertEquals(3, calls)
    }

    @Test
    fun `null result counts as success when retryOnNull false`() = runBlocking {
        var calls = 0
        val result = retryCall(
            key = "k",
            policy = RetryPolicy(maxRetries = 2, initialDelayMs = 1, retryOnNull = false)
        ) {
            calls++
            null
        }
        assertNull(result)
        assertEquals(1, calls)
    }

    @Test
    fun `open circuit short-circuits without invoking block`() = runBlocking {
        val breaker = CircuitBreaker(failureThreshold = 1, openDurationMs = 60_000)
        breaker.recordFailure("k")
        var calls = 0
        val result = retryCall(key = "k", policy = RetryPolicy(maxRetries = 2), breaker = breaker) {
            calls++
            "ok"
        }
        assertNull(result)
        assertEquals(0, calls)
    }

    @Test
    fun `failure records into breaker`() = runBlocking {
        val breaker = CircuitBreaker(failureThreshold = 1, openDurationMs = 60_000)
        retryCall(key = "k", policy = RetryPolicy(maxRetries = 0), breaker = breaker) {
            throw RuntimeException("boom")
        }
        assertTrue(breaker.isOpen("k"))
    }

    @Test
    fun `success after open window closes circuit`() = runBlocking {
        val breaker = CircuitBreaker(failureThreshold = 1, openDurationMs = 20)
        retryCall(key = "k", policy = RetryPolicy(maxRetries = 0), breaker = breaker) {
            throw RuntimeException("boom")
        }
        assertTrue(breaker.isOpen("k"))

        var calls = 0
        val shortCircuited = retryCall(key = "k", policy = RetryPolicy(maxRetries = 0), breaker = breaker) {
            calls++
            "ok"
        }
        assertNull(shortCircuited)
        assertEquals(0, calls)

        kotlinx.coroutines.delay(30)
        val result = retryCall(key = "k", policy = RetryPolicy(maxRetries = 0), breaker = breaker) {
            calls++
            "ok"
        }
        assertEquals("ok", result)
        assertEquals(1, calls)
        assertFalse(breaker.isOpen("k"))
    }

    @Test
    fun `cancellation propagates`() = runBlocking {
        var cancelled = false
        try {
            retryCall(key = "k", policy = RetryPolicy(maxRetries = 2, initialDelayMs = 1)) {
                throw CancellationException("cancel")
            }
        } catch (_: CancellationException) {
            cancelled = true
        }
        assertTrue(cancelled)
    }
}
