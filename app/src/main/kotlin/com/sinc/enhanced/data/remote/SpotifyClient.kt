package com.sinc.enhanced.data.remote

import com.sinc.enhanced.data.model.Album
import com.sinc.enhanced.data.model.Artist
import com.sinc.enhanced.data.model.Track
import com.sinc.enhanced.data.remote.spotify.HtmlPageScraper
import com.sinc.enhanced.data.remote.spotify.PathfinderClient
import com.sinc.enhanced.data.remote.spotify.SpotifyEntityParser
import org.json.JSONObject

/**
 * Public facade for Spotify search/metadata lookups. Token management,
 * HTML scraping, Pathfinder GraphQL calls and JSON parsing live in
 * [PathfinderClient], [HtmlPageScraper] and [SpotifyEntityParser].
 */
class SpotifyClient(
    private val pathfinder: PathfinderClient,
    private val htmlScraper: HtmlPageScraper,
    private val parser: SpotifyEntityParser
) {

    data class PlaylistTracksResult(
        val tracks: List<Track>,
        val nextOffset: Int?
    )

    suspend fun searchTracks(query: String, limit: Int = 10): List<Track> {
        val vars = searchVariables(query, limit)
        val json = pathfinder.querySearch(vars) ?: return emptyList()
        return parser.parseSearchTracks(json)
    }

    suspend fun searchAlbums(query: String, limit: Int = 5): List<Album> {
        val vars = searchVariables(query, limit, topResults = 3)
        val json = pathfinder.querySearch(vars) ?: return emptyList()
        return parser.parseSearchAlbums(json)
    }

    suspend fun searchArtists(query: String, limit: Int = 5): List<Artist> {
        val vars = searchVariables(query, limit, topResults = 3)
        val json = pathfinder.querySearch(vars) ?: return emptyList()
        return parser.parseSearchArtists(json)
    }

    suspend fun getPlaylist(playlistId: String): Map<String, Any?>? {
        val vars = playlistVariables(playlistId, offset = 0, limit = 1)
        val json = pathfinder.queryPlaylist(vars) ?: return null
        return parser.parsePlaylist(json, playlistId)
    }

    suspend fun getPlaylistTracks(playlistId: String, offset: Int = 0, limit: Int = 100): PlaylistTracksResult {
        val vars = playlistVariables(playlistId, offset, limit)
        val json = pathfinder.queryPlaylist(vars) ?: return PlaylistTracksResult(emptyList(), null)
        return parser.parsePlaylistTracks(json, offset, limit)
    }

    suspend fun getTrack(trackId: String): Track? {
        val vars = JSONObject().apply { put("uri", "spotify:track:$trackId") }
        val json = pathfinder.queryTrack(vars) ?: return null
        return parser.parseTrack(json)
    }

    suspend fun getAlbum(albumId: String): Album? {
        val page = htmlScraper.fetchNextData("https://open.spotify.com/album/$albumId") ?: return null
        return parser.parseAlbumPage(page, albumId)
    }

    suspend fun getArtist(artistId: String): Artist? {
        val page = htmlScraper.fetchNextData("https://open.spotify.com/artist/$artistId") ?: return null
        return parser.parseArtistPage(page, artistId)
    }

    suspend fun getArtistTopTracks(artistId: String, market: String = "US"): List<Track> {
        val page = htmlScraper.fetchNextData("https://open.spotify.com/artist/$artistId") ?: return emptyList()
        return parser.parseArtistTopTracks(page)
    }

    suspend fun getRelatedArtists(artistId: String): List<Artist> {
        val page = htmlScraper.fetchNextData("https://open.spotify.com/artist/$artistId") ?: return emptyList()
        return parser.parseRelatedArtists(page)
    }

    private fun searchVariables(query: String, limit: Int, topResults: Int = 5): JSONObject = JSONObject().apply {
        put("searchTerm", query)
        put("offset", 0)
        put("limit", limit)
        put("numberOfTopResults", topResults)
        put("includeAudiobooks", limit > 5)
        put("includePreReleases", limit > 5)
        put("includeAlbumPreReleases", false)
        put("includeAuthors", false)
        put("includeEpisodeContentRatingsV2", false)
    }

    private fun playlistVariables(playlistId: String, offset: Int, limit: Int): JSONObject = JSONObject().apply {
        put("uri", "spotify:playlist:$playlistId")
        put("offset", offset)
        put("limit", limit)
        put("enableWatchFeedEntrypoint", false)
    }
}
