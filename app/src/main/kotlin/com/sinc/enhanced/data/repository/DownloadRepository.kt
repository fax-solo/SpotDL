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
import kotlinx.coroutines.Dispatchers
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
    private val okHttpClient: OkHttpClient
) {

    val allDownloads: Flow<List<DownloadEntity>> = downloadDao.getAllDownloads()
    val activeDownloads: Flow<List<DownloadEntity>> = downloadDao.getActiveDownloads()

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

    suspend fun downloadFile(trackId: String, onProgress: (Float) -> Unit): Boolean = withContext(Dispatchers.IO) {
        val download = downloadDao.getDownload(trackId) ?: return@withContext false
        val url = download.streamUrl ?: return@withContext false

        try {
            downloadDao.updateStatus(trackId, "downloading", 0f)

            val request = Request.Builder().url(url).build()
            val response = okHttpClient.newCall(request).execute()

            response.use { resp ->
                if (!resp.isSuccessful) {
                    downloadDao.markError(trackId, "HTTP ${resp.code}")
                    return@withContext false
                }

                val body = resp.body ?: run {
                    downloadDao.markError(trackId, "Empty response body")
                    return@withContext false
                }

                val contentLength = body.contentLength()

                body.byteStream().use { inputStream ->
                    val fileName = "${sanitizeFileName(download.artist)} - ${sanitizeFileName(download.title)}.mp3"
                    val downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MUSIC)
                    val appDir = File(downloadsDir, "Sinc Enhanced")
                    if (!appDir.exists()) appDir.mkdirs()

                    val outputFile = File(appDir, fileName)
                    var bytesRead: Long = 0
                    val buffer = ByteArray(8192)
                    var read: Int

                    FileOutputStream(outputFile).use { output ->
                        while (inputStream.read(buffer).also { read = it } != -1) {
                            output.write(buffer, 0, read)
                            bytesRead += read
                            if (contentLength > 0) {
                                val progress = bytesRead.toFloat() / contentLength.toFloat()
                                onProgress(progress)
                            }
                        }
                    }

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

                    downloadDao.markComplete(trackId, outputFile.absolutePath, bytesRead)

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
                }
            }

            return@withContext true
        } catch (e: Exception) {
            downloadDao.markError(trackId, e.message ?: "Unknown error")
            return@withContext false
        }
    }

    suspend fun retryDownload(trackId: String) {
        val download = downloadDao.getDownload(trackId) ?: return
        downloadDao.upsert(download.copy(status = "queued", errorMessage = null, progress = 0f))
    }

    private fun sanitizeFileName(name: String): String {
        return name.replace(Regex("""[\\/:*?"<>|]"""), "_").trim().take(200)
    }
}
