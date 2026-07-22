package com.sinc.enhanced.service

import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import com.sinc.enhanced.MainActivity
import com.sinc.enhanced.R

object NotificationHelper {
    const val CHANNEL_DOWNLOADS = "downloads"
    const val CHANNEL_PLAYBACK = "playback"
    const val DOWNLOAD_NOTIFICATION_ID = 1001
    const val PLAYBACK_NOTIFICATION_ID = 1002

    fun buildDownloadNotification(
        context: Context,
        title: String,
        progress: Float,
        stage: String = "Downloading"
    ): Notification {
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
        return NotificationCompat.Builder(context, CHANNEL_DOWNLOADS)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle("Download complete")
            .setContentText(title)
            .setAutoCancel(true)
            .setSilent(true)
            .build()
    }

    fun buildDownloadErrorNotification(context: Context, title: String, error: String): Notification {
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
        isPlaying: Boolean
    ): Notification {
        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            context, 1, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(context, CHANNEL_PLAYBACK)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(artist)
            .setContentIntent(pendingIntent)
            .setOngoing(isPlaying)
            .setSilent(true)
            .build()
    }
}
