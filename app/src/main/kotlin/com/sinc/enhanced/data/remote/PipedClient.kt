package com.sinc.enhanced.data.remote

import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.net.URLEncoder

class PipedClient(
    private val client: OkHttpClient,
    private val probeClient: OkHttpClient
) {

    companion object {
        private val INSTANCES = listOf(
            "https://pipedapi.kavin.rocks",
            "https://pipedapi.smnz.de",
            "https://pipedapi.adminforge.de",
            "https://pipedapi.r4fo.com",
            "https://pipedapi.syncpundit.io",
            "https://api-piped.mha.fi",
            "https://piped-api.garudalinux.org",
            "https://pipedapi.leptons.xyz",
            "https://pipedapi.moomoo.me",
            "https://pipedapi.pfcd.me",
            "https://pipedapi.drgns.space",
            "https://pipedapi.qdi.fi"
        )
    }

    data class PipedSearchResult(
        val title: String,
        val uploader: String,
        val duration: Long,
        val thumbnailUrl: String?,
        val url: String,
        val videoId: String,
        val uploaderUrl: String? = null
    )

    data class PipedStream(
        val url: String,
        val audioTrackUrl: String? = null,
        val videoId: String,
        val title: String,
        val duration: Long,
        val thumbnailUrl: String? = null
    )

    @Volatile private var lastWorkingInstance: String? = null

    private fun getInstance(): String {
        return lastWorkingInstance ?: INSTANCES.first()
    }

    private fun <T> tryInstances(block: (String) -> T?): T? {
        val instances = if (lastWorkingInstance != null) {
            listOfNotNull(lastWorkingInstance) + INSTANCES.filter { it != lastWorkingInstance }
        } else INSTANCES
        for (instance in instances) {
            try {
                val result = block(instance)
                if (result != null) {
                    lastWorkingInstance = instance
                    return result
                }
            } catch (e: Exception) { Log.e("PipedClient", "tryInstances failed", e) }
        }
        return null
    }

    suspend fun search(query: String, limit: Int = 5, filter: String? = "music"): List<PipedSearchResult> = withContext(Dispatchers.IO) {
        tryInstances { instance ->
            val filterParam = if (filter != null) "&filter=$filter" else ""
            val url = "$instance/search?q=${URLEncoder.encode(query, "UTF-8")}$filterParam"
            val request = Request.Builder().url(url).build()
            val response = probeClient.newCall(request).execute()
            if (!response.isSuccessful) return@tryInstances null
            val json = JSONObject(response.body?.string() ?: return@tryInstances null)
            val items = json.optJSONArray("items") ?: return@tryInstances null
            (0 until minOf(items.length(), limit)).mapNotNull { i ->
                val item = items.getJSONObject(i)
                val duration = item.optLong("duration") ?: 0L
                PipedSearchResult(
                    title = item.optString("title"),
                    uploader = item.optString("uploader"),
                    duration = duration,
                    thumbnailUrl = item.optString("thumbnail"),
                    url = item.optString("url"),
                    videoId = item.optString("url").substringAfter("watch?v=").substringBefore("&"),
                    uploaderUrl = item.optString("uploaderUrl")
                )
            }
        } ?: emptyList()
    }

    suspend fun getStreams(videoId: String): PipedStream? = withContext(Dispatchers.IO) {
        tryInstances { instance ->
            val url = "$instance/streams/$videoId"
            val request = Request.Builder().url(url).build()
            val response = probeClient.newCall(request).execute()
            if (!response.isSuccessful) return@tryInstances null
            val json = JSONObject(response.body?.string() ?: return@tryInstances null)
            val audioStreams = json.optJSONArray("audioStreams") ?: return@tryInstances null
            val bestAudio = if (audioStreams.length() > 0) {
                (0 until audioStreams.length()).map { audioStreams.getJSONObject(it) }
                    .maxByOrNull { it.optInt("bitrate", 0) }
            } else null
            PipedStream(
                url = bestAudio?.optString("url") ?: json.optString("hls") ?: "",
                audioTrackUrl = bestAudio?.optString("url"),
                videoId = videoId,
                title = json.optString("title"),
                duration = json.optLong("duration"),
                thumbnailUrl = json.optString("thumbnailUrl")
            )
        }
    }
}
