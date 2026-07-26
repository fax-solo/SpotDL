package com.sinc.enhanced.data.model

import org.junit.Test
import org.junit.Assert.*

class TrackTest {
    @Test
    fun `fromSpotify with valid map returns proper Track`() {
        val map = mapOf<String, Any?>(
            "id" to "123",
            "name" to "Test Song",
            "artists" to listOf(mapOf("name" to "Test Artist")),
            "album" to mapOf(
                "name" to "Test Album",
                "id" to "album1",
                "images" to listOf(mapOf("url" to "https://example.com/art.jpg")),
                "release_date" to "2023"
            ),
            "duration_ms" to 200000,
            "track_number" to 3,
            "disc_number" to 1,
            "external_ids" to mapOf("isrc" to "USABC1234567"),
            "preview_url" to "https://example.com/preview.mp3"
        )
        val track = Track.fromSpotify(map)
        assertNotNull("Track should not be null", track)
        assertEquals("123", track!!.id)
        assertEquals("Test Song", track.title)
        assertEquals("Test Artist", track.artist)
        assertEquals("Test Album", track.album)
        assertEquals("album1", track.albumId)
        assertEquals(200000L, track.durationMs)
        assertEquals("https://example.com/art.jpg", track.artworkUrl)
        assertEquals("USABC1234567", track.isrc)
        assertEquals("https://example.com/preview.mp3", track.previewUrl)
        assertEquals(3, track.trackNumber)
        assertEquals(1, track.discNumber)
        assertEquals(listOf("Test Artist"), track.artists)
        assertEquals(2023, track.releaseYear)
    }

    @Test
    fun `fromSpotify with missing artist field defaults to Unknown`() {
        val map = mapOf<String, Any?>(
            "id" to "123",
            "name" to "Test Song",
            "artists" to null,
            "album" to mapOf("name" to "Test Album")
        )
        val track = Track.fromSpotify(map)
        assertNotNull(track)
        assertEquals("Unknown", track!!.artist)
    }

    @Test
    fun `fromSpotify with null album returns null`() {
        val map = mapOf<String, Any?>(
            "id" to "123",
            "name" to "Test Song",
            "album" to null
        )
        val track = Track.fromSpotify(map)
        assertNull("Track should be null when album is null", track)
    }

    @Test
    fun `fromSpotify with multiple artists populates artists list`() {
        val map = mapOf<String, Any?>(
            "id" to "123",
            "name" to "Test Song",
            "artists" to listOf(
                mapOf("name" to "Artist One"),
                mapOf("name" to "Artist Two")
            ),
            "album" to mapOf("name" to "Test Album")
        )
        val track = Track.fromSpotify(map)
        assertNotNull(track)
        assertEquals(listOf("Artist One", "Artist Two"), track!!.artists)
        assertEquals("Artist One", track.artist)
    }

    @Test
    fun `fromSpotify with missing external_ids makes isrc null`() {
        val map = mapOf<String, Any?>(
            "id" to "123",
            "name" to "Test Song",
            "artists" to listOf(mapOf("name" to "Test Artist")),
            "album" to mapOf("name" to "Test Album")
        )
        val track = Track.fromSpotify(map)
        assertNotNull(track)
        assertNull("isrc should be null when external_ids missing", track!!.isrc)
    }

    @Test
    fun `durationFormatted formats correctly`() {
        val track = Track(
            id = "1",
            title = "Test",
            artist = "Artist",
            album = "Album",
            durationMs = 245000
        )
        assertEquals("4:05", track.durationFormatted)
    }

    @Test
    fun `displayTitle formats as artist - title`() {
        val track = Track(
            id = "1",
            title = "Song",
            artist = "Artist",
            album = "Album"
        )
        assertEquals("Artist - Song", track.displayTitle)
    }
}
