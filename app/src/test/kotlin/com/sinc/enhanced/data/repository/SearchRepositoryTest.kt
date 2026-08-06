package com.sinc.enhanced.data.repository

import com.sinc.enhanced.data.audio.AudioResolverPipeline
import com.sinc.enhanced.data.local.dao.CacheDao
import com.sinc.enhanced.data.model.Track
import com.sinc.enhanced.data.remote.PipedClient
import com.sinc.enhanced.data.remote.SpotifyClient
import com.sinc.enhanced.domain.music.SearchResult
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.mockito.kotlin.mock
import org.mockito.kotlin.whenever

class SearchRepositoryTest {

    private lateinit var spotifyClient: SpotifyClient
    private lateinit var pipedClient: PipedClient
    private lateinit var cacheDao: CacheDao
    private lateinit var pipeline: AudioResolverPipeline
    private lateinit var orchestrator: SearchSourceOrchestrator
    private lateinit var repo: SearchRepository

    @Before
    fun setUp() {
        spotifyClient = mock()
        pipedClient = mock()
        cacheDao = mock()
        pipeline = mock()
        orchestrator = mock()
        repo = SearchRepository(spotifyClient, pipedClient, cacheDao, pipeline, orchestrator)
    }

    private fun track(id: String) = Track(id = id, title = "Title", artist = "Artist", album = "Album")

    @Test
    fun `classifyQuery detects artist prefixes`() {
        assertEquals(QueryType.ARTIST, repo.classifyQuery("artist metallica"))
        assertEquals(QueryType.ARTIST, repo.classifyQuery("singer Adele"))
        assertEquals(QueryType.ARTIST, repo.classifyQuery("Artist Metallica"))
    }

    @Test
    fun `classifyQuery detects album prefix`() {
        assertEquals(QueryType.ALBUM, repo.classifyQuery("album abbey road"))
    }

    @Test
    fun `classifyQuery detects track pattern`() {
        assertEquals(QueryType.TRACK, repo.classifyQuery("song by artist"))
        assertEquals(QueryType.TRACK, repo.classifyQuery("song by"))
        assertEquals(QueryType.TRACK, repo.classifyQuery("let it be"))
    }

    @Test
    fun `classifyQuery treats short queries as artist`() {
        assertEquals(QueryType.ARTIST, repo.classifyQuery("two words"))
        assertEquals(QueryType.ARTIST, repo.classifyQuery("drake"))
    }

    @Test
    fun `classifyQuery falls back to generic`() {
        assertEquals(QueryType.GENERIC, repo.classifyQuery("a longer generic phrase"))
        assertEquals(QueryType.ARTIST, repo.classifyQuery(""))
        assertEquals(QueryType.ARTIST, repo.classifyQuery("   "))
    }

    @Test
    fun `searchAll delegates to orchestrator`() = runBlocking {
        val results = listOf(SearchResult(track("t1"), "https://audio", "youtube", 0.9f))
        whenever(orchestrator.searchAll("query")).thenReturn(results)

        val out = repo.searchAll("query")
        assertEquals(1, out.size)
        assertEquals("t1", out[0].track.id)
        assertEquals("https://audio", out[0].audioUrl)
        assertEquals("youtube", out[0].audioSource)
        assertEquals(0.9f, out[0].confidence)
    }

    @Test
    fun `searchAll propagates orchestrator failure for upstream handling`() = runBlocking {
        whenever(orchestrator.searchAll("query")).thenThrow(RuntimeException("boom"))
        try {
            repo.searchAll("query")
            throw AssertionError("expected exception to propagate")
        } catch (e: RuntimeException) {
            assertEquals("boom", e.message)
        }
    }

    @Test
    fun `getTrack delegates to spotify client`() = runBlocking {
        val track = track("t1")
        whenever(spotifyClient.getTrack("t1")).thenReturn(track)
        assertNotNull(repo.getTrack("t1"))
        assertEquals("t1", repo.getTrack("t1")!!.id)
    }

    @Test
    fun `getTrack returns null when spotify returns null`() = runBlocking {
        whenever(spotifyClient.getTrack("missing")).thenReturn(null)
        assertNull(repo.getTrack("missing"))
    }

    @Test
    fun `getTrack returns null when spotify throws`() = runBlocking {
        whenever(spotifyClient.getTrack("broken")).thenThrow(RuntimeException("boom"))
        assertNull(repo.getTrack("broken"))
    }
}
