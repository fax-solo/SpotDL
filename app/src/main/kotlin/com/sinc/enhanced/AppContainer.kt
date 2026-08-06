package com.sinc.enhanced

import android.content.Context
import com.sinc.enhanced.data.audio.AudioResolverPipeline
import com.sinc.enhanced.data.remote.ApiClient
import com.sinc.enhanced.data.remote.ArtworkClient
import com.sinc.enhanced.data.remote.DeezerClient
import com.sinc.enhanced.data.remote.LyricsClient
import com.sinc.enhanced.data.remote.SpotifyClient
import com.sinc.enhanced.data.repository.AuthRepository
import com.sinc.enhanced.data.repository.DownloadRepository
import com.sinc.enhanced.data.repository.MusicRepository
import com.sinc.enhanced.data.repository.PlaylistRepository
import com.sinc.enhanced.data.repository.SearchRepository
import com.sinc.enhanced.data.repository.UserLibraryRepository
import com.sinc.enhanced.data.recommendation.RecommendationEngine
import com.sinc.enhanced.data.local.AppDatabase
import com.sinc.enhanced.data.local.SettingsManager
import com.sinc.enhanced.data.sync.RecommendationSyncManager
import com.sinc.enhanced.data.util.ConnectivityMonitor
import com.sinc.enhanced.di.AudioModule
import com.sinc.enhanced.di.ClientModule
import com.sinc.enhanced.di.DatabaseModule
import com.sinc.enhanced.di.NetworkModule
import com.sinc.enhanced.di.PlayerModule
import com.sinc.enhanced.di.RepositoryModule
import com.sinc.enhanced.di.SyncModule
import com.sinc.enhanced.player.MusicPlayer

class AppContainer(private val context: Context) {

    private val network = NetworkModule()
    private val databaseModule = DatabaseModule(context)
    private val clientModule = ClientModule(network, databaseModule)
    private val audioModule = AudioModule(clientModule)
    private val repositoryModule = RepositoryModule(context, databaseModule, clientModule, audioModule, network)
    private val playerModule = PlayerModule(context)
    private val syncModule = SyncModule(clientModule.apiClient, databaseModule, repositoryModule.searchRepository)

    // Convenience accessors for consumers across the app
    val apiClient: ApiClient get() = clientModule.apiClient
    val artworkClient: ArtworkClient get() = clientModule.artworkClient
    val lyricsClient: LyricsClient get() = clientModule.lyricsClient
    val spotifyClient: SpotifyClient get() = clientModule.spotifyClient
    val deezerClient: DeezerClient get() = clientModule.deezerClient
    val audioPipeline: AudioResolverPipeline get() = audioModule.audioPipeline
    val authRepository: AuthRepository get() = repositoryModule.authRepository
    val connectivityMonitor: ConnectivityMonitor get() = databaseModule.connectivityMonitor
    val downloadRepository: DownloadRepository get() = repositoryModule.downloadRepository
    val musicRepository: MusicRepository get() = repositoryModule.musicRepository
    val musicPlayer: MusicPlayer get() = playerModule.musicPlayer
    val playlistRepository: PlaylistRepository get() = repositoryModule.playlistRepository
    val recommendationEngine: RecommendationEngine get() = syncModule.recommendationEngine
    val recommendationSyncManager: RecommendationSyncManager get() = syncModule.recommendationSyncManager
    val searchRepository: SearchRepository get() = repositoryModule.searchRepository
    val settingsManager: SettingsManager get() = databaseModule.settingsManager
    val userLibraryRepository: UserLibraryRepository get() = repositoryModule.userLibraryRepository
    val database: AppDatabase get() = databaseModule.database
}
