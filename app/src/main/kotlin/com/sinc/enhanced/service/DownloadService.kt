package com.sinc.enhanced.service

import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.os.IBinder
import com.sinc.enhanced.SincApp
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class DownloadService : Service() {

    companion object {
        const val ACTION_DOWNLOAD = "com.sinc.enhanced.action.DOWNLOAD"
        const val ACTION_PROCESS_QUEUE = "com.sinc.enhanced.action.PROCESS_QUEUE"
        const val EXTRA_TRACK_ID = "track_id"
        private const val MAX_PARALLEL = 3
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
                val manager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager

                var processedCount = 0
                var successCount = 0
                var failCount = 0

                if (startFrom != null) {
                    val all = repo.allDownloads.first()
                    val download = all.find { it.trackId == startFrom }
                    if (download != null && download.status != "completed") {
                        val result = downloadTrack(repo, startFrom, manager, 0)
                        processedCount++
                        if (result) successCount++ else failCount++
                    }
                }

                coroutineScope {
                    while (isActive && !shouldStop) {
                        val all = repo.allDownloads.first()
                        val queued = all.filter { it.status == "queued" }
                        if (queued.isEmpty()) break

                        queued.chunked(MAX_PARALLEL).forEach { batch ->
                            if (shouldStop) return@forEach
                            val deferreds = batch.mapIndexed { i, download ->
                                async {
                                    downloadTrack(repo, download.trackId, manager, i + 1)
                                }
                            }
                            val results = deferreds.map { it.await() }
                            processedCount += results.size
                            successCount += results.count { it }
                            failCount += results.count { !it }
                        }
                    }
                }

                if (processedCount > 1) {
                    val summary = "${successCount} completed" + (if (failCount > 0) ", $failCount failed" else "")
                    val notif = NotificationHelper.buildDownloadCompleteNotification(this@DownloadService, summary)
                    manager.notify(NotificationHelper.DOWNLOAD_NOTIFICATION_ID, notif)
                }
            } catch (e: Exception) {
                try {
                    val manager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
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

    private suspend fun downloadTrack(
        repo: com.sinc.enhanced.data.repository.DownloadRepository,
        trackId: String,
        manager: NotificationManager,
        notifSlot: Int
    ): Boolean = withContext(Dispatchers.IO) {
        val download = repo.allDownloads.first().find { it.trackId == trackId } ?: return@withContext false

        val notifId = if (notifSlot == 0) NotificationHelper.DOWNLOAD_NOTIFICATION_ID
            else NotificationHelper.DOWNLOAD_NOTIFICATION_ID + notifSlot

        val initialNotif = NotificationHelper.buildDownloadNotification(
            this@DownloadService,
            "${download.artist} - ${download.title}",
            0f
        )
        manager.notify(notifId, initialNotif)

        val success = repo.downloadFile(trackId) { progress, _ ->
            val notif = NotificationHelper.buildDownloadNotification(
                this@DownloadService,
                "${download.artist} - ${download.title}",
                progress
            )
            manager.notify(notifId, notif)
        }

        if (success) {
            val notif = NotificationHelper.buildDownloadCompleteNotification(
                this@DownloadService,
                "${download.artist} - ${download.title}"
            )
            manager.notify(notifId, notif)
        } else {
            val updated = repo.allDownloads.first().find { it.trackId == trackId }
            val notif = NotificationHelper.buildDownloadErrorNotification(
                this@DownloadService,
                "${download.artist} - ${download.title}",
                updated?.errorMessage ?: "Unknown error"
            )
            manager.notify(notifId, notif)
        }

        success
    }

    override fun onDestroy() {
        shouldStop = true
        scope.coroutineContext[Job]?.cancel()
        super.onDestroy()
    }
}
