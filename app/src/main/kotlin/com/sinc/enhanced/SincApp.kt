package com.sinc.enhanced

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import androidx.media3.session.MediaSession
import com.sinc.enhanced.service.NotificationHelper

class SincApp : Application() {
    lateinit var container: AppContainer
        private set
    var mediaSession: MediaSession? = null

    override fun onCreate() {
        super.onCreate()
        instance = this
        container = AppContainer(this)
        createNotificationChannels()
    }

    companion object {
        lateinit var instance: SincApp
            private set
    }

    private fun createNotificationChannels() {
        val manager = getSystemService(NotificationManager::class.java)

        val downloadChannel = NotificationChannel(
            NotificationHelper.CHANNEL_DOWNLOADS,
            getString(R.string.notification_channel_downloads),
            NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = getString(R.string.notification_channel_downloads_desc)
            setShowBadge(false)
        }

        val playbackChannel = NotificationChannel(
            NotificationHelper.CHANNEL_PLAYBACK,
            getString(R.string.notification_channel_playback),
            NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = getString(R.string.notification_channel_playback_desc)
            setShowBadge(false)
        }

        manager.createNotificationChannel(downloadChannel)
        manager.createNotificationChannel(playbackChannel)
    }
}
