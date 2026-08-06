package com.sinc.enhanced.data.util

import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope

class Semaphore(private val permits: Int) {
    private var available = permits
    private val waiters = mutableListOf<kotlinx.coroutines.CompletableDeferred<Unit>>()

    suspend fun acquire(): Unit = coroutineScope {
        if (available > 0) {
            available--
            return@coroutineScope
        }
        val deferred = kotlinx.coroutines.CompletableDeferred<Unit>()
        waiters.add(deferred)
        try {
            deferred.await()
        } finally {
            waiters.remove(deferred)
        }
    }

    fun release() {
        if (waiters.isNotEmpty()) {
            val next = waiters.removeAt(0)
            next.complete(Unit)
        } else {
            available++
        }
    }

    suspend fun <T> withPermit(action: suspend () -> T): T {
        acquire()
        try {
            return action()
        } finally {
            release()
        }
    }
}

// Global semaphore for limiting concurrent audio resolution requests
// Shared across all callers to prevent overwhelming the backend
object AudioResolutionSemaphore {
    // Max concurrent requests to the audio resolution pipeline
    // This limits total in-flight requests regardless of how many tracks or sources
    val semaphore = Semaphore(12)
}