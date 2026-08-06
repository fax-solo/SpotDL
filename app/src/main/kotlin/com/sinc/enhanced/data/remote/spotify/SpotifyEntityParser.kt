package com.sinc.enhanced.data.remote.spotify

import com.sinc.enhanced.data.model.Album
import com.sinc.enhanced.data.model.Artist
import com.sinc.enhanced.data.model.Track
import com.sinc.enhanced.data.remote.SpotifyClient.PlaylistTracksResult
import org.json.JSONArray
import org.json.JSONObject

/**
 * Maps Spotify's Pathfinder/__NEXT_DATA__ JSON shapes onto the app's
 * domain models. All parsing helpers are defensive (opt* + null fallbacks).
 */
class SpotifyEntityParser {

    fun parseSearchTracks(json: JSONObject): List<Track> {
        val items = json.optJSONObject("data")
            ?.optJSONObject("searchV2")
            ?.optJSONObject("tracksV2")
            ?.optJSONArray("items") ?: return emptyList()
        return (0 until items.length()).mapNotNull { i ->
            val trackData = items.getJSONObject(i)
                .optJSONObject("item")
                ?.optJSONObject("data") ?: return@mapNotNull null
            trackFromPathfinder(trackData)
        }
    }

    fun parseSearchAlbums(json: JSONObject): List<Album> {
        val items = json.optJSONObject("data")
            ?.optJSONObject("searchV2")
            ?.optJSONObject("albumsV2")
            ?.optJSONArray("items") ?: return emptyList()
        return (0 until items.length()).mapNotNull { i ->
            val item = items.getJSONObject(i).optJSONObject("item")?.optJSONObject("data") ?: return@mapNotNull null
            val albumId = item.optString("uri").removePrefix("spotify:album:")
            val artists = item.optJSONObject("artists")?.optJSONArray("items") ?: return@mapNotNull null
            val allArtists = artistNames(artists)
            val date = item.optJSONObject("date")?.optString("isoString")
            Album(
                id = albumId, name = item.optString("name"), artist = allArtists.firstOrNull() ?: "Unknown",
                artists = allArtists, artworkUrl = coverUrl(item),
                releaseYear = date?.take(4)?.toIntOrNull(),
                totalTracks = item.optInt("totalTracks", 0), source = "spotify"
            )
        }
    }

    fun parseSearchArtists(json: JSONObject): List<Artist> {
        val items = json.optJSONObject("data")
            ?.optJSONObject("searchV2")
            ?.optJSONObject("artistsV2")
            ?.optJSONArray("items") ?: return emptyList()
        return (0 until items.length()).mapNotNull { i ->
            val artistData = items.getJSONObject(i).optJSONObject("item")?.optJSONObject("data") ?: return@mapNotNull null
            val image = artistData.optJSONObject("visuals")
                ?.optJSONArray("avatarImage")?.optJSONObject(0)
                ?.optJSONArray("sources")?.optJSONObject(0)?.optString("url")
            Artist(
                id = artistData.optString("uri").removePrefix("spotify:artist:"),
                name = artistData.optJSONObject("profile")?.optString("name") ?: "Unknown",
                imageUrl = image, genres = emptyList()
            )
        }
    }

    fun parsePlaylist(json: JSONObject, playlistId: String): Map<String, Any?>? {
        val pl = json.optJSONObject("data")?.optJSONObject("playlistV2") ?: return null
        val images = pl.optJSONObject("images")?.optJSONArray("items")
        val imageUrl = images?.optJSONObject(0)
            ?.optJSONArray("sources")?.optJSONObject(0)?.optString("url")
        val ownerV2 = pl.optJSONObject("ownerV2")?.optJSONObject("data")
        val owner = ownerV2?.optString("name") ?: "Unknown"
        val totalTracks = pl.optJSONObject("content")?.optInt("totalCount", 0) ?: 0

        return mapOf(
            "id" to playlistId,
            "name" to (pl.optString("name") as Any),
            "description" to (pl.optString("description") as Any),
            "imageUrl" to (imageUrl as Any),
            "owner" to (owner as Any),
            "totalTracks" to (totalTracks as Any),
            "tracksUrl" to ""
        )
    }

