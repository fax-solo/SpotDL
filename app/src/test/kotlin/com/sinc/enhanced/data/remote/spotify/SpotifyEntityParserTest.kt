package com.sinc.enhanced.data.remote.spotify

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SpotifyEntityParserTest {

    private val parser = SpotifyEntityParser()

    private fun searchItems(vararg trackData: JSONObject): JSONObject {
        val items = org.json.JSONArray()
        trackData.forEach { items.put(JSONObject().put("item", JSONObject().put("data", it))) }
        return JSONObject().put(
            "data", JSONObject().put(
                "searchV2", JSONObject().put(
                    "tracksV2", JSONObject().put("items", items)
                )
            )
        )
    }

    private fun trackData(
        name: String = "Test Song",
        uri: String = "spotify:track:abc123",
        albumName: String = "Test Album",
        durationMs: Int = 180000,
        artistNames: List<String> = listOf("Artist One", "Artist Two"),
        explicit: Boolean = false,
        trackNumber: Int = 3,
        coverUrl: String = "https://example.com/art.jpg",
        durationKey: String = "trackDuration"
    ): JSONObject = JSONObject().apply {
        put("name", name)
        put("uri", uri)
        put("__typename", "Track")
        put("trackNumber", trackNumber)
        put("contentRating", JSONObject().put("label", if (explicit) "EXPLICIT" else "NONE"))
        put(durationKey, JSONObject().put("totalMilliseconds", durationMs))
        put("albumOfTrack", JSONObject().apply {
            put("name", albumName)
            if (coverUrl != null) {
                put("coverArt", JSONObject().put(
                    "sources", org.json.JSONArray().put(
                        JSONObject().put("url", coverUrl)
                    )
                ))
            }
        })
        val artistItems = org.json.JSONArray()
        artistNames.forEach { artistItems.put(JSONObject().put("profile", JSONObject().put("name", it))) }
        put("artists", JSONObject().put("items", artistItems))
    }

    @Test
    fun `parseSearchTracks maps pathfinder payload to tracks`() {
        val json = searchItems(trackData())
        val tracks = parser.parseSearchTracks(json)
        assertEquals(1, tracks.size)
        val track = tracks[0]
        assertEquals("abc123", track.id)
        assertEquals("Test Song", track.title)
        assertEquals("Test Album", track.album)
        assertEquals(180000L, track.durationMs)
        assertEquals("Artist One", track.artist)
        assertEquals(listOf("Artist One", "Artist Two"), track.artists)
        assertEquals(3, track.trackNumber)
        assertEquals("https://example.com/art.jpg", track.artworkUrl)
        assertEquals("spotify", track.source)
    }

    @Test
    fun `parseSearchTracks handles explicit labels and duration variant`() {
        val json = searchItems(
            trackData(name = "Explicit", explicit = true, durationKey = "duration")
        )
        val tracks = parser.parseSearchTracks(json)
        assertEquals(1, tracks.size)
        assertEquals(180000L, tracks[0].durationMs)
    }

    @Test
    fun `parseSearchTracks skips unnamed entries`() {
        val json = searchItems(trackData(name = "ok"), trackData(name = ""))
        assertEquals(1, parser.parseSearchTracks(json).size)
    }

    @Test
    fun `parseSearchTracks returns empty for missing payload`() {
        assertTrue(parser.parseSearchTracks(JSONObject()).isEmpty())
        assertTrue(parser.parseSearchTracks(JSONObject().put("data", JSONObject())).isEmpty())
    }

    @Test
    fun `parseTrack maps trackUnion`() {
        val json = JSONObject().put(
            "data", JSONObject().put("trackUnion", trackData(uri = "spotify:track:xyz789"))
        )
        val track = parser.parseTrack(json)
        assertNotNull(track)
        assertEquals("xyz789", track!!.id)
        assertEquals("Test Song", track.title)
    }

    @Test
    fun `parseTrack returns null on missing union`() {
        assertNull(parser.parseTrack(JSONObject()))
    }

    @Test
    fun `parsePlaylist maps metadata`() {
        val json = JSONObject().put(
            "data", JSONObject().put("playlistV2", JSONObject().apply {
                put("name", "My Playlist")
                put("description", "A description")
                put("images", JSONObject().put(
                    "items", org.json.JSONArray().put(
                        JSONObject().put(
                            "sources", org.json.JSONArray().put(
                                JSONObject().put("url", "https://example.com/pl.jpg")
                            )
                        )
                    )
                ))
                put("ownerV2", JSONObject().put("data", JSONObject().put("name", "Owner")))
                put("content", JSONObject().put("totalCount", 42))
            })
        )
        val pl = parser.parsePlaylist(json, "pl-1")
        assertNotNull(pl)
        assertEquals("pl-1", pl!!["id"])
        assertEquals("My Playlist", pl["name"])
        assertEquals("A description", pl["description"])
        assertEquals("https://example.com/pl.jpg", pl["imageUrl"])
        assertEquals("Owner", pl["owner"])
        assertEquals(42, pl["totalTracks"])
    }

    @Test
    fun `parsePlaylist returns null on missing data`() {
        assertNull(parser.parsePlaylist(JSONObject(), "pl-1"))
    }

    @Test
    fun `parsePlaylistTracks parses items and computes next offset`() {
        val content = JSONObject().apply {
            put("pagingInfo", JSONObject().put("nextOffset", 100))
            val items = org.json.JSONArray().apply {
                put(JSONObject().put(
                    "itemV2", JSONObject().put("data", trackData(uri = "spotify:track:t1"))
                ))
                put(JSONObject().put(
                    "itemV2", JSONObject().put("data", trackData(uri = "spotify:track:t2"))
                ))
            }
            put("items", items)
        }
        val json = JSONObject().put("data", JSONObject().put("playlistV2", JSONObject().put("content", content)))
        val result = parser.parsePlaylistTracks(json, offset = 0, limit = 100)
        assertEquals(2, result.tracks.size)
        assertEquals(100, result.nextOffset)
    }

    @Test
    fun `parsePlaylistTracks falls back to offset math when pagingInfo missing`() {
        val content = JSONObject().put(
            "items", org.json.JSONArray().put(
                JSONObject().put("itemV2", JSONObject().put("data", trackData()))
            )
        )
        val json = JSONObject().put("data", JSONObject().put("playlistV2", JSONObject().put("content", content)))
        // Fewer items than requested -> no more pages
        assertTrue(parser.parsePlaylistTracks(json, offset = 20, limit = 100).nextOffset == null)
        // Full page -> continue from offset + limit
        assertEquals(21, parser.parsePlaylistTracks(json, offset = 20, limit = 1).nextOffset)
    }

    @Test
    fun `parsePlaylistTracks skips non-track items`() {
        val content = JSONObject().put(
            "items", org.json.JSONArray().apply {
                put(JSONObject().put(
                    "itemV2", JSONObject().put("data", trackData(uri = "spotify:track:t1"))
                ))
                put(JSONObject().put(
                    "itemV2", JSONObject().put(
                        "data", JSONObject().apply {
                            put("__typename", "PodcastEpisode")
                            put("uri", "spotify:episode:e1")
                        }
                    )
                ))
            }
        )
        val json = JSONObject().put("data", JSONObject().put("playlistV2", JSONObject().put("content", content)))
        val result = parser.parsePlaylistTracks(json, offset = 0, limit = 100)
        assertEquals(1, result.tracks.size)
        assertEquals("t1", result.tracks[0].id)
    }

    @Test
    fun `parseSearchAlbums maps album payloads`() {
        val items = org.json.JSONArray().put(
            JSONObject().put("item", JSONObject().put("data", JSONObject().apply {
                put("uri", "spotify:album:alb1")
                put("name", "Great Album")
                put("totalTracks", 12)
                put("date", JSONObject().put("isoString", "2021-06-15"))
                put("coverArt", JSONObject().put(
                    "sources", org.json.JSONArray().put(JSONObject().put("url", "https://a.jpg"))
                ))
                put("artists", JSONObject().put(
                    "items", org.json.JSONArray().apply {
                        put(JSONObject().put("profile", JSONObject().put("name", "Artist")))
                    }
                ))
            }))
        )
        val json = JSONObject().put("data", JSONObject().put("searchV2", JSONObject().put("albumsV2", JSONObject().put("items", items))))
        val albums = parser.parseSearchAlbums(json)
        assertEquals(1, albums.size)
        assertEquals("alb1", albums[0].id)
        assertEquals("Great Album", albums[0].name)
        assertEquals("Artist", albums[0].artist)
        assertEquals(12, albums[0].totalTracks)
        assertEquals(2021, albums[0].releaseYear)
        assertEquals("https://a.jpg", albums[0].artworkUrl)
    }

    @Test
    fun `parseSearchArtists maps artist payloads`() {
        val items = org.json.JSONArray().put(
            JSONObject().put("item", JSONObject().put("data", JSONObject().apply {
                put("uri", "spotify:artist:art1")
                put("profile", JSONObject().put("name", "Big Artist"))
                put("visuals", JSONObject().put(
                    "avatarImage", org.json.JSONArray().put(
                        JSONObject().put("sources", org.json.JSONArray().put(JSONObject().put("url", "https://avatar.jpg")))
                    )
                ))
            }))
        )
        val json = JSONObject().put("data", JSONObject().put("searchV2", JSONObject().put("artistsV2", JSONObject().put("items", items))))
        val artists = parser.parseSearchArtists(json)
        assertEquals(1, artists.size)
        assertEquals("art1", artists[0].id)
        assertEquals("Big Artist", artists[0].name)
        assertEquals("https://avatar.jpg", artists[0].imageUrl)
    }

    private fun albumPage() = JSONObject().put(
        "props", JSONObject().put("pageProps", JSONObject().put("state", JSONObject().put("entity", JSONObject().apply {
            put("name", "Album Page")
            put("releaseDate", "2019-03-01")
            put("totalTracks", 10)
            put("coverArt", JSONObject().put(
                "sources", org.json.JSONArray().put(JSONObject().put("url", "https://cover.jpg"))
            ))
            put("artists", JSONObject().put(
                "items", org.json.JSONArray().put(JSONObject().put("name", "Page Artist"))
            ))
            put("tracks", JSONObject().put(
                "items", org.json.JSONArray().apply {
                    put(JSONObject().apply {
                        put("uri", "spotify:track:pa1")
                        put("name", "Track One")
                        put("duration", 200000)
                        put("trackNumber", 1)
                    })
                }
            ))
        })))
    )

    @Test
    fun `parseAlbumPage maps album with tracks`() {
        val album = parser.parseAlbumPage(albumPage(), "album-page")
        assertNotNull(album)
        assertEquals("album-page", album!!.id)
        assertEquals("Album Page", album.name)
        assertEquals("Page Artist", album.artist)
        assertEquals(2019, album.releaseYear)
        assertEquals(1, album.tracks.size)
        assertEquals("pa1", album.tracks[0].id)
        assertEquals("Track One", album.tracks[0].title)
        assertEquals(200000L, album.tracks[0].durationMs)
    }

    @Test
    fun `parseAlbumPage returns null on bad payload`() {
        assertNull(parser.parseAlbumPage(JSONObject(), "x"))
    }

    private fun artistPage() = JSONObject().put(
        "props", JSONObject().put("pageProps", JSONObject().put("state", JSONObject().put("entity", JSONObject().apply {
            put("name", "Page Artist")
            put("followers", 5000)
            put("popularity", 80)
            put("visuals", org.json.JSONArray().put(
                JSONObject().put("sources", org.json.JSONArray().put(JSONObject().put("url", "https://artist.jpg")))
            ))
            put("genres", org.json.JSONArray().apply { put("pop"); put("rock") })
            put("discography", JSONObject().put("topTracks", JSONObject().put(
                "items", org.json.JSONArray().put(
                    JSONObject().put("track", JSONObject().apply {
                        put("uri", "spotify:track:top1")
                        put("name", "Top Track")
                        put("duration", 150000)
                        put("album", JSONObject().apply {
                            put("name", "Some Album")
                            put("coverArt", JSONObject().put(
                                "sources", org.json.JSONArray().put(JSONObject().put("url", "https://alb.jpg"))
                            ))
                        })
                    })
                )
            )))
            put("relatedContent", JSONObject().put("artists", org.json.JSONArray().put(
                JSONObject().apply {
                    put("id", "related-1")
                    put("name", "Related Artist")
                    put("visuals", org.json.JSONArray().put(
                        JSONObject().put("sources", org.json.JSONArray().put(JSONObject().put("url", "https://rel.jpg")))
                    ))
                }
            )))
        })))
    )

    @Test
    fun `parseArtistPage maps artist profile`() {
        val artist = parser.parseArtistPage(artistPage(), "page-artist")
        assertNotNull(artist)
        assertEquals("page-artist", artist!!.id)
        assertEquals("Page Artist", artist.name)
        assertEquals(listOf("pop", "rock"), artist.genres)
        assertEquals(5000, artist.followers)
        assertEquals(80, artist.popularity)
        assertEquals("https://artist.jpg", artist.imageUrl)
    }

    @Test
    fun `parseArtistTopTracks maps top tracks`() {
        val tracks = parser.parseArtistTopTracks(artistPage())
        assertEquals(1, tracks.size)
        assertEquals("top1", tracks[0].id)
        assertEquals("Top Track", tracks[0].title)
        assertEquals("Page Artist", tracks[0].artist)
        assertEquals("Some Album", tracks[0].album)
        assertEquals("https://alb.jpg", tracks[0].artworkUrl)
    }

    @Test
    fun `parseRelatedArtists maps related artists`() {
        val artists = parser.parseRelatedArtists(artistPage())
        assertEquals(1, artists.size)
        assertEquals("related-1", artists[0].id)
        assertEquals("Related Artist", artists[0].name)
        assertEquals("https://rel.jpg", artists[0].imageUrl)
    }
}
