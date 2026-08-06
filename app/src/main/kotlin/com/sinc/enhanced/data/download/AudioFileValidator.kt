package com.sinc.enhanced.data.download

object AudioFileValidator {
    fun isValidAudioFile(file: java.io.File): Boolean {
        return try {
            val header = ByteArray(4)
            file.inputStream().use { it.read(header) }
            val u0 = header[0].toInt() and 0xFF
            val u1 = header[1].toInt() and 0xFF
            val u2 = header[2].toInt() and 0xFF
            val u3 = header[3].toInt() and 0xFF
            (u0 == 0xFF && (u1 == 0xFB || u1 == 0xF3 || u1 == 0xF2 || u1 == 0xE3)) ||
            (u0 == 0x49 && u1 == 0x44 && u2 == 0x33)
        } catch (_: Exception) { false }
    }
}
