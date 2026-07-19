package com.spotdl.plugin

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.session.MediaSession
import android.media.session.PlaybackState
import android.os.Build
import android.os.IBinder
import android.os.SystemClock
import androidx.core.app.NotificationCompat
import androidx.media.session.MediaSessionCompat
import java.net.URL
import java.util.concurrent.Executors

class MediaService : Service(), AudioManager.OnAudioFocusChangeListener {
    private var mediaSession: MediaSession? = null
    @Volatile
    private var cachedArtwork: Bitmap? = null
    private val executor = Executors.newSingleThreadExecutor()
    private var audioFocusRequest: AudioFocusRequest? = null
    private var hasAudioFocus = false
    private var currentPosition: Long = 0
    private var totalDuration: Long = 0
    private var currentTitle: String? = null
    private var currentArtist: String? = null
    private var currentLyricLine: String? = null
    private var isCurrentlyPlaying: Boolean = false

    override fun onAudioFocusChange(focusChange: Int) {
        when (focusChange) {
            AudioManager.AUDIOFOCUS_LOSS,
            AudioManager.AUDIOFOCUS_LOSS_TRANSIENT -> {
                hasAudioFocus = false
                broadcastMediaAction(MEDIA_ACTION_PAUSE)
            }
            AudioManager.AUDIOFOCUS_GAIN -> {
                hasAudioFocus = true
            }
        }
    }

