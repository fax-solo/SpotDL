package com.spotdl.plugin

import android.app.Activity
import android.content.BroadcastReceiver
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.Manifest
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.PowerManager
import android.provider.MediaStore
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
import org.json.JSONObject
import java.io.BufferedInputStream
import java.io.File
import java.io.FileOutputStream
import java.lang.ref.WeakReference
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.Future
import java.util.UUID

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
            alias = "postNotifications",
            strings = [Manifest.permission.POST_NOTIFICATIONS]
        ),
        Permission(
            alias = "scheduleExactAlarm",
            strings = [Manifest.permission.USE_EXACT_ALARM]
        ),
        Permission(
            alias = "ignoreBatteryOptimizations",
            strings = [Manifest.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS]
        ),
    ]
)
class SpotDLPlugin : Plugin() {
    private val core = SpotDLCore()
    private var mediaButtonReceiver: BroadcastReceiver? = null
    private val saveExecutor = Executors.newFixedThreadPool(2)
    private val activeSaves = ConcurrentHashMap<String, Future<*>>()
    private var activityRef = WeakReference<Activity>(null)

    override fun load() {
        super.load()
        activityRef = WeakReference(activity)
        registerMediaButtonReceiver()
    }

    override fun handleOnDestroy() {
        unregisterMediaButtonReceiver()
        activeSaves.values.forEach { it.cancel(true) }
        activeSaves.clear()
        saveExecutor.shutdownNow()
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
            "postNotifications" -> arrayOf(Manifest.permission.POST_NOTIFICATIONS)
            else -> return call.resolve(JSObject().apply { put("show", false) })
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
    fun requestBatteryOptimizationExemption(call: PluginCall) {
        try {
            val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
            if (pm.isIgnoringBatteryOptimizations(context.packageName)) {
                call.resolve(JSObject().apply { put("alreadyExempt", true) })
                return
            }
            val intent = Intent(
                Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                Uri.parse("package:${context.packageName}")
            ).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
            call.resolve(JSObject().apply { put("alreadyExempt", false) })
        } catch (e: Exception) {
            call.reject("Failed to request battery optimization exemption", e)
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
        val ctx = context
        saveExecutor.submit {
            try {
                core.init(ctx)
                core.startServer(ctx)
                activityRef.get()?.runOnUiThread { call.resolve() }
                    ?: call.reject("Activity destroyed during init")
            } catch (e: Exception) {
                activityRef.get()?.runOnUiThread { call.reject("Failed to initialize SpotDL", e) }
                    ?: call.reject("Activity destroyed during init")
            }
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
            val currentLyricLine = call.getString("currentLyricLine")
            MediaService.start(ctx, title, artist, artworkUrl, position, duration, currentLyricLine)
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
            val currentLyricLine = call.getString("currentLyricLine")
            MediaService.update(ctx, title, artist, artworkUrl, position, duration, currentLyricLine)
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
        val ctx = context
        saveExecutor.submit {
            try {
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
                activityRef.get()?.runOnUiThread {
                    call.resolve(JSObject().apply { put("tracks", tracks) })
                } ?: call.reject("Activity destroyed")
            } catch (e: Exception) {
                activityRef.get()?.runOnUiThread { call.reject("Failed to scan local music", e) }
                    ?: call.reject("Activity destroyed")
            }
        }
    }

    @PluginMethod
    fun saveToMusicLibrary(call: PluginCall) {
        val url = call.getString("url") ?: run {
            call.reject("url is required")
            return
        }
        val filename = call.getString("filename") ?: run {
            call.reject("filename is required")
            return
        }

        val taskId = UUID.randomUUID().toString()
        val future = saveExecutor.submit<Unit> {
            val act = activityRef.get()
            try {
                val conn = java.net.URL("$LOCAL_URL/download").openConnection() as java.net.HttpURLConnection
                conn.requestMethod = "POST"
                conn.doOutput = true
                conn.setRequestProperty("Content-Type", "application/json")
                conn.connectTimeout = 30000
                conn.readTimeout = 120000

                val requestBody = JSONObject().apply { put("url", url) }.toString()
                conn.outputStream.use { it.write(requestBody.toByteArray()) }

                val responseBytes = conn.inputStream.readBytes()
                val responseStr = String(responseBytes, Charsets.UTF_8)
                val responseJson = org.json.JSONObject(responseStr)

                if (responseJson.has("error")) {
                    throw Exception(responseJson.getString("error"))
                }

                val filesArray = responseJson.getJSONArray("files")
                if (filesArray.length() == 0) {
                    throw Exception("No files downloaded")
                }

                val sourcePath = filesArray.getString(0)
                val sourceFile = java.io.File(sourcePath)
                if (!sourceFile.exists()) {
                    throw Exception("Downloaded file not found: $sourcePath")
                }

                val bufSize = 8192
                val ctx = context
                val filePath: String

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    val values = ContentValues().apply {
                        put(MediaStore.Audio.Media.DISPLAY_NAME, filename)
                        put(MediaStore.Audio.Media.MIME_TYPE, "audio/mpeg")
                        put(MediaStore.Audio.Media.IS_MUSIC, 1)
                        put(MediaStore.Audio.Media.RELATIVE_PATH, Environment.DIRECTORY_MUSIC)
                    }
                    val uri = ctx.contentResolver.insert(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, values)
                        ?: throw Exception("Failed to create MediaStore entry")
                    val os = ctx.contentResolver.openOutputStream(uri)
                        ?: throw Exception("Failed to open MediaStore output stream")
                    os.use { out ->
                        BufferedInputStream(sourceFile.inputStream()).use { `in` ->
                            val buffer = ByteArray(bufSize)
                            var read: Int
                            while (`in`.read(buffer).also { read = it } != -1) {
                                if (Thread.currentThread().isInterrupted) throw java.io.InterruptedIOException("Save cancelled")
                                out.write(buffer, 0, read)
                            }
                        }
                    }
                    filePath = uri.toString()
                } else {
                    val musicDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MUSIC)
                    musicDir.mkdirs()
                    val file = java.io.File(musicDir, filename)
                    BufferedInputStream(sourceFile.inputStream()).use { `in` ->
                        FileOutputStream(file).use { out ->
                            val buffer = ByteArray(bufSize)
                            var read: Int
                            while (`in`.read(buffer).also { read = it } != -1) {
                                if (Thread.currentThread().isInterrupted) throw java.io.InterruptedIOException("Save cancelled")
                                out.write(buffer, 0, read)
                            }
                        }
                    }
                    filePath = file.absolutePath
                }

                val outputDir = responseJson.optString("output_dir", "")
                if (outputDir.isNotEmpty()) {
                    try { java.io.File(outputDir).deleteRecursively() } catch (_: Exception) {}
                }

                activeSaves.remove(taskId)
                act?.runOnUiThread { call.resolve(JSObject().apply { put("filePath", filePath) }) }
                    ?: call.reject("Activity destroyed during save")
            } catch (e: java.io.InterruptedIOException) {
                call.reject("Save cancelled")
            } catch (e: Exception) {
                activeSaves.remove(taskId)
                act?.runOnUiThread { call.reject("Failed to save to music library", e) }
                    ?: call.reject("Activity destroyed during save")
            }
        }
        activeSaves[taskId] = future
    }
}
