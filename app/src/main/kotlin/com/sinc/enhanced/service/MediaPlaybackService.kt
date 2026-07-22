package com.sinc.enhanced.service

import android.content.Intent
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import com.sinc.enhanced.SincApp

class MediaPlaybackService : MediaSessionService() {

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? {
        return (application as SincApp).mediaSession
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        val session = (application as SincApp).mediaSession
        val player = session?.player
        if (player == null || (!player.playWhenReady || player.mediaItemCount == 0)) {
            stopForeground(STOP_FOREGROUND_REMOVE)
            stopSelf()
        }
    }

    override fun onDestroy() {
        super.onDestroy()
    }
}
