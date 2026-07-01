package com.spotdl.plugin

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.util.Log
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

const val LOCAL_PORT = 9182
const val LOCAL_URL = "http://127.0.0.1:$LOCAL_PORT"

@CapacitorPlugin(name = "SpotDL")
class SpotDLPlugin : Plugin() {
    private val core = SpotDLCore()
    private var mediaButtonReceiver: BroadcastReceiver? = null

    override fun load() {
        super.load()
        registerMediaButtonReceiver()
    }

    override fun handleOnDestroy() {
        unregisterMediaButtonReceiver()
        core.stopServer()
    }

    private fun registerMediaButtonReceiver() {
        val receiver = object : BroadcastReceiver() {
            override fun onReceive(ctx: Context, intent: Intent) {
                val action = intent.action ?: return
                val eventName = when (action) {
                    MediaService.MEDIA_ACTION_PLAY -> "mediaPlay"
                    MediaService.MEDIA_ACTION_PAUSE -> "mediaPause"
                    MediaService.MEDIA_ACTION_NEXT -> "mediaNext"
                    MediaService.MEDIA_ACTION_PREV -> "mediaPrevious"
                    MediaService.MEDIA_ACTION_STOP -> "mediaStop"
                    else -> return
                }
                notifyListeners(eventName, JSObject())
            }
        }
        mediaButtonReceiver = receiver
        val filter = IntentFilter().apply {
            addAction(MediaService.MEDIA_ACTION_PLAY)
            addAction(MediaService.MEDIA_ACTION_PAUSE)
            addAction(MediaService.MEDIA_ACTION_NEXT)
            addAction(MediaService.MEDIA_ACTION_PREV)
            addAction(MediaService.MEDIA_ACTION_STOP)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            activity.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            activity.registerReceiver(receiver, filter)
        }
    }

    private fun unregisterMediaButtonReceiver() {
        mediaButtonReceiver?.let {
            try { activity.unregisterReceiver(it) } catch (_: Exception) {}
            mediaButtonReceiver = null
        }
    }

    @PluginMethod
    fun initialize(call: PluginCall) {
        try {
            val ctx = context
            core.init(ctx)
            core.startServer(ctx)
            call.resolve()
        } catch (e: Exception) {
            call.reject("Failed to initialize SpotDL", e)
        }
    }

    @PluginMethod
    fun getStatus(call: PluginCall) {
        val ret = JSObject()
        ret.put("initialized", core.isInitialized)
        ret.put("serverRunning", core.isServerRunning)
        ret.put("port", LOCAL_PORT)
        ret.put("url", LOCAL_URL)
        call.resolve(ret)
    }

    @PluginMethod
    fun startDownloadForeground(call: PluginCall) {
        try {
            val ctx = context
            val title = call.getString("title") ?: "Downloading..."
            val count = call.getInt("count", 1) ?: 1
            BootReceiver.savePendingState(ctx, title, count)
            DownloadService.start(ctx, title, count)
            call.resolve()
        } catch (e: Exception) {
            call.reject("Failed to start download foreground", e)
        }
    }

    @PluginMethod
    fun updateDownloadForeground(call: PluginCall) {
        try {
            val ctx = context
            val title = call.getString("title") ?: "Downloading..."
            val count = call.getInt("count", 1) ?: 1
            val progress = if (call.getData().has("progress")) call.getFloat("progress", -1f) ?: -1f else -1f
            DownloadService.update(ctx, title, count, if (progress >= 0) progress else null)
            call.resolve()
        } catch (e: Exception) {
            call.reject("Failed to update download foreground", e)
        }
    }

    @PluginMethod
    fun stopDownloadForeground(call: PluginCall) {
        try {
            BootReceiver.clearPendingState(context)
            DownloadService.stop(context)
            call.resolve()
        } catch (e: Exception) {
            call.reject("Failed to stop download foreground", e)
        }
    }

    @PluginMethod
    fun startMediaForeground(call: PluginCall) {
        try {
            val ctx = context
            val title = call.getString("title") ?: "Playing"
            val artist = call.getString("artist") ?: ""
            val artworkUrl = call.getString("artworkUrl")
            MediaService.start(ctx, title, artist, artworkUrl)
            call.resolve()
        } catch (e: Exception) {
            call.reject("Failed to start media foreground", e)
        }
    }

    @PluginMethod
    fun updateMediaForeground(call: PluginCall) {
        try {
            val ctx = context
            val title = call.getString("title") ?: "Playing"
            val artist = call.getString("artist") ?: ""
            val artworkUrl = call.getString("artworkUrl")
            MediaService.update(ctx, title, artist, artworkUrl)
            call.resolve()
        } catch (e: Exception) {
            call.reject("Failed to update media foreground", e)
        }
    }

    @PluginMethod
    fun stopMediaForeground(call: PluginCall) {
        try {
            MediaService.stop(context)
            call.resolve()
        } catch (e: Exception) {
            call.reject("Failed to stop media foreground", e)
        }
    }
}
