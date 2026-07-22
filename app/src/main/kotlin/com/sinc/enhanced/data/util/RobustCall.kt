package com.sinc.enhanced.data.util

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.withTimeout
import kotlin.math.min
import kotlin.math.pow

suspend fun <T> robustCall(
    maxRetries: Int = 3,
    initialDelayMs: Long = 1000,
    timeoutMs: Long = 15000,
    label: String = "",
    block: suspend () -> T?
): T? {
    var lastError: String? = null
    for (attempt in 0..maxRetries) {
        if (!currentCoroutineContext().isActive) return null
        try {
            val result = withTimeout(timeoutMs) { block() }
            if (result != null) return result
            lastError = "null result"
        } catch (e: CancellationException) { throw e }
        catch (e: Exception) {
            lastError = e.message ?: e.javaClass.simpleName
            if (attempt < maxRetries) {
                val delayMs = min(initialDelayMs * (2.0).pow(attempt).toLong(), 10000L)
                delay(delayMs)
            }
        }
    }
    return null
}
