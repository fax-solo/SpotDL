package com.sinc.enhanced.data.repository

import android.content.ContentValues
import android.content.Context
import android.media.MediaScannerConnection
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import com.sinc.enhanced.data.local.SettingsManager
import com.sinc.enhanced.data.local.dao.DownloadDao
import com.sinc.enhanced.data.local.dao.HistoryDao
import com.sinc.enhanced.data.local.entity.DownloadEntity
import com.sinc.enhanced.data.local.entity.HistoryEntity
import com.sinc.enhanced.data.model.Track
import com.sinc.enhanced.data.remote.LyricsClient
import com.sinc.enhanced.data.util.robustCall
import com.sinc.enhanced.domain.repository.DownloadRepository as DownloadRepositoryInterface
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.atomic.AtomicLong

class DownloadRepository(
    private val context: Context,
    private val downloadDao: DownloadDao,
    private val historyDao: HistoryDao,
    private val okHttpClient: OkHttpClient,
    private val findAudioUrl: suspend (Track) -> Pair<String, String>?,
    private val lyricsClient: LyricsClient,
    private val settingsManager: SettingsManager
) : DownloadRepositoryInterface {

    override val allDownloads: Flow<List<DownloadEntity>> = downloadDao.getAllDownloads()
    override val activeDownloads: Flow<List<DownloadEntity>> = downloadDao.getActiveDownloads()
    override val completedDownloads: Flow<List<DownloadEntity>> = downloadDao.getCompletedDownloads()

    override suspend fun addToQueue(track: Track, audioUrl: String) {
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

    override suspend fun addBatchToQueue(tracks: List<Track>, audioUrls: Map<String, String>) {
        val entities = tracks.mapNotNull { track ->
            val url = audioUrls[track.id] ?: track.previewUrl
            audioUrls[track.id]?.let { resolvedUrl ->
                DownloadEntity(
                    trackId = track.id,
                    title = track.title,
                    artist = track.artist,
                    album = track.album,
                    artworkUrl = track.artworkUrl,
                    durationMs = track.durationMs,
                    isrc = track.isrc,
                    source = track.source,
                    streamUrl = resolvedUrl,
                    status = "queued"
                )
            } ?: (track.previewUrl?.let { url ->
                DownloadEntity(
                    trackId = track.id,
                    title = track.title,
                    artist = track.artist,
                    album = track.album,
                    artworkUrl = track.artworkUrl,
                    durationMs = track.durationMs,
                    isrc = track.isrc,
                    source = track.source,
                    streamUrl = url,
                    status = "queued"
                )
            })
        }
        if (entities.isNotEmpty()) {
            downloadDao.upsertBatch(entities)
        }
    }

    override suspend fun removeFromQueue(trackId: String) {
        downloadDao.delete(trackId)
    }

    override suspend fun clearAll() {
        downloadDao.deleteAll()
    }

    override suspend fun clearCompleted() {
        downloadDao.deleteCompleted()
    }

    override suspend fun pauseDownload(trackId: String) {
        val download = downloadDao.getDownload(trackId) ?: return
        if (download.status == "downloading") {
            downloadDao.updateStatus(trackId, "paused", download.progress)
            downloadDao.updateIsPaused(trackId, true)
        }
    }

    override suspend fun resumeDownload(trackId: String) {
        val download = downloadDao.getDownload(trackId) ?: return
        if (download.status == "paused") {
            downloadDao.updateStatus(trackId, "queued", download.progress)
            downloadDao.updateIsPaused(trackId, false)
        }
    }

    override suspend fun cancelDownload(trackId: String) {
        downloadDao.updateStatus(trackId, "cancelled", 0f)
    }

    override suspend fun retryDownload(trackId: String) {
        val download = downloadDao.getDownload(trackId) ?: return
        val visited = mutableSetOf(download.source, download.lastSource ?: "")
        val sources = listOf("spotify", "youtube", "deezer", "soundcloud", "audius")

        for (newSource in sources) {
            if (newSource in visited) continue
            visited.add(newSource)

            val track = Track(
                id = download.trackId,
                title = download.title,
                artist = download.artist,
                album = download.album,
                artworkUrl = download.artworkUrl,
                durationMs = download.durationMs,
                isrc = download.isrc,
                source = newSource
            )

            val resolved = findAudioUrl(track)
            if (resolved != null) {
                downloadDao.upsert(download.copy(
                    status = "queued",
                    errorMessage = null,
                    progress = 0f,
                    streamUrl = resolved.first,
                    source = newSource,
                    retryCount = download.retryCount + 1,
                    lastSource = download.source
                ))
                return
            }
        }

        downloadDao.upsert(download.copy(
            status = "error",
            errorMessage = "All sources exhausted",
            progress = 0f,
            retryCount = download.retryCount + 1,
            lastSource = download.source
        ))
    }

    private fun hasEnoughSpace(file: File, requiredBytes: Long): Boolean {
        val usable = file.parentFile?.freeSpace ?: return true
        return usable > requiredBytes + (10 * 1024 * 1024)
    }

    private fun isValidAudioUrl(url: String): Boolean {
        return url.isNotEmpty() && (url.startsWith("http://") || url.startsWith("https://"))
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

    override suspend fun downloadFile(trackId: String, onProgress: (Float, Float) -> Unit): Boolean = withContext(Dispatchers.IO) {
        val download = downloadDao.getDownload(trackId) ?: return@withContext false

        downloadDao.updateStatus(trackId, "downloading", 0f)

        var url = download.streamUrl
        var usedSource = download.source
        val startTime = AtomicLong(System.currentTimeMillis())

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

            val result = tryDownload(url, usedSource, download, onProgress, startTime)
            if (result != null) {
                val file = File(result.first)
                if (isValidAudioFile(file)) {
                    downloadDao.markComplete(trackId, result.first, result.second, usedSource)
                    return@withContext true
                } else {
                    file.delete()
                }
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
        onProgress: (Float, Float) -> Unit,
        startTime: AtomicLong
    ): Pair<String, Long>? {
        return try {
            val request = Request.Builder().url(url).build()
            val response = okHttpClient.newCall(request).execute()

            response.use { resp ->
                if (!resp.isSuccessful) return@use null

                val body = resp.body ?: return@use null
                val contentLength = body.contentLength()
                val stream = body.byteStream()

                val fileName = "${sanitizeFileName(download.artist)} - ${sanitizeFileName(download.title)}.mp3"

                val downloadsDir = File(
                    Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MUSIC),
                    "Sinc Enhanced"
                )
                if (!downloadsDir.exists()) downloadsDir.mkdirs()
                val outputFile = File(downloadsDir, fileName)
                val tempFile = File(downloadsDir, "${fileName}.tmp")

                outputFile.delete()
                tempFile.delete()

                if (contentLength > 0 && !hasEnoughSpace(outputFile, contentLength)) {
                    downloadDao.markError(download.trackId, "Insufficient storage space")
                    return@use null
                }

                var bytesRead: Long = 0
                val buffer = ByteArray(8192)
                var read: Int
                var audioPath: String? = null

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
                    val uri = context.contentResolver.insert(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, values)
                    if (uri != null) {
                        context.contentResolver.openOutputStream(uri)?.use { output ->
                            while (stream.read(buffer).also { read = it } != -1) {
                                output.write(buffer, 0, read)
                                bytesRead += read
                                if (contentLength > 0) {
                                    val progress = (bytesRead.toFloat() / contentLength.toFloat()).coerceIn(0f, 1f)
                                    val elapsed = (System.currentTimeMillis() - startTime.get()) / 1000f
                                    val speed = if (elapsed > 0) bytesRead.toFloat() / elapsed else 0f
                                    downloadDao.updateProgress(download.trackId, progress, speed)
                                    onProgress(progress, speed)
                                }
                            }
                        }
                        val cursor = context.contentResolver.query(uri, null, null, null, null)
                        cursor?.use {
                            if (it.moveToFirst()) {
                                audioPath = it.getString(it.getColumnIndexOrThrow(MediaStore.Audio.Media.DATA))
                            }
                        }
                    } else {
                        FileOutputStream(tempFile).use { output ->
                            while (stream.read(buffer).also { read = it } != -1) {
                                output.write(buffer, 0, read)
                                bytesRead += read
                                if (contentLength > 0) {
                                    val progress = (bytesRead.toFloat() / contentLength.toFloat()).coerceIn(0f, 1f)
                                    val elapsed = (System.currentTimeMillis() - startTime.get()) / 1000f
                                    val speed = if (elapsed > 0) bytesRead.toFloat() / elapsed else 0f
                                    downloadDao.updateProgress(download.trackId, progress, speed)
                                    onProgress(progress, speed)
                                }
                            }
                        }
                        tempFile.renameTo(outputFile)
                        MediaScannerConnection.scanFile(context, arrayOf(outputFile.absolutePath), null, null)
                        audioPath = outputFile.absolutePath
                    }
                } else {
                    FileOutputStream(tempFile).use { output ->
                        while (stream.read(buffer).also { read = it } != -1) {
                            output.write(buffer, 0, read)
                            bytesRead += read
                            if (contentLength > 0) {
                                val progress = (bytesRead.toFloat() / contentLength.toFloat()).coerceIn(0f, 1f)
                                val elapsed = (System.currentTimeMillis() - startTime.get()) / 1000f
                                val speed = if (elapsed > 0) bytesRead.toFloat() / elapsed else 0f
                                downloadDao.updateProgress(download.trackId, progress, speed)
                                onProgress(progress, speed)
                            }
                        }
                    }
                    tempFile.renameTo(outputFile)
                    MediaScannerConnection.scanFile(context, arrayOf(outputFile.absolutePath), null, null)
                    audioPath = outputFile.absolutePath
                }

                if (bytesRead == 0L) {
                    return@use null
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
                        filePath = audioPath ?: outputFile.absolutePath
                    )
                )

                if (settingsManager.downloadLyrics.first()) {
                    try {
                        lyricsClient.getLyrics(download.artist, download.title, download.album)
                    } catch (_: Exception) {}
                }

                Pair(audioPath ?: outputFile.absolutePath, bytesRead)
            }
        } catch (_: Exception) { null }
    }

    private fun sanitizeFileName(name: String): String {
        return name.replace(Regex("""[\\/:*?"<>|]"""), "_").trim().take(200)
    }
}