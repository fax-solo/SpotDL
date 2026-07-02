package com.spotdl.plugin

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.media.session.MediaSession
import android.media.session.PlaybackState
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import java.net.URL
import java.util.concurrent.Executors

class MediaService : Service() {
    private var mediaSession: MediaSession? = null
    private var cachedArtwork: Bitmap? = null
    private val executor = Executors.newSingleThreadExecutor()

    override fun onCreate() {
        super.onCreate()
        mediaSession = MediaSession(this, "spotdl_media_session").apply {
            setCallback(object : MediaSession.Callback() {
                override fun onPlay() { broadcastMediaAction(MEDIA_ACTION_PLAY) }
                override fun onPause() { broadcastMediaAction(MEDIA_ACTION_PAUSE) }
                override fun onSkipToNext() { broadcastMediaAction(MEDIA_ACTION_NEXT) }
                override fun onSkipToPrevious() { broadcastMediaAction(MEDIA_ACTION_PREV) }
                override fun onStop() { broadcastMediaAction(MEDIA_ACTION_STOP) }
            })
            isActive = true
        }
    }

    override fun onDestroy() {
        executor.shutdownNow()
        mediaSession?.isActive = false
        mediaSession?.release()
        mediaSession = null
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action = intent?.action

        when (action) {
            ACTION_PLAY -> {
                val title = intent.getStringExtra(EXTRA_TITLE) ?: "Playing"
                val artist = intent.getStringExtra(EXTRA_ARTIST) ?: ""
                val artworkUrl = intent.getStringExtra(EXTRA_ARTWORK_URL)
                loadArtwork(artworkUrl)
                updatePlaybackState(title, artist, true)
                try {
                    startForeground(NOTIFICATION_ID, createNotification(title, artist))
                } catch (e: SecurityException) {
                    stopForeground(STOP_FOREGROUND_REMOVE)
                    stopSelf()
                }
            }
            ACTION_UPDATE -> {
                val title = intent.getStringExtra(EXTRA_TITLE) ?: "Playing"
                val artist = intent.getStringExtra(EXTRA_ARTIST) ?: ""
                val artworkUrl = intent.getStringExtra(EXTRA_ARTWORK_URL)
                loadArtwork(artworkUrl)
                updatePlaybackState(title, artist, true)
                val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                notificationManager.notify(NOTIFICATION_ID, createNotification(title, artist))
            }
            ACTION_STOP -> {
                updatePlaybackState(null, null, false)
                cachedArtwork = null
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
            }
        }

        return START_NOT_STICKY
    }

    private fun loadArtwork(url: String?) {
        if (url == null || url.isEmpty()) {
            cachedArtwork = null
            return
        }
        executor.submit {
            try {
                val connection = URL(url).openConnection()
                connection.connectTimeout = 5000
                connection.readTimeout = 5000
                val bitmap = BitmapFactory.decodeStream(connection.getInputStream())
                if (bitmap != null) {
                    cachedArtwork = bitmap
                    val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                    notificationManager.notify(NOTIFICATION_ID, createNotification(
                        (if (intentHasExtra("title")) "Playing" else "Track"),
                        ""
                    ))
                }
            } catch (_: Exception) {
                // artwork loading is best-effort
            }
        }
    }

    private fun intentHasExtra(name: String): Boolean = true // placeholder; real state tracked differently

    private fun updatePlaybackState(title: String?, artist: String?, playing: Boolean) {
        mediaSession?.apply {
            val metadataBuilder = android.media.MediaMetadata.Builder()
                .putString(android.media.MediaMetadata.METADATA_KEY_TITLE, title ?: "")
                .putString(android.media.MediaMetadata.METADATA_KEY_ARTIST, artist ?: "")
            cachedArtwork?.let { bm ->
                metadataBuilder.putBitmap(android.media.MediaMetadata.METADATA_KEY_ALBUM_ART, bm)
            }
            setMetadata(metadataBuilder.build())
            setPlaybackState(
                PlaybackState.Builder()
                    .setState(
                        if (playing) PlaybackState.STATE_PLAYING else PlaybackState.STATE_STOPPED,
                        PlaybackState.PLAYBACK_POSITION_UNKNOWN,
                        1f
                    )
                    .setActions(
                        PlaybackState.ACTION_PLAY or
                        PlaybackState.ACTION_PAUSE or
                        PlaybackState.ACTION_SKIP_TO_NEXT or
                        PlaybackState.ACTION_SKIP_TO_PREVIOUS or
                        PlaybackState.ACTION_STOP
                    )
                    .build()
            )
        }
    }

