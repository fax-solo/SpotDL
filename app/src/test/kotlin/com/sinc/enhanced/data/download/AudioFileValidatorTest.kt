package com.sinc.enhanced.data.download

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class AudioFileValidatorTest {

    private fun tempFile(header: ByteArray): File {
        val file = File.createTempFile("audio", ".bin")
        file.deleteOnExit()
        file.writeBytes(header + ByteArray(64) { 0 })
        return file
    }

    @Test
    fun `accepts MPEG frame header`() {
        assertTrue(AudioFileValidator.isValidAudioFile(tempFile(byteArrayOf(0xFF.toByte(), 0xFB.toByte(), 0x90.toByte(), 0x64.toByte()))))
        assertTrue(AudioFileValidator.isValidAudioFile(tempFile(byteArrayOf(0xFF.toByte(), 0xF3.toByte(), 0x90.toByte(), 0x64.toByte()))))
        assertTrue(AudioFileValidator.isValidAudioFile(tempFile(byteArrayOf(0xFF.toByte(), 0xF2.toByte(), 0x90.toByte(), 0x64.toByte()))))
        assertTrue(AudioFileValidator.isValidAudioFile(tempFile(byteArrayOf(0xFF.toByte(), 0xE3.toByte(), 0x90.toByte(), 0x64.toByte()))))
    }

    @Test
    fun `rejects non-MPEG frame headers`() {
        assertFalse(AudioFileValidator.isValidAudioFile(tempFile(byteArrayOf(0xFF.toByte(), 0x00.toByte(), 0x90.toByte(), 0x64.toByte()))))
        assertFalse(AudioFileValidator.isValidAudioFile(tempFile(byteArrayOf(0x00, 0xFB.toByte(), 0x90.toByte(), 0x64.toByte()))))
    }

    @Test
    fun `accepts ID3 tag`() {
        assertTrue(AudioFileValidator.isValidAudioFile(tempFile(byteArrayOf(0x49, 0x44, 0x33, 0x04))))
    }

    @Test
    fun `rejects non-audio files`() {
        assertFalse(AudioFileValidator.isValidAudioFile(tempFile(byteArrayOf(0x89.toByte(), 0x50, 0x4E, 0x47)))) // PNG
        assertFalse(AudioFileValidator.isValidAudioFile(tempFile(byteArrayOf(0x52, 0x49, 0x46, 0x46)))) // RIFF
        assertFalse(AudioFileValidator.isValidAudioFile(tempFile(ByteArray(4))))
    }

    @Test
    fun `returns false for missing or empty file`() {
        assertFalse(AudioFileValidator.isValidAudioFile(File("/nonexistent/audio.mp3")))
        val empty = File.createTempFile("audio", ".bin")
        empty.deleteOnExit()
        assertFalse(AudioFileValidator.isValidAudioFile(empty))
    }
}