    fun parsePlaylistTracks(json: JSONObject, offset: Int, limit: Int): PlaylistTracksResult {
        val content = json.optJSONObject("data")
            ?.optJSONObject("playlistV2")
            ?.optJSONObject("content") ?: return PlaylistTracksResult(emptyList(), null)
        val items = content.optJSONArray("items") ?: return PlaylistTracksResult(emptyList(), null)

        val pagingInfo = content.optJSONObject("pagingInfo")
        val nextOffset = if (pagingInfo != null && pagingInfo.has("nextOffset") && !pagingInfo.isNull("nextOffset")) {
            pagingInfo.optInt("nextOffset", -1).let { if (it < 0) null else it }
        } else {
            if (items.length() < limit) null else offset + limit
        }

        val tracks = (0 until items.length()).mapNotNull { i ->
            val item = items.getJSONObject(i)
            val trackData = item.optJSONObject("itemV2")?.optJSONObject("data")
                ?: return@mapNotNull null
            if (trackData.optString("__typename") != "Track") return@mapNotNull null
            trackFromPathfinder(trackData)
        }
        return PlaylistTracksResult(tracks, nextOffset)
    }

    fun parseTrack(json: JSONObject): Track? {
        val trackUnion = json.optJSONObject("data")?.optJSONObject("trackUnion") ?: return null
        return trackFromPathfinder(trackUnion)
    }

    fun parseAlbumPage(page: JSONObject, albumId: String): Album? {
        val entity = pageState(page)?.optJSONObject("entity") ?: return null
        val artistsArray = entity.optJSONObject("artists")?.optJSONArray("items") ?: return null
        val allArtists = artistNames(artistsArray)
        val cover = coverUrl(entity)
        val tracksList = entity.optJSONObject("tracks")?.optJSONArray("items") ?: JSONArray()
        val tracks = (0 until tracksList.length()).mapNotNull { i ->
            val td = tracksList.getJSONObject(i)
            val trackUri = td.optString("uri")
            if (trackUri.isEmpty()) return@mapNotNull null
            Track(
                id = trackUri.removePrefix("spotify:track:"),
                title = td.optString("name"), artist = allArtists.firstOrNull() ?: "Unknown",
                album = entity.optString("name"),
                durationMs = td.optLong("duration", 0), artworkUrl = cover, source = "spotify",
                trackNumber = td.optInt("trackNumber", 0)
            )
        }
        return Album(
            id = albumId, name = entity.optString("name"), artist = allArtists.firstOrNull() ?: "Unknown",
            artists = allArtists, artworkUrl = cover,
            releaseYear = entity.optString("releaseDate", "").take(4).toIntOrNull(),
            totalTracks = entity.optInt("totalTracks", tracks.size), tracks = tracks, source = "spotify"
        )
    }

    fun parseArtistPage(page: JSONObject, artistId: String): Artist? {
        val entity = pageState(page)?.optJSONObject("entity") ?: return null
        val visuals = entity.optJSONArray("visuals")?.optJSONObject(0)?.optJSONArray("sources")
        val imageUrl = visuals?.optJSONObject(0)?.optString("url")
        val genresArr = entity.optJSONArray("genres") ?: JSONArray()
        val genres = (0 until genresArr.length()).mapNotNull { genresArr.optString(it, null)?.ifEmpty { null } }
        return Artist(
            id = artistId, name = entity.optString("name") ?: "Unknown",
            imageUrl = imageUrl, genres = genres,
            followers = entity.optInt("followers", 0), popularity = entity.optInt("popularity", 0)
        )
    }

