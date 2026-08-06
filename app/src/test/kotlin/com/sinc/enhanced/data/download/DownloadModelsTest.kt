package com.sinc.enhanced.data.download

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class DownloadModelsTest {

    @Test
    fun `download request carries track metadata`() {
        val request = DownloadRequest(
            trackId = "t1", title = "Song", artist = "Artist",
            album = "Album", source = "spotify"
        )
        assertEquals("t1", request.trackId)
        assertEquals("Song", request.title)
        assertEquals("Artist", request.artist)
        assertEquals("Album", request.album)
        assertEquals("spotify", request.source)
    }

    @Test
    fun `download request allows null album`() {
        val request = DownloadRequest("t1", "Song", "Artist", null, "youtube")
        assertNull(request.album)
    }

    @Test
    fun `downloaded file carries path bytes and mime`() {
        val file = DownloadedFile(path = "/music/song.mp3", bytes = 12345, mimeType = "audio/mpeg")
        assertEquals("/music/song.mp3", file.path)
        assertEquals(12345L, file.bytes)
        assertEquals("audio/mpeg", file.mimeType)
    }
}
