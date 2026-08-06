package com.sinc.enhanced.data.recommendation

import com.sinc.enhanced.data.local.dao.RecommendationDao
import com.sinc.enhanced.data.local.dao.SearchHistoryDao
import com.sinc.enhanced.data.local.entity.HistoryEntity
import com.sinc.enhanced.data.local.entity.LikedTrackEntity
import com.sinc.enhanced.data.local.entity.PlayCountEntity
import com.sinc.enhanced.data.model.Track
import com.sinc.enhanced.data.repository.SearchRepository
import com.sinc.enhanced.data.sync.RecommendationSyncManager
import com.sinc.enhanced.data.util.IdGenerator
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.util.Calendar

data class RecommendedPlaylist(
    val id: String,
    val name: String,
    val description: String,
    val tracks: List<Track>,
    val reason: String
)

class RecommendationEngine(
    private val searchRepository: SearchRepository,
    private val searchHistoryDao: SearchHistoryDao,
    private val recommendationDao: RecommendationDao,
    private val syncManager: RecommendationSyncManager
) {
    private var cachedPlaylists: Pair<Long, List<RecommendedPlaylist>>? = null
    private val cacheTtlMs = 600_000L // 10 minutes

    suspend fun generateHomePlaylists(limit: Int = 5): List<RecommendedPlaylist> = withContext(Dispatchers.Default) {
        cachedPlaylists?.let { (timestamp, playlists) ->
            if (System.currentTimeMillis() - timestamp < cacheTtlMs) {
                return@withContext playlists.take(limit)
            }
        }

        val playlists = generatePlaylists()

        cachedPlaylists = System.currentTimeMillis() to playlists
        playlists.take(limit)
    }

    private suspend fun generatePlaylists(): List<RecommendedPlaylist> {
        val playlists = mutableListOf<RecommendedPlaylist>()

        val topArtists = recommendationDao.getTopArtists()
        val topGenres = recommendationDao.getTopGenreNames()
        val recentSearches = searchHistoryDao.getRecentQueries().filterNotNull().distinct()

        if (topArtists.isNotEmpty()) {
            val similarTracks = findSimilarArtists(topArtists.take(3))
            if (similarTracks.isNotEmpty()) {
                playlists.add(RecommendedPlaylist(
                    id = IdGenerator.generateWithPrefix("rec_liked"),
                    name = "Because You Liked",
                    description = "Tracks from artists similar to your favorites",
                    tracks = similarTracks,
                    reason = "based_on_liked"
                ))
            }
        }

        if (playlists.size < 3) {
            for (genre in topGenres.take(2)) {
                val tracks = searchRepository.searchYouTubeOnly(genre)
                    .take(10)
                    .map { it.track }
                if (tracks.isNotEmpty()) {
                    playlists.add(RecommendedPlaylist(
                        id = IdGenerator.generateWithPrefix("rec_genre"),
                        name = genre.replaceFirstChar { it.uppercase() },
                        description = "Top tracks in your favorite genre",
                        tracks = tracks,
                        reason = "genre"
                    ))
                }
            }
        }

        if (playlists.size < 3 && topArtists.isNotEmpty()) {
            for (artist in topArtists.take(2)) {
                val moreTracks = searchRepository.searchYouTubeOnly(artist)
                    .take(10).map { it.track }
                if (moreTracks.isNotEmpty()) {
                    playlists.add(RecommendedPlaylist(
                        id = IdGenerator.generateWithPrefix("rec_artist"),
                        name = "More Like $artist",
                        description = "Because you listened to $artist",
                        tracks = moreTracks,
                        reason = "artist"
                    ))
                }
            }
        }

        if (playlists.size < 3 && topGenres.isNotEmpty()) {
            val year = Calendar.getInstance().get(Calendar.YEAR)
            val newReleases = topGenres.take(2).flatMap { genre ->
                searchRepository.searchYouTubeOnly("new ${genre} music $year")
                    .take(5).map { it.track }
            }.distinctBy { it.id }.take(15)
            if (newReleases.isNotEmpty()) {
                playlists.add(RecommendedPlaylist(
                    id = IdGenerator.generateWithPrefix("rec_new_releases"),
                    name = "New Releases For You",
                    description = "Latest tracks in your favorite genres",
                    tracks = newReleases,
                    reason = "new_releases"
                ))
            }
        }

        if (recentSearches.isNotEmpty() && topArtists.isEmpty() && topGenres.isEmpty()) {
            val searchBased = recentSearches.take(2).flatMap { query ->
                searchRepository.searchYouTubeOnly(query).take(5).map { it.track }
            }.distinctBy { it.id }.take(15)
            if (searchBased.isNotEmpty()) {
                playlists.add(RecommendedPlaylist(
                    id = IdGenerator.generateWithPrefix("rec_search"),
                    name = "Based on Your Searches",
                    description = "Music related to what you've searched",
                    tracks = searchBased,
                    reason = "search"
                ))
            }
        }

        return playlists.take(3)
    }

    suspend fun recordPlay(track: Track) {
        recommendationDao.incrementPlayCount(track.id, track.artist, track.title)
        syncManager.pushPlay(track.id, track.artist, track.title, 1, System.currentTimeMillis())
    }

    suspend fun recordGenreInteraction(genre: String, affinity: Float = 0.5f) {
        recommendationDao.recordGenreInteraction(genre, affinity)
        syncManager.pushGenre(genre, affinity)
    }

    suspend fun recordSearchIntent(query: String) {
        val queryLower = query.lowercase().trim()
        val knownGenres = listOf("rock", "pop", "jazz", "hip hop", "rap", "electronic",
            "classical", "rnb", "r&b", "country", "blues", "metal", "punk", "folk",
            "indie", "latin", "reggae", "dance", "soul", "funk", "ambient", "techno",
            "house", "dubstep", "drill", "trap", "lo-fi", "k-pop", "j-pop")
        
        // Split query into word tokens and check exact membership
        val words = queryLower.split(Regex("\\s+")).toSet()
        for (genre in knownGenres) {
            if (words.contains(genre)) {
                recommendationDao.recordGenreInteraction(genre, 0.3f)
            }
        }
    }

    fun invalidateCache() {
        cachedPlaylists = null
    }

    private suspend fun findSimilarArtists(artists: List<String>, maxTracks: Int = 10): List<Track> {
        val results = mutableListOf<Track>()
        val seen = mutableSetOf<String>()
        for (artist in artists) {
            // Use Spotify's related artists endpoint for real similarity data
            val relatedArtists = searchRepository.getRelatedArtists(artist)
            for (relatedArtist in relatedArtists) {
                // Search YouTube for each related artist's top tracks
                val searchResults = searchRepository.searchYouTubeOnly(relatedArtist.name)
                for (result in searchResults) {
                    val track = result.track
                    if (track.id !in seen && !track.artist.equals(artist, ignoreCase = true)) {
                        seen.add(track.id)
                        results.add(track)
                        if (results.size >= maxTracks) return results
                    }
                }
            }
        }
        return results
    }
}