    fun parseArtistTopTracks(page: JSONObject): List<Track> {
        val entity = pageState(page)?.optJSONObject("entity") ?: return emptyList()
        val discography = entity.optJSONObject("discography")?.optJSONObject("topTracks")
            ?: entity.optJSONObject("discography")
        val items = discography?.optJSONArray("items") ?: return emptyList()
        val artistName = entity.optString("name")
        return (0 until items.length()).mapNotNull { i ->
            val td = items.getJSONObject(i)
            val trackData = td.optJSONObject("track") ?: td
            val uri = trackData.optString("uri")
            if (uri.isEmpty()) return@mapNotNull null
            val albumData = trackData.optJSONObject("album")
            Track(
                id = uri.removePrefix("spotify:track:"), title = trackData.optString("name"),
                artist = artistName, album = albumData?.optString("name") ?: "Unknown",
                durationMs = trackData.optLong("duration", 0),
                artworkUrl = albumData?.optJSONObject("coverArt")?.optJSONArray("sources")?.optJSONObject(0)?.optString("url"),
                source = "spotify"
            )
        }
    }

    fun parseRelatedArtists(page: JSONObject): List<Artist> {
        val entity = pageState(page)?.optJSONObject("entity") ?: return emptyList()
        val related = entity.optJSONObject("relatedContent")?.optJSONArray("artists") ?: return emptyList()
        return (0 until related.length()).mapNotNull { i ->
            val r = related.getJSONObject(i)
            val visuals = r.optJSONArray("visuals")?.optJSONObject(0)?.optJSONArray("sources")
            Artist(
                id = r.optString("id"), name = r.optString("name"),
                imageUrl = visuals?.optJSONObject(0)?.optString("url")
            )
        }
    }

    // ── Shared helpers ──

    private fun pageState(page: JSONObject): JSONObject? =
        page.optJSONObject("props")?.optJSONObject("pageProps")?.optJSONObject("state")

    private fun trackFromPathfinder(data: JSONObject): Track? {
        val name = data.optString("name")
        if (name.isEmpty()) return null
        val uri = data.optString("uri")
        val trackId = uri.removePrefix("spotify:track:")
        val duration = data.optJSONObject("trackDuration") ?: data.optJSONObject("duration")
        val durationMs = duration?.optLong("totalMilliseconds") ?: 0
        val albumOfTrack = data.optJSONObject("albumOfTrack")
        val albumName = albumOfTrack?.optString("name") ?: "Unknown"
        val cover = coverUrl(albumOfTrack)
        val artists = data.optJSONObject("artists")?.optJSONArray("items")
        val allArtists = artistNames(artists)
        val contentRating = data.optJSONObject("contentRating")
        val explicit = contentRating?.optString("label") == "EXPLICIT"
        val trackNumber = data.optInt("trackNumber", 0)

        val imagesList = cover?.let {
            listOf(mapOf<String, Any?>("url" to it, "width" to 300, "height" to 300))
        }
        val artistsList = allArtists.map { mapOf("name" to (it as Any)) }

        val mapped = mapOf<String, Any?>(
            "id" to trackId,
            "name" to name,
            "album" to mapOf<String, Any?>(
                "name" to albumName, "id" to null,
                "images" to imagesList, "release_date" to null
            ),
            "artists" to artistsList,
            "duration_ms" to durationMs,
            "preview_url" to null,
            "track_number" to trackNumber,
            "disc_number" to 1,
            "external_ids" to null,
            "explicit" to explicit
        )
        return Track.fromSpotify(mapped)
    }

    private fun artistNames(artistsArray: JSONArray?): List<String> {
        if (artistsArray == null) return emptyList()
        val names = mutableListOf<String>()
        for (i in 0 until artistsArray.length()) {
            val aName = artistsArray.getJSONObject(i)
                .optJSONObject("profile")?.optString("name")
                ?: artistsArray.getJSONObject(i).optString("name")
            if (aName.isNotEmpty()) names.add(aName)
        }
        return names
    }

    private fun coverUrl(parent: JSONObject?): String? {
        val coverArt = parent?.optJSONObject("coverArt") ?: return null
        return coverArt.optJSONArray("sources")?.optJSONObject(0)?.optString("url")
    }
}
