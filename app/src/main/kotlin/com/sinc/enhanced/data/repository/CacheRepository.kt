package com.sinc.enhanced.data.repository

import android.content.Context
import com.sinc.enhanced.data.local.CacheManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.io.FileOutputStream

class CacheRepository(
    private val context: Context,
    private val cacheManager: CacheManager,
    private val okHttpClient: OkHttpClient
) {

    private val cacheDir = File(context.cacheDir, "audio_cache")
    private val metadataDir = File(context.cacheDir, "audio_cache_meta")

    init {
        cacheDir.mkdirs()
        metadataDir.mkdirs()
    }

    fun getCacheDir(): File = cacheDir

    suspend fun getCachedAudioPath(trackId: String): String? = withContext(Dispatchers.IO) {
        val file = File(cacheDir, sanitizeFileName(trackId) + ".mp3")
        if (file.exists() && file.length() > 0) file.absolutePath else null
    }

    suspend fun cacheAudio(trackId: String, url: String): Boolean = withContext(Dispatchers.IO) {
        try {
            val request = Request.Builder().url(url).build()
            val response = okHttpClient.newCall(request).execute()
            response.use { resp ->
                if (!resp.isSuccessful) return@withContext false
                val body = resp.body ?: return@withContext false
                val outputFile = File(cacheDir, sanitizeFileName(trackId) + ".mp3")
                val tempFile = File(cacheDir, sanitizeFileName(trackId) + ".tmp")
                FileOutputStream(tempFile).use { output ->
                    body.byteStream().use { input ->
                        input.copyTo(output)
                    }
                }
                tempFile.renameTo(outputFile)
                saveMetadata(trackId, url)
                enforceCacheSizeLimit()
                true
            }
        } catch (_: Exception) {
            false
        }
    }

    suspend fun removeCachedAudio(trackId: String): Boolean = withContext(Dispatchers.IO) {
        val file = File(cacheDir, sanitizeFileName(trackId) + ".mp3")
        val metaFile = File(metadataDir, sanitizeFileName(trackId) + ".json")
        file.delete()
        metaFile.delete()
    }

    suspend fun clearAllCache(): Int = withContext(Dispatchers.IO) {
        var count = 0
        cacheDir.listFiles()?.forEach { it.delete(); count++ }
        metadataDir.listFiles()?.forEach { it.delete() }
        count
    }

    suspend fun getCacheSize(): Long = withContext(Dispatchers.IO) {
        cacheDir.listFiles()?.sumOf { it.length() } ?: 0L
    }

    suspend fun getCachedTrackCount(): Int = withContext(Dispatchers.IO) {
        cacheDir.listFiles()?.count { it.extension == "mp3" } ?: 0
    }

    suspend fun isTrackCached(trackId: String): Boolean = withContext(Dispatchers.IO) {
        File(cacheDir, sanitizeFileName(trackId) + ".mp3").exists()
    }

    suspend fun preCacheNextTrack(trackId: String, url: String) = withContext(Dispatchers.IO) {
        cacheAudio(trackId, url)
    }

    private fun saveMetadata(trackId: String, url: String) {
        val metaFile = File(metadataDir, sanitizeFileName(trackId) + ".json")
        val metadata = """{"trackId": "$trackId", "url": "$url", "cachedAt": ${System.currentTimeMillis()}}"""
        metaFile.writeText(metadata)
    }

    private suspend fun enforceCacheSizeLimit() {
        val maxSizeMb = cacheManager.cacheMaxSizeMb.first()
        val maxBytes = maxSizeMb.toLong() * 1024L * 1024L
        val currentSize = getCacheSize()
        if (currentSize > maxBytes) {
            val files = cacheDir.listFiles()?.filter { it.extension == "mp3" }?.sortedBy { it.lastModified() } ?: emptyList()
            var size = currentSize
            for (file in files) {
                if (size <= maxBytes) break
                val trackId = file.nameWithoutExtension
                val metaFile = File(metadataDir, sanitizeFileName(trackId) + ".json")
                size -= file.length()
                file.delete()
                metaFile.delete()
            }
        }
    }

    private fun sanitizeFileName(name: String): String {
        return name.replace(Regex("""[\\/:*?"<>|]"""), "_").trim().take(200)
    }
}