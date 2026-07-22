package com.sinc.enhanced.data.repository

import android.content.ContentValues
import android.content.Context
import android.media.MediaScannerConnection
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import com.sinc.enhanced.data.local.dao.DownloadDao
import com.sinc.enhanced.data.local.dao.HistoryDao
import com.sinc.enhanced.data.local.entity.DownloadEntity
import com.sinc.enhanced.data.local.entity.HistoryEntity
import com.sinc.enhanced.data.model.Track
import com.sinc.enhanced.data.util.robustCall
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.io.FileOutputStream

class DownloadRepository(
    private val context: Context,
    private val downloadDao: DownloadDao,
    private val historyDao: HistoryDao,
    private val okHttpClient: OkHttpClient,
    private val findAudioUrl: suspend (Track) -> Pair<String, String>?
) {

    val allDownloads: Flow<List<DownloadEntity>> = downloadDao.getAllDownloads()
    val activeDownloads: Flow<List<DownloadEntity>> = downloadDao.getActiveDownloads()
    val completedDownloads: Flow<List<DownloadEntity>> = downloadDao.getCompletedDownloads()

    suspend fun addToQueue(track: Track, audioUrl: String) {
        val existing = downloadDao.getDownload(track.id)
        if (existing != null && existing.status != "error") return

        downloadDao.upsert(
            DownloadEntity(
                trackId = track.id,
                title = track.title,
                artist = track.artist,
                album = track.album,
                artworkUrl = track.artworkUrl,
                durationMs = track.durationMs,
                isrc = track.isrc,
                source = track.source,
                streamUrl = audioUrl,
                status = "queued"
            )
        )
    }

    suspend fun removeFromQueue(trackId: String) {
        downloadDao.delete(trackId)
    }

    suspend fun clearAll() {
        downloadDao.deleteAll()
    }

    private fun hasEnoughSpace(file: File, requiredBytes: Long): Boolean {
        val usable = file.parentFile?.freeSpace ?: return true
        return usable > requiredBytes + (10 * 1024 * 1024)
    }

    private suspend fun isValidAudioUrl(url: String): Boolean = withContext(Dispatchers.IO) {
        try {
            val request = Request.Builder().url(url).method("HEAD", null).build()
            val response = okHttpClient.newCall(request).execute()
            response.use { resp ->
                if (!resp.isSuccessful) return@use false
                val contentType = resp.header("Content-Type", "")
                if (contentType?.startsWith("audio/") == true) return@use true
                if (url.contains("googlevideo.com") || url.contains("youtube")) return@use true
                contentType.isNullOrEmpty() || contentType.startsWith("application/octet-stream")
            }
        } catch (_: Exception) { false }
    }

    private fun isValidAudioFile(file: File): Boolean {
        return try {
            val magic = file.readBytes().take(4)
            val u0 = magic[0].toInt() and 0xFF
            val u1 = magic[1].toInt() and 0xFF
            val u2 = magic[2].toInt() and 0xFF
            val u3 = magic[3].toInt() and 0xFF
            (u0 == 0xFF && (u1 == 0xFB || u1 == 0xF3 || u1 == 0xF2 || u1 == 0xE3)) ||
            (u0 == 0x49 && u1 == 0x44 && u2 == 0x33)
        } catch (_: Exception) { false }
    }

    suspend fun downloadFile(trackId: String, onProgress: (Float) -> Unit): Boolean = withContext(Dispatchers.IO) {
        val download = downloadDao.getDownload(trackId) ?: return@withContext false

        downloadDao.updateStatus(trackId, "downloading", 0f)

        var url = download.streamUrl
        var usedSource = download.source

        for (attempt in 1..3) {
            if (url == null || url.isBlank()) {
                val track = Track(
                    id = download.trackId,
                    title = download.title,
                    artist = download.artist,
                    album = download.album,
                    artworkUrl = download.artworkUrl,
                    durationMs = download.durationMs,
                    isrc = download.isrc,
                    source = download.source
                )
                val resolved = findAudioUrl(track)
                if (resolved != null) {
                    url = resolved.first
                    usedSource = resolved.second
                } else {
                    downloadDao.markError(trackId, "No audio URL available")
                    return@withContext false
                }
            }

            if (!isValidAudioUrl(url)) {
                url = null
                if (attempt < 3) {
                    downloadDao.updateStatus(trackId, "queued", 0f)
                    delay(2000L * attempt)
                }
                continue
            }

            val result = tryDownload(url, usedSource, download, onProgress)
            if (result != null) {
                downloadDao.markComplete(trackId, result.first, result.second)
                return@withContext true
            }

            url = null

            if (attempt < 3) {
                downloadDao.updateStatus(trackId, "queued", 0f)
                delay(2000L * attempt)
            }
        }

        downloadDao.markError(trackId, "All retries exhausted")
        false
    }

    private suspend fun tryDownload(
        url: String,
        source: String,
        download: DownloadEntity,
        onProgress: (Float) -> Unit
    ): Pair<String, Long>? {
        return try {
            val request = Request.Builder().url(url).build()
            val response = okHttpClient.newCall(request).execute()

            response.use { resp ->
                if (!resp.isSuccessful) return@use null

                val body = resp.body ?: return@use null
                val contentLength = body.contentLength()

                val fileName = "${sanitizeFileName(download.artist)} - ${sanitizeFileName(download.title)}.mp3"
                val downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MUSIC)
                val appDir = File(downloadsDir, "Sinc Enhanced")
                if (!appDir.exists()) appDir.mkdirs()

                val outputFile = File(appDir, fileName)
                val tempFile = File(appDir, "${fileName}.tmp")

                if (outputFile.exists()) outputFile.delete()
                if (tempFile.exists()) tempFile.delete()

                if (contentLength > 0 && !hasEnoughSpace(outputFile, contentLength)) {
                    downloadDao.markError(download.trackId, "Insufficient storage space")
                    return@use null
                }

                var bytesRead: Long = 0
                val buffer = ByteArray(8192)
                var read: Int

                FileOutputStream(tempFile).use { output ->
                    while (body.byteStream().read(buffer).also { read = it } != -1) {
                        output.write(buffer, 0, read)
                        bytesRead += read
                        if (contentLength > 0) {
                            val progress = (bytesRead.toFloat() / contentLength.toFloat()).coerceIn(0f, 1f)
                            onProgress(progress)
                        }
                    }
                }

                if (bytesRead == 0L) {
                    tempFile.delete()
                    return@use null
                }

                if (!isValidAudioFile(tempFile)) {
                    tempFile.delete()
                    downloadDao.markError(download.trackId, "Downloaded file is not valid audio")
                    return@use null
                }

                tempFile.renameTo(outputFile)

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    val values = ContentValues().apply {
                        put(MediaStore.Audio.Media.DISPLAY_NAME, fileName)
                        put(MediaStore.Audio.Media.MIME_TYPE, "audio/mpeg")
                        put(MediaStore.Audio.Media.ARTIST, download.artist)
                        put(MediaStore.Audio.Media.TITLE, download.title)
                        put(MediaStore.Audio.Media.ALBUM, download.album)
                        put(MediaStore.Audio.Media.RELATIVE_PATH, "Music/Sinc Enhanced")
                        put(MediaStore.Audio.Media.IS_MUSIC, true)
                    }
                    context.contentResolver.insert(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, values)
                } else {
                    MediaScannerConnection.scanFile(context, arrayOf(outputFile.absolutePath), null, null)
                }

                historyDao.insert(
                    HistoryEntity(
                        trackId = download.trackId,
                        title = download.title,
                        artist = download.artist,
                        album = download.album,
                        artworkUrl = download.artworkUrl,
                        durationMs = download.durationMs,
                        source = download.source,
                        filePath = outputFile.absolutePath
                    )
                )

                Pair(outputFile.absolutePath, bytesRead)
            }
        } catch (_: Exception) { null }
    }

    suspend fun retryDownload(trackId: String) {
        val download = downloadDao.getDownload(trackId) ?: return
        downloadDao.upsert(download.copy(status = "queued", errorMessage = null, progress = 0f))
    }

    private fun sanitizeFileName(name: String): String {
        return name.replace(Regex("""[\\/:*?"<>|]"""), "_").trim().take(200)
    }
}
