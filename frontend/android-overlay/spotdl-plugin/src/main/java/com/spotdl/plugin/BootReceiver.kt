package com.spotdl.plugin

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return

        val prefs: SharedPreferences = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val hasPendingDownloads = prefs.getBoolean(PREFS_HAS_PENDING_DOWNLOADS, false)

        if (hasPendingDownloads) {
            val title = prefs.getString(PREFS_DOWNLOAD_TITLE, "Downloading...") ?: "Downloading..."
            val count = prefs.getInt(PREFS_DOWNLOAD_COUNT, 1)
            DownloadService.start(context, title, count)
        }
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
