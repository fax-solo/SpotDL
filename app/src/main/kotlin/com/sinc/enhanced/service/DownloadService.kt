package com.sinc.enhanced.service

import android.app.Service
import android.content.Intent
import android.os.IBinder
import com.sinc.enhanced.SincApp
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.first

class DownloadService : Service() {

    companion object {
        const val ACTION_DOWNLOAD = "com.sinc.enhanced.action.DOWNLOAD"
        const val ACTION_PROCESS_QUEUE = "com.sinc.enhanced.action.PROCESS_QUEUE"
        const val EXTRA_TRACK_ID = "track_id"
    }

    private val scope = CoroutineScope(SupervisorJob())
    @Volatile private var isProcessing = false
    @Volatile private var shouldStop = false

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_DOWNLOAD -> {
                val trackId = intent.getStringExtra(EXTRA_TRACK_ID)
                if (trackId != null) {
                    startForegroundIfPossible()
                    processQueue(startFrom = trackId)
                } else {
                    processQueue(startFrom = null)
                }
            }
            ACTION_PROCESS_QUEUE -> {
                startForegroundIfPossible()
                processQueue(startFrom = null)
            }
        }
        return START_NOT_STICKY
    }

    private fun startForegroundIfPossible() {
        if (isProcessing) return
        try {
            startForeground(
                NotificationHelper.DOWNLOAD_NOTIFICATION_ID,
                NotificationHelper.buildDownloadNotification(this, "Preparing...", 0f, "Starting")
            )
        } catch (_: SecurityException) {
            stopSelf()
        }
    }

    private fun processQueue(startFrom: String? = null) {
        if (isProcessing) return
        isProcessing = true
        shouldStop = false

        scope.launch(Dispatchers.IO) {
            try {
                val app = application as SincApp
                val repo = app.container.downloadRepository

                var processedCount = 0
                var successCount = 0
                var failCount = 0

                val initialTrackId = startFrom
                if (initialTrackId != null) {
                    val all = repo.allDownloads.first()
                    val download = all.find { it.trackId == initialTrackId }
                    if (download != null && download.status != "completed") {
                        val result = downloadTrack(repo, initialTrackId)
                        processedCount++
                        if (result) successCount++ else failCount++
                    }
                }

                while (!shouldStop) {
                    val all = repo.allDownloads.first()
                    val nextQueued = all.firstOrNull { it.status == "queued" }
                    if (nextQueued == null) break

                    val result = downloadTrack(repo, nextQueued.trackId)
                    processedCount++
                    if (result) successCount++ else failCount++
                }

                val manager = getSystemService(NOTIFICATION_SERVICE) as android.app.NotificationManager
                if (processedCount > 1) {
                    val summary = "${successCount} completed" + (if (failCount > 0) ", $failCount failed" else "")
                    val notif = NotificationHelper.buildDownloadCompleteNotification(this@DownloadService, summary)
                    manager.notify(NotificationHelper.DOWNLOAD_NOTIFICATION_ID, notif)
                }
            } catch (e: Exception) {
                try {
                    val manager = getSystemService(NOTIFICATION_SERVICE) as android.app.NotificationManager
                    val notif = NotificationHelper.buildDownloadErrorNotification(
                        this@DownloadService, "Download stopped", e.message ?: "Unknown error"
                    )
                    manager.notify(NotificationHelper.DOWNLOAD_NOTIFICATION_ID, notif)
                } catch (_: Exception) {}
            } finally {
                isProcessing = false
                withContext(NonCancellable + Dispatchers.Main) {
                    stopForeground(STOP_FOREGROUND_REMOVE)
                    stopSelf()
                }
            }
        }
    }

    private suspend fun downloadTrack(repo: com.sinc.enhanced.data.repository.DownloadRepository, trackId: String): Boolean = withContext(Dispatchers.IO) {
        val download = repo.allDownloads.first().find { it.trackId == trackId } ?: return@withContext false

        val manager = getSystemService(NOTIFICATION_SERVICE) as android.app.NotificationManager
        val initialNotif = NotificationHelper.buildDownloadNotification(
            this@DownloadService,
            "${download.artist} - ${download.title}",
            0f
        )
        manager.notify(NotificationHelper.DOWNLOAD_NOTIFICATION_ID, initialNotif)

        val success = repo.downloadFile(trackId) { progress, speed ->
            val notif = NotificationHelper.buildDownloadNotification(
                this@DownloadService,
                "${download.artist} - ${download.title}",
                progress
            )
            manager.notify(NotificationHelper.DOWNLOAD_NOTIFICATION_ID, notif)
        }

        if (success) {
            val notif = NotificationHelper.buildDownloadCompleteNotification(
                this@DownloadService,
                "${download.artist} - ${download.title}"
            )
            manager.notify(NotificationHelper.DOWNLOAD_NOTIFICATION_ID, notif)
        } else {
            val updated = repo.allDownloads.first().find { it.trackId == trackId }
            val notif = NotificationHelper.buildDownloadErrorNotification(
                this@DownloadService,
                "${download.artist} - ${download.title}",
                updated?.errorMessage ?: "Unknown error"
            )
            manager.notify(NotificationHelper.DOWNLOAD_NOTIFICATION_ID, notif)
        }

        success
    }

    override fun onDestroy() {
        shouldStop = true
        scope.cancel()
        super.onDestroy()
    }
}