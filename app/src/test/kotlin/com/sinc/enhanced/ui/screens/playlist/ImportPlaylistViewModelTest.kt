package com.sinc.enhanced.ui.screens.playlist

import com.sinc.enhanced.data.remote.SpotifyClient
import com.sinc.enhanced.data.repository.DownloadRepository
import com.sinc.enhanced.data.repository.SearchRepository
import org.junit.Test
import org.junit.Assert.*
import org.mockito.kotlin.mock

class ImportPlaylistViewModelTest {

    @Test
    fun `parsePlaylistId with full spotify URL returns ID`() {
        val vm = createViewModel()
        val id = vm.parsePlaylistId("https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M")
        assertEquals("37i9dQZF1DXcBWIGoYBM5M", id)
    }

    @Test
    fun `parsePlaylistId with URL without www returns ID`() {
        val vm = createViewModel()
        val id = vm.parsePlaylistId("https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M")
        assertEquals("37i9dQZF1DXcBWIGoYBM5M", id)
    }

    @Test
    fun `parsePlaylistId with spotify URI returns ID`() {
        val vm = createViewModel()
        val id = vm.parsePlaylistId("spotify:playlist:37i9dQZF1DXcBWIGoYBM5M")
        assertEquals("37i9dQZF1DXcBWIGoYBM5M", id)
    }

    @Test
    fun `parsePlaylistId with bare 22-char ID returns ID`() {
        val vm = createViewModel()
        val id = vm.parsePlaylistId("37i9dQZF1DXcBWIGoYBM5M")
        assertEquals("37i9dQZF1DXcBWIGoYBM5M", id)
    }

    @Test
    fun `parsePlaylistId with empty string returns null`() {
        val vm = createViewModel()
        assertNull(vm.parsePlaylistId(""))
    }

    @Test
    fun `parsePlaylistId with invalid URL returns null`() {
        val vm = createViewModel()
        assertNull(vm.parsePlaylistId("https://example.com/not-a-playlist"))
    }

    @Test
    fun `parsePlaylistId with invalid length bare ID returns null`() {
        val vm = createViewModel()
        assertNull(vm.parsePlaylistId("abc123"))
    }

    @Test
    fun `parsePlaylistId with spotifycom without dot returns null`() {
        val vm = createViewModel()
        assertNull(vm.parsePlaylistId("spotifycom/playlist/123"))
    }

    @Test
    fun `parsePlaylistId with track URL returns null`() {
        val vm = createViewModel()
        assertNull(vm.parsePlaylistId("https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT"))
    }

    private fun createViewModel(): ImportPlaylistViewModel {
        return ImportPlaylistViewModel(
            spotifyClient = mock(),
            searchRepository = mock(),
            downloadRepository = mock()
        )
    }
}
