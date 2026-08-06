package com.sinc.enhanced.data.remote.spotify

import android.util.Log
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.util.regex.Pattern

class HtmlPageScraper(private val client: OkHttpClient) {

    companion object {
        private const val BROWSER_UA =
            "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.230 Mobile Safari/537.36"
        private val NEXT_DATA_PATTERN = Pattern.compile(
            """<script id="__NEXT_DATA__"[^>]*>(.*?)</script>""",
            Pattern.DOTALL
        )
    }

    /** Fetches raw HTML with browser-like headers. Returns null on failure. */
    fun fetchUrl(url: String): String? {
        return try {
            val request = Request.Builder()
                .url(url)
                .header("User-Agent", BROWSER_UA)
                .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
                .header("Accept-Language", "en-US,en;q=0.5")
                .build()
            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) return null
                response.body?.string()
            }
        } catch (ce: CancellationException) { throw ce }
        catch (e: Exception) {
            Log.e("HtmlPageScraper", "fetchUrl failed: $url", e)
            null
        }
    }

    /** Extracts the embedded __NEXT_DATA__ JSON payload from a Spotify web page. */
    suspend fun fetchNextData(url: String): JSONObject? = withContext(Dispatchers.IO) {
        val html = fetchUrl(url) ?: return@withContext null
        val matcher = NEXT_DATA_PATTERN.matcher(html)
        if (!matcher.find()) return@withContext null
        try { JSONObject(matcher.group(1) ?: return@withContext null) } catch (_: Exception) { null }
    }
}
