package com.sinc.enhanced.data.repository

import com.sinc.enhanced.data.local.SettingsManager
import com.sinc.enhanced.data.model.Track
import com.sinc.enhanced.domain.music.SearchResult
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class FakeSearchSource(
    override val name: String,
    override val priority: Int,
    private val results: List<SearchResult> = emptyList(),
    private val enabled: Boolean = true,
    private val onSearch: (suspend () -> List<SearchResult>)? = null
) : SearchSource {
    var searchCalls = 0

    override suspend fun search(query: String): List<SearchResult> {
        searchCalls++
        return onSearch?.invoke() ?: results
    }

    override fun searchStreaming(query: String): Flow<List<SearchResult>> = flowOf(results)

    override suspend fun isEnabled(settingsManager: SettingsManager): Boolean = enabled
}

class SearchSourceOrchestratorTest {

    private fun track(id: String, title: String, artist: String = "Artist") =
        Track(id = id, title = title, artist = artist, album = "Album", source = "test")

    private fun result(track: Track, confidence: Float) =
        SearchResult(track, audioUrl = null, audioSource = null, confidence = confidence)

    private val settings = SettingsManager(FakeDataStore())

    @Test
    fun `empty query returns empty list without calling sources`() = runBlocking {
        val spotify = FakeSearchSource("spotify", 1)
        val orchestrator = SearchSourceOrchestrator(listOf(spotify), settings)
        assertTrue(orchestrator.searchAll("   ").isEmpty())
        assertEquals(0, spotify.searchCalls)
    }

    @Test
    fun `primary sources always run`() = runBlocking {
        val spotify = FakeSearchSource("spotify", 1, listOf(result(track("1", "Song"), 1.0f)))
        val deezer = FakeSearchSource("deezer", 2, listOf(result(track("2", "Other"), 0.7f)))
        val orchestrator = SearchSourceOrchestrator(listOf(spotify, deezer), settings)
        val results = orchestrator.searchAll("query")
        assertEquals(2, results.size)
        assertEquals(1, spotify.searchCalls)
        assertEquals(1, deezer.searchCalls)
    }

    @Test
    fun `secondary and fallback tiers skipped when primary results are enough`() = runBlocking {
        val spotify = FakeSearchSource(
            "spotify", 1,
            (1..6).map { result(track("s$it", "Song $it"), 1.0f) }
        )
        val piped = FakeSearchSource("piped", 3, listOf(result(track("p", "Piped"), 0.9f)))
        val fallback = FakeSearchSource("soundcloud", 4, listOf(result(track("f", "Fallback"), 0.5f)))
        val orchestrator = SearchSourceOrchestrator(listOf(spotify, piped, fallback), settings)
        val results = orchestrator.searchAll("query")
        assertEquals(6, results.size)
        assertEquals(0, piped.searchCalls)
        assertEquals(0, fallback.searchCalls)
    }

    @Test
    fun `secondary tier runs when primary results are thin`() = runBlocking {
        val spotify = FakeSearchSource(
            "spotify", 1,
            (1..2).map { result(track("s$it", "Song $it"), 1.0f) }
        )
        val piped = FakeSearchSource(
            "piped", 3,
            (1..5).map { result(track("p$it", "Piped $it"), 0.9f) }
        )
        val fallback = FakeSearchSource("soundcloud", 4, listOf(result(track("f", "Fallback"), 0.5f)))
        val orchestrator = SearchSourceOrchestrator(listOf(spotify, piped, fallback), settings)
        val results = orchestrator.searchAll("query")
        assertEquals(7, results.size)
        assertEquals(1, piped.searchCalls)
        assertEquals(0, fallback.searchCalls)
    }

    @Test
    fun `fallback tier runs when everything above came up short`() = runBlocking {
        val spotify = FakeSearchSource("spotify", 1, listOf(result(track("s", "Song"), 1.0f)))
        val piped = FakeSearchSource("piped", 3, listOf(result(track("p", "Piped"), 0.9f)))
        val fallback = FakeSearchSource(
            "soundcloud", 4,
            (1..4).map { result(track("f$it", "Fallback $it"), 0.5f) }
        )
        val orchestrator = SearchSourceOrchestrator(listOf(spotify, piped, fallback), settings)
        val results = orchestrator.searchAll("query")
        assertEquals(6, results.size)
        assertEquals(1, fallback.searchCalls)
    }

    @Test
    fun `disabled sources are not invoked`() = runBlocking {
        val spotify = FakeSearchSource("spotify", 1, listOf(result(track("s", "Song"), 1.0f)), enabled = true)
        val jamendo = FakeSearchSource("jamendo", 4, listOf(result(track("j", "Jamendo"), 0.5f)), enabled = false)
        val orchestrator = SearchSourceOrchestrator(listOf(spotify, jamendo), settings)
        orchestrator.searchAll("query")
        assertEquals(0, jamendo.searchCalls)
    }

    @Test
    fun `results are deduped by id`() = runBlocking {
        val duplicate = result(track("same-id", "Title"), 1.0f)
        val spotify = FakeSearchSource("spotify", 1, listOf(duplicate))
        val deezer = FakeSearchSource("deezer", 2, listOf(duplicate))
        val orchestrator = SearchSourceOrchestrator(listOf(spotify, deezer), settings)
        val results = orchestrator.searchAll("query")
        assertEquals(1, results.size)
    }

    @Test
    fun `results are deduped by title and artist`() = runBlocking {
        val a = result(track("id-a", "Same Title", artist = "Artist"), 1.0f)
        val b = result(track("id-b", "same title", artist = "ARTIST"), 0.8f)
        val spotify = FakeSearchSource("spotify", 1, listOf(a))
        val deezer = FakeSearchSource("deezer", 2, listOf(b))
        val orchestrator = SearchSourceOrchestrator(listOf(spotify, deezer), settings)
        val results = orchestrator.searchAll("query")
        assertEquals(1, results.size)
    }

    @Test
    fun `results are sorted by confidence descending`() = runBlocking {
        val low = result(track("low", "Low"), 0.3f)
        val high = result(track("high", "High"), 0.95f)
        val mid = result(track("mid", "Mid"), 0.6f)
        val spotify = FakeSearchSource("spotify", 1, listOf(low, high, mid))
        val orchestrator = SearchSourceOrchestrator(listOf(spotify), settings)
        val results = orchestrator.searchAll("query")
        assertEquals(listOf("high", "mid", "low"), results.map { it.track.id })
    }

    @Test
    fun `failing source does not break other sources`() = runBlocking {
        val broken = FakeSearchSource("spotify", 1, onSearch = { throw RuntimeException("boom") })
        val deezer = FakeSearchSource("deezer", 2, listOf(result(track("d", "Deezer"), 0.7f)))
        val orchestrator = SearchSourceOrchestrator(listOf(broken, deezer), settings)
        val results = orchestrator.searchAll("query")
        assertEquals(1, results.size)
        assertEquals("d", results[0].track.id)
    }

    @Test
    fun `empty results from all sources returns empty`() = runBlocking {
        val spotify = FakeSearchSource("spotify", 1, emptyList())
        val deezer = FakeSearchSource("deezer", 2, emptyList())
        val orchestrator = SearchSourceOrchestrator(listOf(spotify, deezer), settings)
        assertTrue(orchestrator.searchAll("query").isEmpty())
    }
}