    private fun requestAudioFocus(): Boolean {
        val am = getSystemService(Context.AUDIO_SERVICE) as AudioManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                .setOnAudioFocusChangeListener(this)
                .setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_MEDIA)
                        .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                        .build()
                )
                .build()
            audioFocusRequest = request
            return am.requestAudioFocus(request) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
        }
        return am.requestAudioFocus(this, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
    }

    private fun abandonAudioFocus() {
        val am = getSystemService(Context.AUDIO_SERVICE) as AudioManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            audioFocusRequest?.let { am.abandonAudioFocusRequest(it) }
        } else {
            @Suppress("DEPRECATION")
            am.abandonAudioFocus(this)
        }
        hasAudioFocus = false
    }

    override fun onCreate() {
        super.onCreate()
        createChannel()
        mediaSession = MediaSession(this, "spotdl_media_session").apply {
            setCallback(object : MediaSession.Callback() {
                override fun onPlay() { broadcastMediaAction(MEDIA_ACTION_PLAY) }
                override fun onPause() { broadcastMediaAction(MEDIA_ACTION_PAUSE) }
                override fun onSkipToNext() { broadcastMediaAction(MEDIA_ACTION_NEXT) }
                override fun onSkipToPrevious() { broadcastMediaAction(MEDIA_ACTION_PREV) }
                override fun onStop() { broadcastMediaAction(MEDIA_ACTION_STOP) }
                override fun onSeekTo(pos: Long) {
                    val intent = Intent(MEDIA_ACTION_SEEK).apply {
                        setPackage(packageName)
                        putExtra("position", pos)
                    }
                    sendBroadcast(intent)
                }
            })
            isActive = true
        }
    }

    override fun onDestroy() {
        abandonAudioFocus()
        executor.shutdownNow()
        cachedArtwork?.recycle()
        cachedArtwork = null
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
                if (intent == null) {
                    stopForeground(STOP_FOREGROUND_REMOVE)
                    stopSelf()
                    return START_NOT_STICKY
                }
                val title = intent.getStringExtra(EXTRA_TITLE) ?: "Playing"
                val artist = intent.getStringExtra(EXTRA_ARTIST) ?: ""
                val artworkUrl = intent.getStringExtra(EXTRA_ARTWORK_URL)
                currentPosition = (intent.getDoubleExtra(EXTRA_POSITION, 0.0) * 1000).toLong()
                totalDuration = (intent.getDoubleExtra(EXTRA_DURATION, 0.0) * 1000).toLong()
                currentTitle = title
                currentArtist = artist
                currentLyricLine = if (intent.hasExtra(EXTRA_LINE)) intent.getStringExtra(EXTRA_LINE) else null
                isCurrentlyPlaying = true
                requestAudioFocus()
                loadArtwork(artworkUrl)
                updatePlaybackState(true)
                try {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                        if (checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                            stopForeground(STOP_FOREGROUND_REMOVE)
                            stopSelf()
                            return START_NOT_STICKY
                        }
                    }
                    startForeground(NOTIFICATION_ID, createNotification(title, artist))
                } catch (e: Exception) {
                    stopForeground(STOP_FOREGROUND_REMOVE)
                    stopSelf()
                }
            }
            ACTION_UPDATE -> {
                val title = intent.getStringExtra(EXTRA_TITLE) ?: currentTitle ?: "Playing"
                val artist = intent.getStringExtra(EXTRA_ARTIST) ?: currentArtist ?: ""
                val artworkUrl = intent.getStringExtra(EXTRA_ARTWORK_URL)
                currentPosition = (intent.getDoubleExtra(EXTRA_POSITION, currentPosition / 1000.0) * 1000).toLong()
                totalDuration = (intent.getDoubleExtra(EXTRA_DURATION, totalDuration / 1000.0) * 1000).toLong()
                currentTitle = title
                currentArtist = artist
                currentLyricLine = if (intent.hasExtra(EXTRA_LINE)) intent.getStringExtra(EXTRA_LINE) else null
                isCurrentlyPlaying = true
                loadArtwork(artworkUrl)
                updatePlaybackState(true)
                val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                notificationManager.notify(NOTIFICATION_ID, createNotification(title, artist))
            }
            ACTION_STOP -> {
                isCurrentlyPlaying = false
                abandonAudioFocus()
                updatePlaybackState(false)
                cachedArtwork = null
                currentPosition = 0
                totalDuration = 0
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
            }
        }

        return START_NOT_STICKY
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        if (isCurrentlyPlaying) {
            val restartIntent = Intent(this, MediaService::class.java).apply {
                action = ACTION_PLAY
                putExtra(EXTRA_TITLE, currentTitle ?: "Playing")
                putExtra(EXTRA_ARTIST, currentArtist ?: "")
            }
            val pendingIntent = PendingIntent.getService(
                this, 0, restartIntent,
                PendingIntent.FLAG_IMMUTABLE
            )
            val alarm = getSystemService(Context.ALARM_SERVICE) as AlarmManager
            alarm.set(
                AlarmManager.ELAPSED_REALTIME_WAKEUP,
                SystemClock.elapsedRealtime() + 5000,
                pendingIntent
            )
        }
        super.onTaskRemoved(rootIntent)
    }

    private fun loadArtwork(url: String?) {
        if (url == null || url.isEmpty()) {
            cachedArtwork?.recycle()
            cachedArtwork = null
            return
        }
        executor.submit {
            try {
                val connection = URL(url).openConnection()
                connection.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36")
                connection.connectTimeout = 5000
                connection.readTimeout = 5000
                val input = connection.getInputStream()
                val bytes = input.use { it.readBytes() }
                val opts = BitmapFactory.Options().apply {
                    inJustDecodeBounds = true
                }
                BitmapFactory.decodeByteArray(bytes, 0, bytes.size, opts)
                val maxSize = 512
                opts.inSampleSize = maxOf(1, (maxOf(opts.outWidth, opts.outHeight) + maxSize - 1) / maxSize)
                opts.inJustDecodeBounds = false
                val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size, opts)
                if (bitmap != null) {
                    cachedArtwork?.recycle()
                    cachedArtwork = bitmap
                    updatePlaybackState(isCurrentlyPlaying)
                    val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                    notificationManager.notify(NOTIFICATION_ID, createNotification(
                        currentTitle ?: "Track",
                        currentArtist ?: ""
                    ))
                }
            } catch (_: Exception) {
            }
        }
    }

    private fun updatePlaybackState(playing: Boolean) {
        mediaSession?.apply {
            val metadataBuilder = android.media.MediaMetadata.Builder()
                .putString(android.media.MediaMetadata.METADATA_KEY_TITLE, currentTitle ?: "")
                .putString(android.media.MediaMetadata.METADATA_KEY_ARTIST, currentArtist ?: "")
                .putLong(android.media.MediaMetadata.METADATA_KEY_DURATION, totalDuration)
            currentLyricLine?.let { line ->
                if (line.isNotEmpty()) {
                    metadataBuilder.putString(android.media.MediaMetadata.METADATA_KEY_DISPLAY_SUBTITLE, line)
                }
            }
            cachedArtwork?.let { bm ->
                metadataBuilder.putBitmap(android.media.MediaMetadata.METADATA_KEY_ALBUM_ART, bm)
            }
            setMetadata(metadataBuilder.build())
            val state = if (playing) PlaybackState.STATE_PLAYING else PlaybackState.STATE_PAUSED
            setPlaybackState(
                PlaybackState.Builder()
                    .setState(state, currentPosition, if (playing) 1f else 0f)
                    .setActions(
                        PlaybackState.ACTION_PLAY or
                        PlaybackState.ACTION_PAUSE or
                        PlaybackState.ACTION_SKIP_TO_NEXT or
                        PlaybackState.ACTION_SKIP_TO_PREVIOUS or
                        PlaybackState.ACTION_STOP or
                        PlaybackState.ACTION_SEEK_TO
                    )
                    .build()
            )
        }
    }

    private fun broadcastMediaAction(action: String) {
        sendBroadcast(Intent(action).setPackage(packageName))
    }

    private fun createNotification(title: String, artist: String): Notification {
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
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setSilent(true)
            .setShowWhen(false)

        currentLyricLine?.let { line ->
            if (line.isNotEmpty()) {
                builder.setSubText(line)
            }
        }

        if (totalDuration > 0) {
            builder.setProgress(
                (totalDuration / 1000).toInt(),
                (currentPosition / 1000).toInt(),
                false
            )
        }

        cachedArtwork?.let { bm ->
            builder.setLargeIcon(bm)
        }

        mediaSession?.let { session ->
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                builder.setStyle(
                    androidx.media.app.NotificationCompat.MediaStyle()
                        .setMediaSession(MediaSessionCompat.Token.fromToken(session.sessionToken))
                        .setShowActionsInCompactView(0, 1, 2)
                        .setShowCancelButton(true)
                        .setCancelButtonIntent(
                            PendingIntent.getBroadcast(
                                this, 3, Intent(MEDIA_ACTION_STOP).setPackage(packageName),
                                PendingIntent.FLAG_IMMUTABLE
                            )
                        )
                )
            }
            builder.addAction(
                android.R.drawable.ic_media_previous, "Previous",
                PendingIntent.getBroadcast(
                    this, 0, Intent(MEDIA_ACTION_PREV).setPackage(packageName),
                    PendingIntent.FLAG_IMMUTABLE
                )
            )
            if (isCurrentlyPlaying) {
                builder.addAction(
                    android.R.drawable.ic_media_pause, "Pause",
                    PendingIntent.getBroadcast(
                        this, 1, Intent(MEDIA_ACTION_PAUSE).setPackage(packageName),
                        PendingIntent.FLAG_IMMUTABLE
                    )
                )
            } else {
                builder.addAction(
                    android.R.drawable.ic_media_play, "Play",
                    PendingIntent.getBroadcast(
                        this, 1, Intent(MEDIA_ACTION_PLAY).setPackage(packageName),
                        PendingIntent.FLAG_IMMUTABLE
                    )
                )
            }
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
            CHANNEL_ID, "Music Playback", NotificationManager.IMPORTANCE_DEFAULT,
        ).apply {
            description = "Shows currently playing track with lock screen controls"
            setShowBadge(false)
            enableVibration(false)
            setSound(null, null)
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
        const val EXTRA_POSITION = "position"
        const val EXTRA_DURATION = "duration"
        const val EXTRA_LINE = "currentLyricLine"

        const val MEDIA_ACTION_PLAY = "com.spotdl.plugin.MEDIA_BTN_PLAY"
        const val MEDIA_ACTION_PAUSE = "com.spotdl.plugin.MEDIA_BTN_PAUSE"
        const val MEDIA_ACTION_NEXT = "com.spotdl.plugin.MEDIA_BTN_NEXT"
        const val MEDIA_ACTION_PREV = "com.spotdl.plugin.MEDIA_BTN_PREV"
        const val MEDIA_ACTION_STOP = "com.spotdl.plugin.MEDIA_BTN_STOP"
        const val MEDIA_ACTION_SEEK = "com.spotdl.plugin.MEDIA_BTN_SEEK"

        fun start(context: Context, title: String = "Playing", artist: String = "", artworkUrl: String? = null, position: Double = 0.0, duration: Double = 0.0, currentLyricLine: String? = null) {
            val intent = Intent(context, MediaService::class.java).apply {
                action = ACTION_PLAY
                putExtra(EXTRA_TITLE, title)
                putExtra(EXTRA_ARTIST, artist)
                putExtra(EXTRA_POSITION, position)
                putExtra(EXTRA_DURATION, duration)
                if (artworkUrl != null) putExtra(EXTRA_ARTWORK_URL, artworkUrl)
                if (currentLyricLine != null) putExtra(EXTRA_LINE, currentLyricLine)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun update(context: Context, title: String, artist: String, artworkUrl: String? = null, position: Double = 0.0, duration: Double = 0.0, currentLyricLine: String? = null) {
            context.startService(Intent(context, MediaService::class.java).apply {
                action = ACTION_UPDATE
                putExtra(EXTRA_TITLE, title)
                putExtra(EXTRA_ARTIST, artist)
                putExtra(EXTRA_POSITION, position)
                putExtra(EXTRA_DURATION, duration)
                if (artworkUrl != null) putExtra(EXTRA_ARTWORK_URL, artworkUrl)
                if (currentLyricLine != null) putExtra(EXTRA_LINE, currentLyricLine)
            })
        }

        fun stop(context: Context) {
            context.startService(Intent(context, MediaService::class.java).apply {
                action = ACTION_STOP
            })
        }
    }
}
