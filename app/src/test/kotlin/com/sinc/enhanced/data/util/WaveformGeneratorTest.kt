package com.sinc.enhanced.data.util

import org.junit.Assert.assertEquals
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class WaveformGeneratorTest {

@Test
    fun `hash is deterministic and matches the TS reference`() {
        assertEquals(3177349983u, hashTrackId("trackid123").toUInt())
    }

    @Test
    fun `generate determines the same bars as the TS reference`() {
        // Golden values computed from frontend/src/lib/waveform.ts (generateWaveform).
        val expected = floatArrayOf(0.113051f, 0.296303f, 0.283162f, 0.080000f)
        val actual = generateWaveform("trackid123", 4)
        assertArrayEquals(expected, actual, 1e-6f)
    }

    @Test
    fun `generate is deterministic per track id`() {
        val a = generateWaveform("track:123", 12)
        val b = generateWaveform("track:123", 12)
        assertArrayEquals(a, b, 0f)
    }

    @Test
    fun `different track ids produce different waveforms`() {
        assertTrue(
            generateWaveform("a", 6).contentToString() != generateWaveform("b", 6).contentToString()
        )
    }

    @Test
    fun `bars stay within the designed range`() {
        val bars = generateWaveform("anything", 400)
        assertTrue(bars.all { it in 0.08f..1f })
    }

    @Test
    fun `loading waveform is symmetric across the mid bar`() {
        val bars = loadingWaveform(5)
        assertEquals(bars[0], bars[4], 1e-6f)
        assertEquals(bars[1], bars[3], 1e-6f)
    }
}
