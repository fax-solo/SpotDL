package com.sinc.enhanced.data.util

import java.util.LinkedList

class SearchCache<T>(private val maxSize: Int = 20) {

    private data class Entry<T>(
        val results: List<T>,
        val timestamp: Long
    )

    private val map = LinkedHashMap<String, Entry<T>>(maxSize, 0.75f, true)
    private val order = LinkedList<String>()

    @Synchronized
    fun get(query: String): List<T>? {
        val entry = map[normalize(query)] ?: return null
        if (System.currentTimeMillis() - entry.timestamp > 300_000L) {
            map.remove(normalize(query))
            return null
        }
        return entry.results
    }

    @Synchronized
    fun put(query: String, results: List<T>) {
        val key = normalize(query)
        if (map.size >= maxSize) {
            val oldest = order.pollFirst()
            if (oldest != null) map.remove(oldest)
        }
        map[key] = Entry(results, System.currentTimeMillis())
        order.add(key)
    }

    @Synchronized
    fun invalidateAll() {
        map.clear()
        order.clear()
    }

    private fun normalize(query: String) = query.lowercase().trim()
}
