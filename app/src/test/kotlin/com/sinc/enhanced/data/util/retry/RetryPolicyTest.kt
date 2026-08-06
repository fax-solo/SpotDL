package com.sinc.enhanced.data.util.retry

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class RetryPolicyTest {

    @Test
    fun `delay is monotonic and capped at maxDelay`() {
        val policy = RetryPolicy(initialDelayMs = 100, maxDelayMs = 1000, jitterRatio = 0.0)
        val delays = (0..5).map { policy.delayForAttempt(it) }
        for (i in 1 until delays.size) {
            assertTrue("delay[$i]=${delays[i]} should be >= delay[${i - 1}]=${delays[i - 1]}", delays[i] >= delays[i - 1])
        }
        assertTrue(delays.last() <= 1000)
    }

    @Test
    fun `delay is exponential without cap`() {
        val policy = RetryPolicy(initialDelayMs = 100, maxDelayMs = Long.MAX_VALUE, jitterRatio = 0.0)
        assertEquals(100, policy.delayForAttempt(0))
        assertEquals(200, policy.delayForAttempt(1))
        assertEquals(400, policy.delayForAttempt(2))
        assertEquals(800, policy.delayForAttempt(3))
    }

    @Test
    fun `delay stays within jitter bounds`() {
        val policy = RetryPolicy(initialDelayMs = 1000, maxDelayMs = 10000, jitterRatio = 0.2)
        repeat(50) {
            val d = policy.delayForAttempt(2) // base 4000
            assertTrue("delay $d outside bounds", d in 3200L..4800L)
        }
    }

    @Test
    fun `zero jitter is deterministic`() {
        val policy = RetryPolicy(initialDelayMs = 250, maxDelayMs = 5000, jitterRatio = 0.0)
        val d1 = policy.delayForAttempt(1)
        val d2 = policy.delayForAttempt(1)
        assertEquals(d1, d2)
    }

    @Test(expected = IllegalArgumentException::class)
    fun `negative maxRetries is rejected`() {
        RetryPolicy(maxRetries = -1)
    }

    @Test(expected = IllegalArgumentException::class)
    fun `jitter above 1 is rejected`() {
        RetryPolicy(jitterRatio = 1.5)
    }
}
