package com.sinc.enhanced.data.remote.spotify

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.util.regex.Pattern

/**
 * Fetches and caches Spotify's anonymous access token by scraping the
 * __NEXT_DATA__ payload from an embed page. Token is refreshed when it
 * approaches expiry.
 */
class AnonymousTokenProvider(
    private val htmlScraper: HtmlPageScraper
) {
    companion object {
        private const val EMBED_BOOTSTRAP_ID = "4uLU6hMCjMI75M1A2tKUQC"
        private const val TOKEN_TTL_MS = 3600000L
        private val TOKEN_PATTERN = Pattern.compile(
            """<script id="__NEXT_DATA__"[^>]*>(.*?)</script>""",
            Pattern.DOTALL
        )
    }

    @Volatile private var token: String? = null
    @Volatile private var expiresAt: Long = 0
    private val tokenMutex = Mutex()

    suspend fun getToken(): String = withContext(Dispatchers.IO) {
        tokenMutex.withLock {
            token?.let { cached ->
                if (System.currentTimeMillis() < expiresAt - 60000) return@withLock cached
            }
            val html = htmlScraper.fetchUrl("https://open.spotify.com/embed/track/$EMBED_BOOTSTRAP_ID")
                ?: throw Exception("Failed to fetch embed page")
            val matcher = TOKEN_PATTERN.matcher(html)
            if (!matcher.find()) throw Exception("No __NEXT_DATA__ in embed page")
            val nextData = JSONObject(matcher.group(1) ?: throw Exception("Empty __NEXT_DATA__ match"))
            val freshToken = nextData
                .getJSONObject("props")
                .getJSONObject("pageProps")
                .getJSONObject("state")
                .getJSONObject("settings")
                .getJSONObject("session")
                .getString("accessToken")
            token = freshToken
            expiresAt = System.currentTimeMillis() + TOKEN_TTL_MS
            freshToken
        }
    }
}
