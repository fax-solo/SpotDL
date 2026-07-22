package com.sinc.enhanced.service

import android.app.Service
import android.content.Intent
import android.os.Build
import android.os.IBinder
import com.sinc.enhanced.SincApp
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.first

class DownloadService : Service() {

    companion object {
        const val ACTION_DOWNLOAD = "com.sinc.enhanced.action.DOWNLOAD"
        const val EXTRA_TRACK_ID = "track_id"
    }

    private val scope = CoroutineScope(SupervisorJob())
    @Volatile private var isProcessing = false

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_DOWNLOAD -> {
                val trackId = intent.getStringExtra(EXTRA_TRACK_ID) ?: return START_NOT_STICKY
                try {
                    startForeground(
                        NotificationHelper.DOWNLOAD_NOTIFICATION_ID,
                        NotificationHelper.buildDownloadNotification(this, "Starting...", 0f)
                    )
                } catch (_: SecurityException) {
                    stopSelf()
                    return START_NOT_STICKY
                }
                processQueue(trackId)
            }
        }
        return START_NOT_STICKY
    }

    private fun processQueue(initialTrackId: String) {
        if (isProcessing) return
        isProcessing = true

        scope.launch(Dispatchers.IO) {
            try {
                val app = application as SincApp
                val repo = app.container.downloadRepository
                val download = repo.allDownloads.first().find { it.trackId == initialTrackId }
                if (download == null) {
                    withContext(Dispatchers.Main) { stopSelf() }
                    return@launch
                }

                val notification = NotificationHelper.buildDownloadNotification(
                    this@DownloadService,
                    "${download.artist} - ${download.title}",
                    0f
                )
                val manager = getSystemService(NOTIFICATION_SERVICE) as android.app.NotificationManager
                manager.notify(NotificationHelper.DOWNLOAD_NOTIFICATION_ID, notification)

                val success = repo.downloadFile(initialTrackId) { progress ->
                    if (isActive) {
                        val notif = NotificationHelper.buildDownloadNotification(
                            this@DownloadService,
                            "${download.artist} - ${download.title}",
                            progress
                        )
                        manager.notify(NotificationHelper.DOWNLOAD_NOTIFICATION_ID, notif)
                    }
                }

                if (success) {
                    val notif = NotificationHelper.buildDownloadCompleteNotification(
                        this@DownloadService,
                        "${download.artist} - ${download.title}"
                    )
                    manager.notify(NotificationHelper.DOWNLOAD_NOTIFICATION_ID, notif)
                } else {
                    val updated = repo.allDownloads.first().find { it.trackId == initialTrackId }
                    val notif = NotificationHelper.buildDownloadErrorNotification(
                        this@DownloadService,
                        "${download.artist} - ${download.title}",
                        updated?.errorMessage ?: "Unknown error"
                    )
                    manager.notify(NotificationHelper.DOWNLOAD_NOTIFICATION_ID, notif)
                }
            } catch (e: Exception) {
                val manager = getSystemService(NOTIFICATION_SERVICE) as android.app.NotificationManager
                val notif = NotificationHelper.buildDownloadErrorNotification(
                    this@DownloadService,
                    "Download failed",
                    e.message ?: "Unknown error"
                )
                manager.notify(NotificationHelper.DOWNLOAD_NOTIFICATION_ID, notif)
            } finally {
                isProcessing = false
                withContext(Dispatchers.Main) {
                    stopForeground(STOP_FOREGROUND_REMOVE)
                    stopSelf()
                }
            }
        }
    }

    override fun onDestroy() {
        scope.cancel()
        super.onDestroy()
    }
}