    private fun broadcastMediaAction(action: String) {
        sendBroadcast(Intent(action).setPackage(packageName))
    }

    private fun createNotification(title: String, artist: String): Notification {
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

        val builder = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(artist)
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setOngoing(true)
            .setContentIntent(pendingIntent)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setSilent(true)

        cachedArtwork?.let { bm ->
            builder.setLargeIcon(bm)
        }

        mediaSession?.let { session ->
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                builder.setStyle(
                    androidx.media.app.NotificationCompat.MediaStyle()
                        .setMediaSession(session.sessionToken)
                        .setShowActionsInCompactView(0, 2)
                )
            }
            builder.addAction(
                android.R.drawable.ic_media_previous, "Previous",
                PendingIntent.getBroadcast(
                    this, 0, Intent(MEDIA_ACTION_PREV).setPackage(packageName),
                    PendingIntent.FLAG_IMMUTABLE
                )
            )
            builder.addAction(
                android.R.drawable.ic_media_pause, "Pause",
                PendingIntent.getBroadcast(
                    this, 1, Intent(MEDIA_ACTION_PAUSE).setPackage(packageName),
                    PendingIntent.FLAG_IMMUTABLE
                )
            )
            builder.addAction(
                android.R.drawable.ic_media_next, "Next",
                PendingIntent.getBroadcast(
                    this, 2, Intent(MEDIA_ACTION_NEXT).setPackage(packageName),
                    PendingIntent.FLAG_IMMUTABLE
                )
            )
        }

        return builder.build()
    }

    private fun createChannel() {
        val channel = NotificationChannel(
            CHANNEL_ID, "Music Playback", NotificationManager.IMPORTANCE_LOW,
        ).apply {
            description = "Shows currently playing track"
            setShowBadge(false)
        }
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.createNotificationChannel(channel)
    }

    companion object {
        const val CHANNEL_ID = "spotdl_media"
        const val NOTIFICATION_ID = 1002
        const val ACTION_PLAY = "com.spotdl.plugin.MEDIA_PLAY"
        const val ACTION_UPDATE = "com.spotdl.plugin.MEDIA_UPDATE"
        const val ACTION_STOP = "com.spotdl.plugin.MEDIA_STOP"
        const val EXTRA_TITLE = "title"
        const val EXTRA_ARTIST = "artist"
        const val EXTRA_ARTWORK_URL = "artworkUrl"

        const val MEDIA_ACTION_PLAY = "com.spotdl.plugin.MEDIA_BTN_PLAY"
        const val MEDIA_ACTION_PAUSE = "com.spotdl.plugin.MEDIA_BTN_PAUSE"
        const val MEDIA_ACTION_NEXT = "com.spotdl.plugin.MEDIA_BTN_NEXT"
        const val MEDIA_ACTION_PREV = "com.spotdl.plugin.MEDIA_BTN_PREV"
        const val MEDIA_ACTION_STOP = "com.spotdl.plugin.MEDIA_BTN_STOP"

        fun start(context: Context, title: String = "Playing", artist: String = "", artworkUrl: String? = null) {
            val intent = Intent(context, MediaService::class.java).apply {
                action = ACTION_PLAY
                putExtra(EXTRA_TITLE, title)
                putExtra(EXTRA_ARTIST, artist)
                if (artworkUrl != null) putExtra(EXTRA_ARTWORK_URL, artworkUrl)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun update(context: Context, title: String, artist: String, artworkUrl: String? = null) {
            context.startService(Intent(context, MediaService::class.java).apply {
                action = ACTION_UPDATE
                putExtra(EXTRA_TITLE, title)
                putExtra(EXTRA_ARTIST, artist)
                if (artworkUrl != null) putExtra(EXTRA_ARTWORK_URL, artworkUrl)
            })
        }

        fun stop(context: Context) {
            context.startService(Intent(context, MediaService::class.java).apply {
                action = ACTION_STOP
            })
        }
    }
}
