package com.sinc.enhanced.data.download

import android.content.ContentValues
import android.content.Context
import android.content.pm.PackageManager
import android.media.MediaScannerConnection
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import com.sinc.enhanced.data.error.AppError
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.atomic.AtomicLong

class AudioFileDownloader(
    private val context: Context,
    private val okHttpClient: OkHttpClient
) {

    private val downloadsDir: File
        get() = File(
            Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MUSIC),
            "Sinc Enhanced"
        )

    /**
     * Downloads the stream at [url] to a temp file and publishes it to the
     * media store (or legacy external storage). Returns the published file,
     * or null if the download failed. Throws [AppError.InsufficientSpaceError]
     * when the device lacks storage.
     */
    suspend fun download(
        request: DownloadRequest,
        url: String,
        onProgress: suspend (progress: Float, speedBps: Float) -> Unit
    ): DownloadedFile? = withContext(Dispatchers.IO) {
        try {
            val response = okHttpClient.newCall(Request.Builder().url(url).build()).execute()
            response.use { resp ->
                if (!resp.isSuccessful) return@use null

                val body = resp.body ?: return@use null
                val contentLength = body.contentLength()
                val mimeType = resp.header("Content-Type") ?: ""
                val fileName = buildFileName(request, extensionFor(mimeType, url))

                if (!downloadsDir.exists()) downloadsDir.mkdirs()
                val outputFile = File(downloadsDir, fileName)
                val tempFile = File(downloadsDir, "$fileName.tmp")
                outputFile.delete()
                tempFile.delete()

                if (contentLength > 0 && !hasEnoughSpace(outputFile, contentLength)) {
                    throw AppError.InsufficientSpaceError(
                        requiredBytes = contentLength,
                        availableBytes = outputFile.parentFile?.freeSpace ?: 0L
                    )
                }

                val startTime = AtomicLong(System.currentTimeMillis())
                val bytesRead = body.byteStream().use { stream ->
                    FileOutputStream(tempFile).use { output ->
                        writeWithSpeedLimit(stream, output, contentLength, startTime, onProgress)
                    }
                }

                if (bytesRead == 0L) {
                    tempFile.delete()
                    return@use null
                }

                val audioPath = publishFile(tempFile, outputFile, fileName, mimeType, request)
                    ?: return@use null

                DownloadedFile(audioPath, bytesRead, mimeType)
            }
        } catch (e: AppError) {
            throw e
        } catch (_: Exception) {
            null
        }
    }

    private fun extensionFor(mimeType: String, url: String): String = when {
        mimeType.startsWith("audio/mpeg") -> "mp3"
        mimeType.startsWith("audio/mp4") || mimeType.startsWith("audio/aac") -> "m4a"
        mimeType.startsWith("audio/webm") || mimeType.startsWith("video/webm") -> "webm"
        mimeType.startsWith("audio/opus") || mimeType.startsWith("audio/ogg") -> "opus"
        mimeType.startsWith("audio/wav") -> "wav"
        mimeType.startsWith("audio/flac") -> "flac"
        url.contains(".m4a") || url.contains(".mp4") -> "m4a"
        url.contains(".webm") -> "webm"
        url.contains(".opus") -> "opus"
        else -> "mp3"
    }

    private fun buildFileName(request: DownloadRequest, extension: String): String {
        val artist = sanitizeFileName(request.artist)
        val title = sanitizeFileName(request.title)
        return "$artist - $title.$extension"
    }

    private suspend fun writeWithSpeedLimit(
        stream: java.io.InputStream,
        output: java.io.OutputStream,
        contentLength: Long,
        startTime: AtomicLong,
        onProgress: suspend (progress: Float, speedBps: Float) -> Unit
    ): Long {
        val buffer = ByteArray(65536)
        var bytesRead: Long = 0
        var read: Int

        while (stream.read(buffer).also { read = it } != -1) {
            output.write(buffer, 0, read)
            bytesRead += read

            if (contentLength > 0) {
                val progress = (bytesRead.toFloat() / contentLength.toFloat()).coerceIn(0f, 1f)
                val elapsed = (System.currentTimeMillis() - startTime.get()) / 1000f
                val speed = if (elapsed > 0) bytesRead.toFloat() / elapsed else 0f
                onProgress(progress, speed)
            }
        }
        return bytesRead
    }

    /** Moves [tempFile] into the media store (API 29+) or legacy storage. */
    private fun publishFile(
        tempFile: File,
        outputFile: File,
        fileName: String,
        mimeType: String,
        request: DownloadRequest
    ): String? {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val values = ContentValues().apply {
                put(MediaStore.Audio.Media.DISPLAY_NAME, fileName)
                put(MediaStore.Audio.Media.MIME_TYPE, mimeType.ifEmpty { "audio/mpeg" })
                put(MediaStore.Audio.Media.ARTIST, request.artist)
                put(MediaStore.Audio.Media.TITLE, request.title)
                put(MediaStore.Audio.Media.ALBUM, request.album)
                put(MediaStore.Audio.Media.RELATIVE_PATH, "Music/Sinc Enhanced")
                put(MediaStore.Audio.Media.IS_MUSIC, true)
            }
            val uri: Uri? = context.contentResolver.insert(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, values)
            if (uri != null) {
                context.contentResolver.openOutputStream(uri)?.use { mediaOut ->
                    tempFile.inputStream().use { tempIn -> tempIn.copyTo(mediaOut) }
                }
                tempFile.delete()
                return uri.toString()
            }
            return if (hasStoragePermission()) {
                tempFile.renameTo(outputFile)
                MediaScannerConnection.scanFile(context, arrayOf(outputFile.absolutePath), null, null)
                outputFile.absolutePath
            } else null
        }
        return if (hasStoragePermission()) {
            tempFile.renameTo(outputFile)
            MediaScannerConnection.scanFile(context, arrayOf(outputFile.absolutePath), null, null)
            outputFile.absolutePath
        } else null
    }

    private fun hasEnoughSpace(file: File, requiredBytes: Long): Boolean {
        val usable = file.parentFile?.freeSpace ?: return false
        return usable > requiredBytes + (10 * 1024 * 1024)
    }

    private fun hasStoragePermission(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            Environment.isExternalStorageManager()
        } else {
            context.checkSelfPermission(android.Manifest.permission.WRITE_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED
        }
    }

    private fun sanitizeFileName(name: String): String {
        return name.replace(Regex("""[\\/:*?"<>|]"""), "_").trim().take(200)
    }
}
