package com.sinc.enhanced.data.remote

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Test
import org.junit.Assert.*

class SpotifyClientTest {

    private fun toMap(obj: JSONObject): Map<String, Any?> {
        val map = mutableMapOf<String, Any?>()
        for (key in obj.keys()) {
            val value = obj.get(key)
            map[key] = when (value) {
                is JSONObject -> toMap(value)
                is JSONArray -> (0 until value.length()).map { i ->
                    val el = value.get(i)
                    when (el) {
                        is JSONObject -> toMap(el)
                        is JSONArray -> (0 until (el as JSONArray).length()).map { j -> (el as JSONArray).get(j) }
                        else -> el
                    }
                }
                else -> value
            }
        }
        return map
    }

    @Test
    fun `toMap with nested objects converts to nested Maps`() {
        val json = JSONObject()
        json.put("track", JSONObject().apply {
            put("id", "123")
            put("name", "Test")
        })
        val result = toMap(json)
        val track = result["track"]
        assertTrue("track should be a Map", track is Map<*, *>)
        @Suppress("UNCHECKED_CAST")
        val trackMap = track as Map<String, Any?>
        assertEquals("123", trackMap["id"])
        assertEquals("Test", trackMap["name"])
    }

    @Test
    fun `toMap with JSONArray of JSONObjects becomes List of Maps`() {
        val json = JSONObject()
        json.put("items", JSONArray().apply {
            put(JSONObject().apply { put("name", "Item1") })
            put(JSONObject().apply { put("name", "Item2") })
        })
        val result = toMap(json)
        val items = result["items"]
        assertTrue("items should be a List", items is List<*>)
        @Suppress("UNCHECKED_CAST")
        val itemsList = items as List<Map<String, Any?>>
        assertEquals(2, itemsList.size)
        assertEquals("Item1", itemsList[0]["name"])
        assertEquals("Item2", itemsList[1]["name"])
    }

    @Test
    fun `toMap with empty object returns empty map`() {
        val json = JSONObject()
        val result = toMap(json)
        assertTrue("Empty JSONObject should produce empty map", result.isEmpty())
    }

    @Test
    fun `toMap with primitives passes through unchanged`() {
        val json = JSONObject().apply {
            put("string", "hello")
            put("int", 42)
            put("double", 3.14)
            put("boolean", true)
        }
        val result = toMap(json)
        assertEquals("hello", result["string"])
        assertEquals(42, result["int"])
        assertEquals(3.14, result["double"])
        assertEquals(true, result["boolean"])
    }

    @Test
    fun `toMap preserves JSONObject NULL`() {
        val json = JSONObject().apply {
            put("key", JSONObject.NULL)
        }
        val result = toMap(json)
        assertTrue("key should be present", result.containsKey("key"))
        assertSame("value should be JSONObject.NULL", JSONObject.NULL, result["key"])
    }

    @Test
    fun `toMap with deeply nested structure`() {
        val json = JSONObject().apply {
            put("album", JSONObject().apply {
                put("name", "Album")
                put("artists", JSONArray().apply {
                    put(JSONObject().apply { put("name", "Artist1") })
                })
            })
        }
        val result = toMap(json)
        @Suppress("UNCHECKED_CAST")
        val album = result["album"] as Map<String, Any?>
        assertEquals("Album", album["name"])
        @Suppress("UNCHECKED_CAST")
        val artists = album["artists"] as List<Map<String, Any?>>
        assertEquals("Artist1", artists[0]["name"])
    }
}
