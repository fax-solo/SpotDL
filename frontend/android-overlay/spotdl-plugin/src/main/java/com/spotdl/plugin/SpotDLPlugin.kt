package com.spotdl.plugin

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.Manifest
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.util.Log
import android.view.WindowInsets
import android.view.WindowManager
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.PermissionState
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission

const val LOCAL_PORT = 9182
const val LOCAL_URL = "http://127.0.0.1:$LOCAL_PORT"

@CapacitorPlugin(
    name = "SpotDL",
    permissions = [
        Permission(
            alias = "mediaAudio",
            strings = [Manifest.permission.READ_MEDIA_AUDIO]
        ),
        Permission(
            alias = "mediaImages",
            strings = [Manifest.permission.READ_MEDIA_IMAGES]
        ),
        Permission(
            alias = "mediaVideo",
            strings = [Manifest.permission.READ_MEDIA_VIDEO]
        ),
        Permission(
            alias = "postNotifications",
            strings = [Manifest.permission.POST_NOTIFICATIONS]
        ),
        Permission(
            alias = "scheduleExactAlarm",
            strings = [Manifest.permission.USE_EXACT_ALARM]
        ),
    ]
)
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
                    MediaService.MEDIA_ACTION_SEEK -> "mediaSeek"
                    else -> return
                }
                val ret = JSObject()
                if (action == MediaService.MEDIA_ACTION_SEEK) {
                    ret.put("position", intent.getLongExtra("position", 0L))
                }
                notifyListeners(eventName, ret)
            }
        }
        mediaButtonReceiver = receiver
        val filter = IntentFilter().apply {
            addAction(MediaService.MEDIA_ACTION_PLAY)
            addAction(MediaService.MEDIA_ACTION_PAUSE)
            addAction(MediaService.MEDIA_ACTION_NEXT)
            addAction(MediaService.MEDIA_ACTION_PREV)
            addAction(MediaService.MEDIA_ACTION_STOP)
            addAction(MediaService.MEDIA_ACTION_SEEK)
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
    fun checkPermission(call: PluginCall) {
        val alias = call.getString("alias") ?: ""
        val state = getPermissionState(alias)
        call.resolve(JSObject().apply {
            put("granted", state == PermissionState.GRANTED)
        })
    }

    @PluginMethod
    fun requestPermission(call: PluginCall) {
        val alias = call.getString("alias") ?: ""
        requestPermissionForAlias(alias, call, "permissionCallback")
    }

    @PluginMethod
    fun shouldShowRationale(call: PluginCall) {
        val alias = call.getString("alias") ?: ""
        val strings = when (alias) {
            "mediaAudio" -> arrayOf(Manifest.permission.READ_MEDIA_AUDIO)
            "mediaImages" -> arrayOf(Manifest.permission.READ_MEDIA_IMAGES)
            "mediaVideo" -> arrayOf(Manifest.permission.READ_MEDIA_VIDEO)
            "postNotifications" -> arrayOf(Manifest.permission.POST_NOTIFICATIONS)
            else -> arrayOf(Manifest.permission.READ_MEDIA_AUDIO)
        }
        val show = strings.any { activity.shouldShowRequestPermissionRationale(it) }
        call.resolve(JSObject().apply { put("show", show) })
    }

    @PluginMethod
    fun openAppSettings(call: PluginCall) {
        try {
            val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                data = Uri.parse("package:${context.packageName}")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
            call.resolve()
        } catch (e: Exception) {
            call.reject("Failed to open app settings", e)
        }
    }

    @PluginMethod
    fun getNavigationBarHeight(call: PluginCall) {
        try {
            val windowManager = activity.getSystemService(Context.WINDOW_SERVICE) as WindowManager
            val height = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                val insets = activity.windowManager.currentWindowMetrics.windowInsets
                val navInsets = insets.getInsets(WindowInsets.Type.navigationBars())
                navInsets.bottom
            } else {
                @Suppress("DEPRECATION")
                val resourceId = context.resources.getIdentifier("navigation_bar_height", "dimen", "android")
                if (resourceId > 0) context.resources.getDimensionPixelSize(resourceId) else 0
            }
            call.resolve(JSObject().apply { put("height", height) })
        } catch (e: Exception) {
            call.resolve(JSObject().apply { put("height", 0) })
        }
    }

    @PluginMethod
    fun getStatusBarHeight(call: PluginCall) {
        try {
            val height = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                val insets = activity.windowManager.currentWindowMetrics.windowInsets
                val statusInsets = insets.getInsets(WindowInsets.Type.statusBars())
                statusInsets.top
            } else {
                @Suppress("DEPRECATION")
                val resourceId = context.resources.getIdentifier("status_bar_height", "dimen", "android")
                if (resourceId > 0) context.resources.getDimensionPixelSize(resourceId) else 0
            }
            call.resolve(JSObject().apply { put("height", height) })
        } catch (e: Exception) {
            call.resolve(JSObject().apply { put("height", 0) })
        }
    }

    @PluginMethod
    fun getDisplayCutoutInsets(call: PluginCall) {
        try {
            var left = 0
            var top = 0
            var right = 0
            var bottom = 0
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                val insets = activity.windowManager.currentWindowMetrics.windowInsets
                val cutout = insets.displayCutout
                if (cutout != null) {
                    val boundingRects = cutout.boundingRects
                    for (rect in boundingRects) {
                        left = maxOf(left, rect.left)
                        top = maxOf(top, rect.top)
                        right = maxOf(right, rect.right)
                        bottom = maxOf(bottom, rect.bottom)
                    }
                }
            }
            call.resolve(JSObject().apply {
                put("left", left)
                put("top", top)
                put("right", right)
                put("bottom", bottom)
            })
        } catch (e: Exception) {
            call.resolve(JSObject().apply {
                put("left", 0); put("top", 0); put("right", 0); put("bottom", 0)
            })
        }
    }

    @PluginMethod
    fun checkMediaAudioPermission(call: PluginCall) {
        val granted = getPermissionState("mediaAudio") == PermissionState.GRANTED
        call.resolve(JSObject().apply { put("granted", granted) })
    }

    @PluginMethod
    fun requestMediaAudioPermission(call: PluginCall) {
        requestPermissionForAlias("mediaAudio", call, "mediaAudioPermissionCallback")
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
            val stage = call.getString("stage")
            DownloadService.update(ctx, title, count, if (progress >= 0) progress else null, stage)
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
            val position = if (call.getData().has("position")) call.getDouble("position", 0.0) ?: 0.0 else 0.0
            val duration = if (call.getData().has("duration")) call.getDouble("duration", 0.0) ?: 0.0 else 0.0
            MediaService.start(ctx, title, artist, artworkUrl, position, duration)
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
            val position = if (call.getData().has("position")) call.getDouble("position", 0.0) ?: 0.0 else 0.0
            val duration = if (call.getData().has("duration")) call.getDouble("duration", 0.0) ?: 0.0 else 0.0
            MediaService.update(ctx, title, artist, artworkUrl, position, duration)
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

    @PluginMethod
    fun scanLocalMusic(call: PluginCall) {
        try {
            val ctx = context
            val uri = android.provider.MediaStore.Audio.Media.EXTERNAL_CONTENT_URI
            val projection = arrayOf(
                android.provider.MediaStore.Audio.Media._ID,
                android.provider.MediaStore.Audio.Media.TITLE,
                android.provider.MediaStore.Audio.Media.ARTIST,
                android.provider.MediaStore.Audio.Media.ALBUM,
                android.provider.MediaStore.Audio.Media.DATA,
                android.provider.MediaStore.Audio.Media.SIZE,
                android.provider.MediaStore.Audio.Media.DATE_MODIFIED,
            )
            val selection = "${android.provider.MediaStore.Audio.Media.IS_MUSIC} != 0"
            val cursor = ctx.contentResolver.query(uri, projection, selection, null, null)
            val tracks = org.json.JSONArray()
            cursor?.use {
                while (it.moveToNext()) {
                    val path = it.getString(4) ?: ""
                    if (path.isEmpty()) continue
                    val track = JSObject().apply {
                        put("id", it.getLong(0))
                        put("title", it.getString(1) ?: "Unknown")
                        put("artist", it.getString(2) ?: "Unknown")
                        put("album", it.getString(3) ?: "Unknown")
                        put("path", path)
                        put("size", it.getLong(5))
                        put("mtime", it.getLong(6))
                    }
                    tracks.put(track)
                }
            }
            call.resolve(JSObject().apply { put("tracks", tracks) })
        } catch (e: Exception) {
            call.reject("Failed to scan local music", e)
        }
    }
}
