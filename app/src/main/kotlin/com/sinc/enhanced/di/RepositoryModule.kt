package com.sinc.enhanced.di

import android.content.Context
import com.sinc.enhanced.BuildConfig
import com.sinc.enhanced.data.audio.AudioResolverPipeline
import com.sinc.enhanced.data.auth.EncryptedTokenStore
import com.sinc.enhanced.data.repository.AudiusSearchSource
import com.sinc.enhanced.data.repository.AuthRepository
import com.sinc.enhanced.data.repository.BandcampSearchSource
import com.sinc.enhanced.data.repository.DeezerSearchSource
import com.sinc.enhanced.data.repository.DownloadRepository
import com.sinc.enhanced.data.repository.FmaSearchSource
import com.sinc.enhanced.data.repository.JamendoSearchSource
import com.sinc.enhanced.data.repository.MusicRepository
import com.sinc.enhanced.data.repository.PipedSearchSource
import com.sinc.enhanced.data.repository.PlaylistRepository
import com.sinc.enhanced.data.repository.SearchRepository
import com.sinc.enhanced.data.repository.SearchSource
import com.sinc.enhanced.data.repository.SearchSourceOrchestrator
import com.sinc.enhanced.data.repository.SoundCloudSearchSource
import com.sinc.enhanced.data.repository.SpotifySearchSource
import com.sinc.enhanced.data.repository.UserLibraryRepository

class RepositoryModule(
    private val context: Context,
    database: DatabaseModule,
    clients: ClientModule,
    audio: AudioModule,
    network: NetworkModule
) {
    val authRepository: AuthRepository = AuthRepository(
        tokenStore = EncryptedTokenStore(context),
        dataStore = database.dataStore,
        apiClient = clients.apiClient,
        defaultUrl = BuildConfig.BACKEND_URL
    )

    val musicRepository: MusicRepository = MusicRepository(context)

    val searchSources: List<SearchSource> = listOf(
        SpotifySearchSource(clients.spotifyClient),
        DeezerSearchSource(clients.deezerClient),
        PipedSearchSource(clients.pipedClient),
        SoundCloudSearchSource(clients.soundCloudClient),
        AudiusSearchSource(clients.audiusClient),
        JamendoSearchSource(clients.jamendoClient),
        FmaSearchSource(clients.fmaClient),
        BandcampSearchSource(clients.bandcampClient)
    )

    val searchSourceOrchestrator: SearchSourceOrchestrator = SearchSourceOrchestrator(
        sources = searchSources,
        settingsManager = database.settingsManager
    )

    val searchRepository: SearchRepository = SearchRepository(
        spotifyClient = clients.spotifyClient,
        pipedClient = clients.pipedClient,
        cacheDao = database.database.cacheDao(),
        audioPipeline = audio.audioPipeline,
        orchestrator = searchSourceOrchestrator
    )

    val downloadRepository: DownloadRepository = DownloadRepository(
        context = context,
        downloadDao = database.database.downloadDao(),
        historyDao = database.database.historyDao(),
        okHttpClient = network.downloadClient,
        findAudioUrl = { track -> searchRepository.findBestAudioForTrack(track) },
        lyricsClient = clients.lyricsClient,
        settingsManager = database.settingsManager
    )

    val playlistRepository: PlaylistRepository = PlaylistRepository(database.database.playlistDao())

    val userLibraryRepository: UserLibraryRepository = UserLibraryRepository(
        userLibraryDao = database.database.userLibraryDao(),
        playlistDao = database.database.playlistDao()
    )
}
