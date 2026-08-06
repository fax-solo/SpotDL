package com.sinc.enhanced.di

import com.sinc.enhanced.data.local.RoomLyricsCache
import com.sinc.enhanced.data.remote.ApiClient
import com.sinc.enhanced.data.remote.ArtworkClient
import com.sinc.enhanced.data.remote.AudiusClient
import com.sinc.enhanced.data.remote.BandcampClient
import com.sinc.enhanced.data.remote.DeezerClient
import com.sinc.enhanced.data.remote.FreeMusicArchiveClient
import com.sinc.enhanced.data.remote.JamendoClient
import com.sinc.enhanced.data.remote.LyricsClient
import com.sinc.enhanced.data.remote.PipedClient
import com.sinc.enhanced.data.remote.SoundCloudClient
import com.sinc.enhanced.data.remote.SpotifyClient
import com.sinc.enhanced.data.remote.spotify.AnonymousTokenProvider
import com.sinc.enhanced.data.remote.spotify.HtmlPageScraper
import com.sinc.enhanced.data.remote.spotify.PathfinderClient
import com.sinc.enhanced.data.remote.spotify.SpotifyEntityParser

class ClientModule(
    network: NetworkModule,
    database: DatabaseModule
) {
    val apiClient: ApiClient = ApiClient(network.okHttpClient)
    val spotifyClient: SpotifyClient = run {
        val htmlScraper = HtmlPageScraper(network.okHttpClient)
        val tokenProvider = AnonymousTokenProvider(htmlScraper)
        SpotifyClient(
            pathfinder = PathfinderClient(network.okHttpClient, tokenProvider),
            htmlScraper = htmlScraper,
            parser = SpotifyEntityParser()
        )
    }
    val deezerClient: DeezerClient = DeezerClient(network.okHttpClient)
    val pipedClient: PipedClient = PipedClient(network.okHttpClient, network.probeClient)
    val soundCloudClient: SoundCloudClient = SoundCloudClient(network.okHttpClient)
    val audiusClient: AudiusClient = AudiusClient(network.okHttpClient)
    val jamendoClient: JamendoClient = JamendoClient(network.okHttpClient)
    val fmaClient: FreeMusicArchiveClient = FreeMusicArchiveClient(network.okHttpClient)
    val bandcampClient: BandcampClient = BandcampClient(network.okHttpClient)
    val artworkClient: ArtworkClient = ArtworkClient(network.okHttpClient)

    private val lyricsCacheDb = RoomLyricsCache(database.database.lyricsCacheDao())
    val lyricsClient: LyricsClient = LyricsClient(network.okHttpClient, lyricsCacheDb)
}
