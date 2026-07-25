package com.sinc.enhanced.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Build
import androidx.core.app.NotificationCompat
import com.sinc.enhanced.MainActivity
import com.sinc.enhanced.R

object NotificationHelper {
    const val CHANNEL_DOWNLOADS = "downloads"
    const val CHANNEL_PLAYBACK = "media_playback"
    const val DOWNLOAD_NOTIFICATION_ID = 1001
    const val PLAYBACK_NOTIFICATION_ID = 1002

    fun buildDownloadNotification(
        context: Context,
        title: String,
        progress: Float,
        stage: String = "Downloading"
    ): Notification {
        createChannels(context)

        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            context, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(context, CHANNEL_DOWNLOADS)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(stage)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setProgress(100, (progress * 100).toInt(), false)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .build()
    }

    fun buildDownloadCompleteNotification(context: Context, title: String): Notification {
        createChannels(context)

        return NotificationCompat.Builder(context, CHANNEL_DOWNLOADS)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle("Download complete")
            .setContentText(title)
            .setAutoCancel(true)
            .setSilent(true)
            .build()
    }

    fun buildDownloadErrorNotification(context: Context, title: String, error: String): Notification {
        createChannels(context)

        return NotificationCompat.Builder(context, CHANNEL_DOWNLOADS)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle("Download failed")
            .setContentText(title)
            .setStyle(NotificationCompat.BigTextStyle().bigText("$title\n$error"))
            .setAutoCancel(true)
            .build()
    }

    fun buildMediaNotification(
        context: Context,
        title: String,
        artist: String,
        isPlaying: Boolean,
        artwork: Bitmap? = null
    ): Notification {
        createChannels(context)

        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            context, 1, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val builder = NotificationCompat.Builder(context, CHANNEL_PLAYBACK)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(artist)
            .setContentIntent(pendingIntent)
            .setOngoing(isPlaying)
            .setSilent(true)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setCategory(NotificationCompat.CATEGORY_TRANSPORT)

        artwork?.let { builder.setLargeIcon(it) }

        return builder.build()
    }

    private fun createChannels(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = context.getSystemService(NotificationManager::class.java)
            if (manager.getNotificationChannel(CHANNEL_DOWNLOADS) == null) {
                val downloadChannel = NotificationChannel(
                    CHANNEL_DOWNLOADS,
                    "Downloads",
                    NotificationManager.IMPORTANCE_LOW
                ).apply {
                    description = "Download progress notifications"
                    setShowBadge(false)
                }
                manager.createNotificationChannel(downloadChannel)
            }
            if (manager.getNotificationChannel(CHANNEL_PLAYBACK) == null) {
                val playbackChannel = NotificationChannel(
                    CHANNEL_PLAYBACK,
                    "Media Playback",
                    NotificationManager.IMPORTANCE_LOW
                ).apply {
                    description = "Now playing media controls"
                    setShowBadge(false)
                }
                manager.createNotificationChannel(playbackChannel)
            }
        }
    }
}