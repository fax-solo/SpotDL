package com.sinc.enhanced.ui.screens.playlist

import com.sinc.enhanced.data.remote.DeezerClient
import com.sinc.enhanced.data.remote.SpotifyClient
import com.sinc.enhanced.data.repository.DownloadRepository
import com.sinc.enhanced.data.repository.SearchRepository
import org.junit.Test
import org.junit.Assert.*
import org.mockito.kotlin.mock

class ImportPlaylistViewModelTest {

    @Test
    fun `parsePlaylistUrl with full spotify URL returns ID`() {
        val vm = createViewModel()
        val (source, id) = vm.parsePlaylistUrl("https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M")
        assertEquals("spotify", source)
        assertEquals("37i9dQZF1DXcBWIGoYBM5M", id)
    }

    @Test
    fun `parsePlaylistUrl with spotify URI returns ID`() {
        val vm = createViewModel()
        val (source, id) = vm.parsePlaylistUrl("spotify:playlist:37i9dQZF1DXcBWIGoYBM5M")
        assertEquals("spotify", source)
        assertEquals("37i9dQZF1DXcBWIGoYBM5M", id)
    }

    @Test
    fun `parsePlaylistUrl with bare 22-char ID returns ID`() {
        val vm = createViewModel()
        val (source, id) = vm.parsePlaylistUrl("37i9dQZF1DXcBWIGoYBM5M")
        assertEquals("spotify", source)
        assertEquals("37i9dQZF1DXcBWIGoYBM5M", id)
    }

    @Test
    fun `parsePlaylistUrl with deezer URL returns ID`() {
        val vm = createViewModel()
        val (source, id) = vm.parsePlaylistUrl("https://deezer.com/playlist/123456789")
        assertEquals("deezer", source)
        assertEquals("123456789", id)
    }

    @Test
    fun `parsePlaylistUrl with empty string returns null`() {
        val vm = createViewModel()
        val (_, id) = vm.parsePlaylistUrl("")
        assertNull(id)
    }

    @Test
    fun `parsePlaylistUrl with invalid URL returns null`() {
        val vm = createViewModel()
        val (_, id) = vm.parsePlaylistUrl("https://example.com/not-a-playlist")
        assertNull(id)
    }

    @Test
    fun `parsePlaylistUrl with invalid length bare ID returns null`() {
        val vm = createViewModel()
        val (_, id) = vm.parsePlaylistUrl("abc123")
        assertNull(id)
    }

    @Test
    fun `parsePlaylistUrl with track URL returns null`() {
        val vm = createViewModel()
        val (_, id) = vm.parsePlaylistUrl("https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT")
        assertNull(id)
    }

    private fun createViewModel(): ImportPlaylistViewModel {
        return ImportPlaylistViewModel(
            spotifyClient = mock(),
            deezerClient = mock(),
            searchRepository = mock(),
            downloadRepository = mock()
        )
    }
}
