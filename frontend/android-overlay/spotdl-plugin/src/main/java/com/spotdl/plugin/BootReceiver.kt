package com.spotdl.plugin

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return

        ensureChannelsExist(context)

        val prefs: SharedPreferences = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val hasPendingDownloads = prefs.getBoolean(PREFS_HAS_PENDING_DOWNLOADS, false)

        if (hasPendingDownloads) {
            val title = prefs.getString(PREFS_DOWNLOAD_TITLE, "Downloading...") ?: "Downloading..."
            val count = prefs.getInt(PREFS_DOWNLOAD_COUNT, 1)
            DownloadService.start(context, title, count)
        }
    }

    private fun ensureChannelsExist(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        val progressChannel = NotificationChannel(
            DownloadService.CHANNEL_PROGRESS, "Download Progress", NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = "Shows real-time download progress (silent)"
            setShowBadge(false)
            enableVibration(false)
            setSound(null, null)
        }
        manager.createNotificationChannel(progressChannel)

        val completeChannel = NotificationChannel(
            DownloadService.CHANNEL_COMPLETE, "Download Complete", NotificationManager.IMPORTANCE_DEFAULT
        ).apply {
            description = "Alerts when a download finishes"
            setShowBadge(true)
        }
        manager.createNotificationChannel(completeChannel)

        val errorChannel = NotificationChannel(
            DownloadService.CHANNEL_ERROR, "Download Errors", NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = "Alerts when a download fails"
            setShowBadge(true)
            enableVibration(true)
        }
        manager.createNotificationChannel(errorChannel)

        val mediaChannel = NotificationChannel(
            MediaService.CHANNEL_ID, "Music Playback", NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = "Shows currently playing track with lock screen controls"
            setShowBadge(false)
        }
        manager.createNotificationChannel(mediaChannel)
    }

    companion object {
        const val PREFS_NAME = "spotdl_downloads"
        const val PREFS_HAS_PENDING_DOWNLOADS = "has_pending"
        const val PREFS_DOWNLOAD_TITLE = "download_title"
        const val PREFS_DOWNLOAD_COUNT = "download_count"

        fun savePendingState(context: Context, title: String, count: Int) {
            context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit()
                .putBoolean(PREFS_HAS_PENDING_DOWNLOADS, true)
                .putString(PREFS_DOWNLOAD_TITLE, title)
                .putInt(PREFS_DOWNLOAD_COUNT, count)
                .apply()
        }

        fun clearPendingState(context: Context) {
            context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit()
                .putBoolean(PREFS_HAS_PENDING_DOWNLOADS, false)
                .apply()
        }
    }
}
