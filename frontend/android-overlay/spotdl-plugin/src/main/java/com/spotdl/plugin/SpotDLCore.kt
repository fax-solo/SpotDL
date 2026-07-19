package com.spotdl.plugin

import android.content.Context
import android.os.Build
import android.util.Log
import org.apache.commons.compress.archivers.zip.ZipArchiveInputStream
import org.apache.commons.io.FileUtils
import org.apache.commons.io.IOUtils
import java.io.ByteArrayInputStream
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.lang.reflect.Field
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

class SpotDLCore {
    private var initialized = false
    private var serverProcess: Process? = null
    private lateinit var pythonPath: File
    private lateinit var serverScript: File
    private lateinit var pythonDir: File
    private lateinit var ffmpegDir: File
    private lateinit var homeDir: File

    private var envLdLibraryPath: String = ""
    private var envPythonHome: String = ""
    private var ffmpegBinPath: String = ""
    private var envSslCertFile: String = ""

    private var shutdownHook: Thread? = null

    val isInitialized: Boolean get() = initialized
    val isServerRunning: Boolean get() = serverProcess?.isAlive == true

    private val LIBRARY_NAME = "spotdl-android"
    private val PACKAGES_ROOT = "packages"
    private val PYTHON_DIR_NAME = "python"
    private val FFMPEG_DIR_NAME = "ffmpeg"
    private val BINARIES_PYTHON = "libpython.so"
    private val SERVER_SCRIPT_NAME = "server.py"

    @Synchronized
    fun init(context: Context) {
        if (initialized) return

        val baseDir = File(context.noBackupFilesDir, LIBRARY_NAME).apply { mkdirs() }
        val packagesDir = File(baseDir, PACKAGES_ROOT).apply { mkdirs() }
        val binariesDir = File(context.applicationInfo.nativeLibraryDir!!)
        homeDir = baseDir

        val usableSpace = context.noBackupFilesDir!!.usableSpace
        val minRequired = 100L * 1024 * 1024
        if (usableSpace < minRequired) {
            throw IOException("Insufficient disk space: ${usableSpace / 1024 / 1024}MB free, need at least ${minRequired / 1024 / 1024}MB")
        }

        pythonPath = File(binariesDir, BINARIES_PYTHON)
        pythonDir = File(packagesDir, PYTHON_DIR_NAME)
        ffmpegDir = File(packagesDir, FFMPEG_DIR_NAME)

        val ffmpegBinary = File(binariesDir, "libffmpeg.so")
        ffmpegBinPath = ffmpegBinary.absolutePath

        envLdLibraryPath = "${pythonDir.absolutePath}/usr/lib:${ffmpegDir.absolutePath}/usr/lib"
        envSslCertFile = "${pythonDir.absolutePath}/usr/etc/tls/cert.pem"
        envPythonHome = "${pythonDir.absolutePath}/usr"

        try {
            extractZipAsset(context, "python", pythonDir)
            extractZipAsset(context, "ffmpeg", ffmpegDir)
            extractServerScript(context, baseDir)
            registerShutdownHook()
            initialized = true
            Log.i(LOG_TAG, "SpotDLCore initialized successfully")
        } catch (e: Exception) {
            Log.e(LOG_TAG, "Failed to initialize SpotDLCore", e)
            throw RuntimeException("Failed to initialize SpotDL", e)
        }
    }

    private fun registerShutdownHook() {
        if (shutdownHook != null) return
        val hook = Thread {
            val proc = serverProcess
            if (proc?.isAlive == true) {
                Log.i(LOG_TAG, "Shutdown hook: killing server process")
                proc.destroy()
                try { proc.waitFor(3, TimeUnit.SECONDS) } catch (_: Exception) {}
                if (proc.isAlive) proc.destroyForcibly()
            }
        }
        shutdownHook = hook
        try {
            Runtime.getRuntime().addShutdownHook(hook)
        } catch (_: IllegalStateException) {
            // VM already shutting down
        }
    }

