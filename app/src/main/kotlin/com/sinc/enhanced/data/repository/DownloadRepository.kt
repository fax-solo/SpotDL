package com.sinc.enhanced.data.repository

import android.content.Context
import android.os.Environment
import com.sinc.enhanced.data.download.AudioFileDownloader
import com.sinc.enhanced.data.download.AudioFileValidator
import com.sinc.enhanced.data.download.DownloadRequest
import com.sinc.enhanced.data.error.AppError
import com.sinc.enhanced.data.local.SettingsManager
import com.sinc.enhanced.data.local.dao.DownloadDao
import com.sinc.enhanced.data.local.dao.HistoryDao
import com.sinc.enhanced.data.local.entity.DownloadEntity
import com.sinc.enhanced.data.local.entity.HistoryEntity
import com.sinc.enhanced.data.model.Track
import com.sinc.enhanced.data.remote.LyricsClient
import com.sinc.enhanced.domain.repository.DownloadRepository as DownloadRepositoryInterface
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import java.io.File

class DownloadRepository(
    private val context: Context,
    private val downloadDao: DownloadDao,
    private val historyDao: HistoryDao,
    okHttpClient: OkHttpClient,
    private val findAudioUrl: suspend (Track) -> Pair<String, String>?,
    private val lyricsClient: LyricsClient,
    private val settingsManager: SettingsManager
) : DownloadRepositoryInterface {
    private val fileDownloader = AudioFileDownloader(context, okHttpClient)

    init {
        cleanupTmpFiles()
    }

    private fun cleanupTmpFiles() {
        try {
            val dir = File(
                Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MUSIC),
                "Sinc Enhanced"
            )
            if (dir.exists()) {
                dir.listFiles()?.filter { it.name.endsWith(".tmp") }?.forEach { it.delete() }
            }
        } catch (_: Exception) {}
    }

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
            val streamUrl = audioUrls[track.id] ?: track.previewUrl ?: return@mapNotNull null
            DownloadEntity(
                trackId = track.id,
                title = track.title,
                artist = track.artist,
                album = track.album,
                artworkUrl = track.artworkUrl,
                durationMs = track.durationMs,
                isrc = track.isrc,
                source = track.source,
                streamUrl = streamUrl,
                status = "queued"
            )
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
            downloadDao.pauseDownload(trackId)
        }
    }

    override suspend fun resumeDownload(trackId: String) {
        val download = downloadDao.getDownload(trackId) ?: return
        if (download.status == "paused") {
            downloadDao.resumeDownload(trackId)
        }
    }

    override suspend fun cancelDownload(trackId: String) {
        downloadDao.updateStatus(trackId, "cancelled", 0f)
    }

    override suspend fun retryDownload(trackId: String) {
        val download = downloadDao.getDownload(trackId) ?: return

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
            downloadDao.upsert(download.copy(
                status = "queued",
                errorMessage = null,
                progress = 0f,
                streamUrl = resolved.first,
                source = resolved.second,
                retryCount = download.retryCount + 1,
                lastSource = download.source
            ))
        } else {
            downloadDao.upsert(download.copy(
                status = "error",
                errorMessage = "All audio sources exhausted",
                progress = 0f,
                retryCount = download.retryCount + 1,
                lastSource = download.source
            ))
        }
    }

    override suspend fun downloadFile(trackId: String, onProgress: (progress: Float, speedBps: Float) -> Unit): Boolean = withContext(Dispatchers.IO) {
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

            val request = DownloadRequest(
                trackId = download.trackId,
                title = download.title,
                artist = download.artist,
                album = download.album,
                source = usedSource
            )
            val result = try {
                fileDownloader.download(request, url ?: return@withContext false) { progress, speed ->
                    downloadDao.updateProgress(trackId, progress, speed)
                    onProgress(progress, speed)
                }
            } catch (e: AppError) {
                downloadDao.markError(trackId, e.message)
                return@withContext false
            }

            if (result != null && AudioFileValidator.isValidAudioFile(File(result.path))) {
                downloadDao.markComplete(trackId, result.path, result.bytes, usedSource)
                recordHistory(download, result.path)
                fetchLyrics(download)
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

    private suspend fun recordHistory(download: DownloadEntity, filePath: String) {
        historyDao.insert(
            HistoryEntity(
                trackId = download.trackId,
                title = download.title,
                artist = download.artist,
                album = download.album,
                artworkUrl = download.artworkUrl,
                durationMs = download.durationMs,
                source = download.source,
                filePath = filePath
            )
        )
    }

    private suspend fun fetchLyrics(download: DownloadEntity) {
        if (!settingsManager.downloadLyrics.first()) return
        try {
            lyricsClient.getLyrics(download.artist, download.title, download.album)
        } catch (_: Exception) {}
    }
}
