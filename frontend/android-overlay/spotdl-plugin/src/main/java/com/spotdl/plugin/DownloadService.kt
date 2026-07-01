package com.spotdl.plugin

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat

class DownloadService : Service() {
    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action = intent?.action

        when (action) {
            ACTION_START -> {
                val title = intent.getStringExtra(EXTRA_TITLE) ?: "Downloading..."
                val count = intent.getIntExtra(EXTRA_COUNT, 1)
                try {
                    startForeground(NOTIFICATION_ID, createNotification(title, count, null))
                } catch (e: SecurityException) {
                    stopForeground(STOP_FOREGROUND_REMOVE)
                    stopSelf()
                }
            }
            ACTION_UPDATE -> {
                val title = intent.getStringExtra(EXTRA_TITLE) ?: "Downloading..."
                val count = intent.getIntExtra(EXTRA_COUNT, 1)
                val progress = if (intent.hasExtra(EXTRA_PROGRESS)) intent.getFloatExtra(EXTRA_PROGRESS, -1f) else null
                val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                notificationManager.notify(NOTIFICATION_ID, createNotification(title, count, progress))
            }
            ACTION_STOP -> {
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
            }
        }

        return START_NOT_STICKY
    }

    private fun createNotification(title: String, count: Int, progress: Float?): Notification {
        createChannel()

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

        val body = if (count > 1) "$count tracks in queue" else title

        val builder = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Downloading...")
            .setContentText(body)
            .setSmallIcon(android.R.drawable.stat_sys_download)
            .setOngoing(true)
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

    private fun createChannel() {
        val channel = NotificationChannel(
            CHANNEL_ID, "Downloads", NotificationManager.IMPORTANCE_LOW,
        ).apply {
            description = "Shows download progress"
            setShowBadge(false)
        }
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.createNotificationChannel(channel)
    }

    companion object {
        const val CHANNEL_ID = "spotdl_downloads"
        const val NOTIFICATION_ID = 1001
        const val ACTION_START = "com.spotdl.plugin.DOWNLOAD_START"
        const val ACTION_UPDATE = "com.spotdl.plugin.DOWNLOAD_UPDATE"
        const val ACTION_STOP = "com.spotdl.plugin.DOWNLOAD_STOP"
        const val EXTRA_TITLE = "title"
        const val EXTRA_COUNT = "count"
        const val EXTRA_PROGRESS = "progress"

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

        fun update(context: Context, title: String, count: Int, progress: Float? = null) {
            context.startService(Intent(context, DownloadService::class.java).apply {
                action = ACTION_UPDATE
                putExtra(EXTRA_TITLE, title)
                putExtra(EXTRA_COUNT, count)
                if (progress != null) {
                    putExtra(EXTRA_PROGRESS, progress)
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
