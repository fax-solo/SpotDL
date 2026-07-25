package com.sinc.enhanced

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.preferencesDataStore
import androidx.room.Room
import com.sinc.enhanced.data.local.AppDatabase
import com.sinc.enhanced.data.local.SettingsManager
import com.sinc.enhanced.data.remote.ArtworkClient
import com.sinc.enhanced.data.remote.AudiusClient
import com.sinc.enhanced.data.remote.ApiClient
import com.sinc.enhanced.data.remote.BandcampClient
import com.sinc.enhanced.data.remote.DeezerClient
import com.sinc.enhanced.data.remote.FreeMusicArchiveClient
import com.sinc.enhanced.data.remote.JamendoClient
import com.sinc.enhanced.data.remote.LyricsClient
import com.sinc.enhanced.data.remote.PipedClient
import com.sinc.enhanced.data.remote.SoundCloudClient
import com.sinc.enhanced.data.remote.SpotifyClient
import com.sinc.enhanced.data.repository.AuthRepository
import com.sinc.enhanced.data.repository.DownloadRepository
import com.sinc.enhanced.data.repository.MusicRepository
import com.sinc.enhanced.data.repository.PlaylistRepository
import com.sinc.enhanced.data.repository.SearchRepository
import com.sinc.enhanced.data.util.ConnectivityMonitor
import com.sinc.enhanced.player.MusicPlayer
import okhttp3.OkHttpClient
import java.util.concurrent.TimeUnit

private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "settings")

class AppContainer(private val context: Context) {

    val okHttpClient: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .build()

    val database: AppDatabase = Room.databaseBuilder(
        context,
        AppDatabase::class.java,
        "sinc-enhanced.db"
    ).addMigrations(AppDatabase.MIGRATION_1_2, AppDatabase.MIGRATION_2_3).build()

    val dataStore: DataStore<Preferences> = context.dataStore

    val settingsManager: SettingsManager = SettingsManager(dataStore)

    val connectivityMonitor: ConnectivityMonitor = ConnectivityMonitor(context)

    val apiClient: ApiClient = ApiClient(okHttpClient)
    val authRepository: AuthRepository = AuthRepository(dataStore, apiClient, BuildConfig.BACKEND_URL)

    val spotifyClient: SpotifyClient = SpotifyClient(okHttpClient)
    val deezerClient: DeezerClient = DeezerClient(okHttpClient)
    val pipedClient: PipedClient = PipedClient(okHttpClient)
    val lyricsClient: LyricsClient = LyricsClient(okHttpClient, context)
    val soundCloudClient: SoundCloudClient = SoundCloudClient(okHttpClient)
    val audiusClient: AudiusClient = AudiusClient(okHttpClient)
    val jamendoClient: JamendoClient = JamendoClient(okHttpClient)
    val fmaClient: FreeMusicArchiveClient = FreeMusicArchiveClient(okHttpClient)
    val bandcampClient: BandcampClient = BandcampClient(okHttpClient)
    val artworkClient: ArtworkClient = ArtworkClient(okHttpClient)

    val musicRepository: MusicRepository = MusicRepository(context)
    val searchRepository: SearchRepository = SearchRepository(
        spotifyClient = spotifyClient,
        pipedClient = pipedClient,
        deezerClient = deezerClient,
        soundCloudClient = soundCloudClient,
        audiusClient = audiusClient,
        jamendoClient = jamendoClient,
        fmaClient = fmaClient,
        bandcampClient = bandcampClient
    )
    val downloadRepository: DownloadRepository = DownloadRepository(
        context = context,
        downloadDao = database.downloadDao(),
        historyDao = database.historyDao(),
        okHttpClient = okHttpClient,
        findAudioUrl = { track -> searchRepository.findBestAudioForTrack(track) },
        lyricsClient = lyricsClient,
        settingsManager = settingsManager
    )
    val playlistRepository: PlaylistRepository = PlaylistRepository(database.playlistDao())

    val musicPlayer: MusicPlayer = MusicPlayer(context)
}
