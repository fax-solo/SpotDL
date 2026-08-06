package com.sinc.enhanced.data.util.retry

import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CircuitBreakerTest {

    @Test
    fun `is closed initially`() = runTest {
        val breaker = CircuitBreaker()
        assertFalse(breaker.isOpen("source"))
    }

    @Test
    fun `opens after failure threshold`() = runTest {
        val breaker = CircuitBreaker(failureThreshold = 3, openDurationMs = 60_000)
        repeat(2) { breaker.recordFailure("source") }
        assertFalse(breaker.isOpen("source"))
        breaker.recordFailure("source")
        assertTrue(breaker.isOpen("source"))
    }

    @Test
    fun `closes after open duration elapses`() = kotlinx.coroutines.runBlocking {
        val breaker = CircuitBreaker(failureThreshold = 2, openDurationMs = 5)
        breaker.recordFailure("source")
        breaker.recordFailure("source")
        assertTrue(breaker.isOpen("source"))
        kotlinx.coroutines.delay(20)
        assertFalse(breaker.isOpen("source"))
    }

    @Test
    fun `success resets failures`() = runTest {
        val breaker = CircuitBreaker(failureThreshold = 3, openDurationMs = 60_000)
        repeat(2) { breaker.recordFailure("source") }
        breaker.recordSuccess("source")
        repeat(2) { breaker.recordFailure("source") }
        assertFalse(breaker.isOpen("source"))
    }

    @Test
    fun `keys are independent`() = runTest {
        val breaker = CircuitBreaker(failureThreshold = 2, openDurationMs = 60_000)
        breaker.recordFailure("bad")
        breaker.recordFailure("bad")
        assertTrue(breaker.isOpen("bad"))
        assertFalse(breaker.isOpen("good"))
    }

    @Test(expected = IllegalArgumentException::class)
    fun `zero failure threshold is rejected`() {
        CircuitBreaker(failureThreshold = 0)
    }
}
