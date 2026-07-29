package com.sinc.enhanced.data.audio

import com.sinc.enhanced.BuildConfig
import com.sinc.enhanced.data.model.Track
import com.sinc.enhanced.data.util.MatchScorer
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class YtDlpAudioResolver(
    private val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .writeTimeout(15, TimeUnit.SECONDS)
        .build(),
    private val baseUrl: String = BuildConfig.YTDLP_BACKEND_URL,
    private val apiKey: String = ""
) : AudioResolver {

    override suspend fun resolve(track: Track, context: ResolutionContext): AudioCandidate? {
        if (baseUrl.isBlank()) return null

        return withContext(Dispatchers.IO) {
            try {
                val body = JSONObject().apply {
                    put("title", track.title)
                    put("artist", track.artist)
                    put("album", track.album ?: "")
                    if (!track.isrc.isNullOrBlank()) put("isrc", track.isrc)
                    if (track.durationMs > 0) put("duration_ms", track.durationMs)
                }

                val requestBuilder = Request.Builder()
                    .url("${baseUrl.trimEnd('/')}/api/resolve-audio")
                    .post(body.toString().toRequestBody("application/json".toMediaType()))
                    .header("Content-Type", "application/json")
                if (apiKey.isNotBlank()) {
                    requestBuilder.header("Authorization", "Bearer $apiKey")
                }

                val response = client.newCall(requestBuilder.build()).execute()
                if (!response.isSuccessful) return@withContext null

                val json = JSONObject(response.body?.string() ?: return@withContext null)
                if (!json.optBoolean("ok", false)) return@withContext null

                val audioUrl = json.optString("url", "")
                if (audioUrl.isBlank()) return@withContext null

                val source = json.optString("source", "youtube")
                val foundTitle = json.optString("title", track.title)
                val foundArtist = json.optString("artist", track.artist)
                val duration = json.optInt("duration", 0)

                val score = MatchScorer.computeScore(MatchScorer.MatchOptions(
                    expectedTitle = track.title,
                    expectedArtist = track.artist,
                    foundTitle = foundTitle,
                    foundAuthor = foundArtist,
                    foundDurationSec = if (duration > 0) duration.toLong() else null,
                    expectedDurationSec = if (track.durationMs > 0) track.durationMs / 1000 else null,
                    expectedIsrc = track.isrc
                ))

                if (score >= MatchScorer.MIN_CONFIDENCE) {
                    AudioCandidate(audioUrl, source, score)
                } else null

            } catch (_: Exception) { null }
        }
    }
}
