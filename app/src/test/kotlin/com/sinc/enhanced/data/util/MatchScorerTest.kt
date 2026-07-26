package com.sinc.enhanced.data.util

import org.junit.Test
import org.junit.Assert.*

class MatchScorerTest {
    @Test
    fun `computeScore with exact artist and title match returns high score`() {
        val score = MatchScorer.computeScore(MatchScorer.MatchOptions(
            expectedTitle = "Blinding Lights",
            expectedArtist = "The Weeknd",
            foundTitle = "Blinding Lights",
            foundAuthor = "The Weeknd"
        ))
        assertTrue("Exact match should score >= 0.8, got $score", score >= 0.8f)
    }

    @Test
    fun `computeScore with title match only returns medium score`() {
        val score = MatchScorer.computeScore(MatchScorer.MatchOptions(
            expectedTitle = "Blinding Lights",
            expectedArtist = "The Weeknd",
            foundTitle = "Blinding Lights",
            foundAuthor = "Some Other Artist"
        ))
        assertTrue("Title-only match should be below 0.7, got $score", score < 0.7f)
        assertTrue("Title-only match should be above 0.2, got $score", score > 0.2f)
    }

    @Test
    fun `computeScore with duration match applies bonus`() {
        val withoutDuration = MatchScorer.computeScore(MatchScorer.MatchOptions(
            expectedTitle = "Blinding Lights",
            expectedArtist = "The Weeknd",
            foundTitle = "Blinding Something",
            foundAuthor = "The Weeknd"
        ))
        val withDuration = MatchScorer.computeScore(MatchScorer.MatchOptions(
            expectedTitle = "Blinding Lights",
            expectedArtist = "The Weeknd",
            foundTitle = "Blinding Something",
            foundAuthor = "The Weeknd",
            expectedDurationSec = 200,
            foundDurationSec = 200
        ))
        assertTrue("Duration should increase score, without=$withoutDuration with=$withDuration", withDuration > withoutDuration)
    }

    @Test
    fun `computeScore with completely unrelated returns low score`() {
        val score = MatchScorer.computeScore(MatchScorer.MatchOptions(
            expectedTitle = "Blinding Lights",
            expectedArtist = "The Weeknd",
            foundTitle = "Never Gonna Give You Up",
            foundAuthor = "Rick Astley"
        ))
        assertTrue("Unrelated match should be below 0.3, got $score", score < 0.3f)
    }

    @Test
    fun `stripQueryNoise removes common words`() {
        val result = MatchScorer.stripQueryNoise("Song Name (Official Video) feat Artist")
        assertEquals("Song Name Artist", result)
    }

    @Test
    fun `empty title returns 0`() {
        val score = MatchScorer.computeScore(MatchScorer.MatchOptions(
            expectedTitle = "",
            expectedArtist = "Artist",
            foundTitle = "Anything",
            foundAuthor = "Anyone"
        ))
        assertEquals(0f, score, 0.001f)
    }

    @Test
    fun `normalize handles brackets and special chars`() {
        val result = MatchScorer.normalize("Hello (Remix) [2024] <HD>")
        assertFalse(result.contains("("))
        assertFalse(result.contains("["))
        assertFalse(result.contains("<"))
    }

    @Test
    fun `computeScore with ISRC match gets very high score`() {
        val score = MatchScorer.computeScore(MatchScorer.MatchOptions(
            expectedTitle = "Blinding Lights",
            expectedArtist = "The Weeknd",
            foundTitle = "Blinding Lights (Different Version)",
            foundAuthor = "The Weeknd",
            expectedIsrc = "USUM71902934",
            foundIsrc = "USUM71902934"
        ))
        assertTrue("ISRC match should score >= 0.9, got $score", score >= 0.9f)
    }
}
