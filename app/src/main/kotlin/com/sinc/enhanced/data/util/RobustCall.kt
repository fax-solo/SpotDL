package com.sinc.enhanced.data.util

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import kotlin.math.min
import kotlin.math.pow

suspend fun <T> robustCall(
    maxRetries: Int = 2,
    initialDelayMs: Long = 500,
    timeoutMs: Long = 12000,
    label: String = "",
    block: suspend () -> T?
): T? {
    var lastError: String? = null
    for (attempt in 0..maxRetries) {
        if (!currentCoroutineContext().isActive) return null
        try {
            val result = withTimeout(timeoutMs) {
                withContext(Dispatchers.IO) { block() }
            }
            if (result != null) return result
            lastError = "null result"
        } catch (e: CancellationException) { throw e }
        catch (e: Exception) {
            lastError = e.message ?: e.javaClass.simpleName
        }
        if (attempt < maxRetries) {
            val delayMs = min(initialDelayMs * (2.0).pow(attempt).toLong(), 5000L)
            delay(delayMs)
        }
    }
    return null
}
