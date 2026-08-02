package com.spotdl.plugin

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.os.SystemClock
import androidx.core.app.NotificationCompat
import java.util.concurrent.atomic.AtomicInteger

class DownloadService : Service() {
    private var startedForeground = false

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action = intent?.action

        when (action) {
            ACTION_START -> {
                val title = intent.getStringExtra(EXTRA_TITLE) ?: "Downloading..."
                val count = intent.getIntExtra(EXTRA_COUNT, 1)
                try {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                        if (checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                            stopForeground(STOP_FOREGROUND_REMOVE)
                            stopSelf()
                            return START_NOT_STICKY
                        }
                    }
                    startForeground(NOTIFICATION_ID, createProgressNotification(title, count, null, null))
                    startedForeground = true
                } catch (e: Exception) {
                    stopForeground(STOP_FOREGROUND_REMOVE)
                    stopSelf()
                    return START_NOT_STICKY
                }
                return START_REDELIVER_INTENT
            }
            ACTION_UPDATE -> {
                val title = intent.getStringExtra(EXTRA_TITLE) ?: "Downloading..."
                val count = intent.getIntExtra(EXTRA_COUNT, 1)
                val progress = if (intent.hasExtra(EXTRA_PROGRESS)) intent.getFloatExtra(EXTRA_PROGRESS, -1f) else null
                val stage = intent.getStringExtra(EXTRA_STAGE)
                // Redelivered after a process kill: the service must re-enter the
                // foreground state before it can keep running.
                if (!startedForeground) {
                    try {
                        startForeground(NOTIFICATION_ID, createProgressNotification(title, count, progress, stage))
                        startedForeground = true
                    } catch (_: Exception) {
                    }
                }
                val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                notificationManager.notify(NOTIFICATION_ID, createProgressNotification(title, count, progress, stage))
                return START_REDELIVER_INTENT
            }
            ACTION_STOP -> {
                startedForeground = false
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
                return START_NOT_STICKY
            }
        }

        return START_NOT_STICKY
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        val prefs = getSharedPreferences(BootReceiver.PREFS_NAME, Context.MODE_PRIVATE)
        val hasPending = prefs.getBoolean(BootReceiver.PREFS_HAS_PENDING_DOWNLOADS, false)
        if (hasPending) {
            val title = prefs.getString(BootReceiver.PREFS_DOWNLOAD_TITLE, "Downloading...") ?: "Downloading..."
            val count = prefs.getInt(BootReceiver.PREFS_DOWNLOAD_COUNT, 1)
            val restartIntent = Intent(this, DownloadService::class.java).apply {
                action = ACTION_START
                putExtra(EXTRA_TITLE, title)
                putExtra(EXTRA_COUNT, count)
            }
            scheduleRestart(restartIntent)
        }
        super.onTaskRemoved(rootIntent)
    }

    private fun scheduleRestart(restartIntent: Intent) {
        val alarm = getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val pendingIntent = PendingIntent.getService(
            this, 0, restartIntent,
            PendingIntent.FLAG_IMMUTABLE
        )
        val triggerAt = SystemClock.elapsedRealtime() + 5000
        // Exact alarm: prompt restart, and with USE_EXACT_ALARM declared this
        // is exempt from the Android 12+ background foreground-service start
        // restriction that plain (inexact) alarms hit.
        try {
            alarm.setExact(AlarmManager.ELAPSED_REALTIME_WAKEUP, triggerAt, pendingIntent)
        } catch (e: SecurityException) {
            alarm.set(AlarmManager.ELAPSED_REALTIME_WAKEUP, triggerAt, pendingIntent)
        }
    }

    private fun createProgressNotification(title: String, count: Int, progress: Float?, stage: String?): Notification {
        createProgressChannel()

        val launchIntent = packageManager.getLaunchIntentForPackage(packageName)?.apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val pendingIntent = if (launchIntent != null) {
            PendingIntent.getActivity(
                this, 0, launchIntent,
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
            )
        } else null

        val stopIntent = PendingIntent.getService(
            this, 1,
            Intent(this, DownloadService::class.java).apply { action = ACTION_STOP },
            PendingIntent.FLAG_IMMUTABLE,
        )

        val displayTitle = if (count > 1) "Downloading ($count remaining)" else title
        val body = buildString {
            append(title)
            if (stage != null && stage.isNotEmpty()) {
                append(" • $stage")
            }
            if (progress != null && progress in 0f..1f) {
                append(" • ${(progress * 100).toInt()}%")
            }
        }

        val builder = NotificationCompat.Builder(this, CHANNEL_PROGRESS)
            .setContentTitle(displayTitle)
            .setContentText(body)
            .setSmallIcon(android.R.drawable.stat_sys_download)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(pendingIntent)
            .addAction(android.R.drawable.ic_media_pause, "Stop", stopIntent)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setSilent(true)

        if (progress != null && progress in 0f..1f) {
            builder.setProgress(100, (progress * 100).toInt(), false)
        } else {
            builder.setProgress(0, 0, true)
        }

        return builder.build()
    }

    fun sendCompleteNotification(trackTitle: String, trackArtist: String) {
        createCompleteChannel()
        val notification = NotificationCompat.Builder(this, CHANNEL_COMPLETE)
            .setContentTitle("Download complete")
            .setContentText("$trackTitle • $trackArtist")
            .setSmallIcon(android.R.drawable.stat_sys_download_done)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setSilent(false)
            .build()
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.notify(NOTIFICATION_ID_COMPLETE + notifIdCounter.getAndIncrement(), notification)
    }

    fun sendErrorNotification(trackTitle: String, trackArtist: String, errorMsg: String?) {
        createErrorChannel()
        val notification = NotificationCompat.Builder(this, CHANNEL_ERROR)
            .setContentTitle("Download failed: $trackTitle")
            .setContentText(errorMsg ?: "$trackArtist — Something went wrong")
            .setSmallIcon(android.R.drawable.stat_sys_warning)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setSilent(false)
            .setVibrate(longArrayOf(0, 200, 100, 200))
            .build()
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.notify(NOTIFICATION_ID_ERROR + notifIdCounter.getAndIncrement(), notification)
    }

    private fun createProgressChannel() {
        val channel = NotificationChannel(
            CHANNEL_PROGRESS, "Download Progress", NotificationManager.IMPORTANCE_LOW,
        ).apply {
            description = "Shows real-time download progress (silent)"
            setShowBadge(false)
            enableVibration(false)
            setSound(null, null)
        }
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.createNotificationChannel(channel)
    }

    private fun createCompleteChannel() {
        val channel = NotificationChannel(
            CHANNEL_COMPLETE, "Download Complete", NotificationManager.IMPORTANCE_DEFAULT,
        ).apply {
            description = "Alerts when a download finishes"
            setShowBadge(true)
        }
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.createNotificationChannel(channel)
    }

    private fun createErrorChannel() {
        val channel = NotificationChannel(
            CHANNEL_ERROR, "Download Errors", NotificationManager.IMPORTANCE_HIGH,
        ).apply {
            description = "Alerts when a download fails"
            setShowBadge(true)
            enableVibration(true)
        }
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.createNotificationChannel(channel)
    }

    companion object {
        private val notifIdCounter = AtomicInteger(0)
        const val CHANNEL_PROGRESS = "spotdl_downloads_progress"
        const val CHANNEL_COMPLETE = "spotdl_downloads_complete"
        const val CHANNEL_ERROR = "spotdl_downloads_error"
        const val NOTIFICATION_ID = 1001
        const val NOTIFICATION_ID_COMPLETE = 2000
        const val NOTIFICATION_ID_ERROR = 3000
        const val ACTION_START = "com.spotdl.plugin.DOWNLOAD_START"
        const val ACTION_UPDATE = "com.spotdl.plugin.DOWNLOAD_UPDATE"
        const val ACTION_STOP = "com.spotdl.plugin.DOWNLOAD_STOP"
        const val EXTRA_TITLE = "title"
        const val EXTRA_COUNT = "count"
        const val EXTRA_PROGRESS = "progress"
        const val EXTRA_STAGE = "stage"

        fun start(context: Context, title: String = "Downloading...", count: Int = 1) {
            val intent = Intent(context, DownloadService::class.java).apply {
                action = ACTION_START
                putExtra(EXTRA_TITLE, title)
                putExtra(EXTRA_COUNT, count)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun update(context: Context, title: String, count: Int, progress: Float? = null, stage: String? = null) {
            context.startService(Intent(context, DownloadService::class.java).apply {
                action = ACTION_UPDATE
                putExtra(EXTRA_TITLE, title)
                putExtra(EXTRA_COUNT, count)
                if (progress != null) {
                    putExtra(EXTRA_PROGRESS, progress)
                }
                if (stage != null) {
                    putExtra(EXTRA_STAGE, stage)
                }
            })
        }

        fun stop(context: Context) {
            context.startService(Intent(context, DownloadService::class.java).apply {
                action = ACTION_STOP
            })
        }
    }
}