    private fun extractZipAsset(context: Context, name: String, destDir: File) {
        if (destDir.exists() && destDir.listFiles()?.isNotEmpty() == true) {
            Log.i(LOG_TAG, "$name already extracted")
            return
        }

        FileUtils.deleteQuietly(destDir)
        destDir.mkdirs()

        try {
            val resId = context.resources.getIdentifier(name, "raw", context.packageName)
            if (resId == 0) {
                throw IOException("Resource $name.zip not found in res/raw/")
            }
            context.resources.openRawResource(resId).use { input ->
                ZipArchiveInputStream(input).use { zip ->
                    var entry = zip.nextZipEntry
                    while (entry != null) {
                        val target = File(destDir, entry.name)
                        if (entry.isDirectory) {
                            target.mkdirs()
                        } else {
                            target.parentFile?.mkdirs()
                            FileOutputStream(target).use { output ->
                                IOUtils.copy(zip, output)
                            }
                            target.setExecutable(true, false)
                        }
                        entry = zip.nextZipEntry
                    }
                }
            }
            Log.i(LOG_TAG, "$name extracted to ${destDir.absolutePath}")
        } catch (e: Exception) {
            FileUtils.deleteQuietly(destDir)
            throw IOException("Failed to extract $name", e)
        }
    }

    private fun extractServerScript(context: Context, destDir: File) {
        serverScript = File(destDir, SERVER_SCRIPT_NAME)
        if (serverScript.exists()) return

        try {
            val resId = context.resources.getIdentifier(
                SERVER_SCRIPT_NAME.removeSuffix(".py"), "raw", context.packageName
            )
            if (resId != 0) {
                context.resources.openRawResource(resId).use { input ->
                    FileOutputStream(serverScript).use { output ->
                        input.copyTo(output)
                    }
                }
            } else {
                context.assets.open(SERVER_SCRIPT_NAME).use { input ->
                    FileOutputStream(serverScript).use { output ->
                        input.copyTo(output)
                    }
                }
            }
            serverScript.setExecutable(true)
        } catch (e: Exception) {
            throw IOException("Failed to extract server script", e)
        }
    }

    private fun getPid(process: Process): Int {
        return try {
            val pidMethod = process.javaClass.getMethod("pid")
            pidMethod.invoke(process) as Int
        } catch (_: Exception) {
            try {
                val field: Field = process.javaClass.getDeclaredField("pid")
                field.isAccessible = true
                field.getInt(process)
            } catch (_: Exception) {
                -1
            }
        }
    }

    @Synchronized
    fun startServer(context: Context) {
        if (serverProcess?.isAlive == true) return

        val command = listOf(
            "sh", "-c", "exec ${pythonPath.absolutePath} ${serverScript.absolutePath}"
        )

        val pb = ProcessBuilder(command)
        pb.environment().apply {
            put("LD_LIBRARY_PATH", envLdLibraryPath)
            put("SSL_CERT_FILE", envSslCertFile)
            put("PATH", (System.getenv("PATH") ?: "/system/bin") + ":" + File(context.applicationInfo.nativeLibraryDir!!).absolutePath)
            put("PYTHONHOME", envPythonHome)
            put("HOME", homeDir.absolutePath)
            put("FFMPEG_PATH", ffmpegBinPath)
            put("SPOTDL_HOME", homeDir.absolutePath)
            put("TERM", "xterm-256color")
        }
        pb.directory(homeDir)
        pb.redirectErrorStream(true)

        Log.i(LOG_TAG, "Starting Python server: ${command.joinToString(" ")}")

        val proc = pb.start()
        try {
            serverProcess = proc

            val latch = CountDownLatch(1)
            Thread {
                proc.inputStream.bufferedReader().use { reader ->
                    var line: String?
                    while (reader.readLine().also { line = it } != null) {
                        Log.i(LOG_TAG, "[server] $line")
                        if (line?.contains("starting on") == true) {
                            latch.countDown()
                        }
                    }
                }
                latch.countDown()
            }.apply {
                isDaemon = true
                start()
            }

            val started = latch.await(10, TimeUnit.SECONDS)
            if (!started || !proc.isAlive) {
                val exit = proc.exitValue()
                throw RuntimeException("Server exited with code $exit")
            }
            Log.i(LOG_TAG, "Python server started on port 9182")
        } catch (e: Exception) {
            serverProcess = null
            proc.destroy()
            try { proc.waitFor(1, TimeUnit.SECONDS) } catch (_: Exception) {}
            if (proc.isAlive) proc.destroyForcibly()
            throw RuntimeException("Failed to start server", e)
        }
    }

    fun stopServer() {
        serverProcess?.let {
            if (it.isAlive) {
                it.destroy()
                try { it.waitFor(3, TimeUnit.SECONDS) } catch (_: Exception) {}
                if (it.isAlive) it.destroyForcibly()
            }
        }
        serverProcess = null
    }

    companion object {
        private const val LOG_TAG = "SpotDLCore"
    }
}
