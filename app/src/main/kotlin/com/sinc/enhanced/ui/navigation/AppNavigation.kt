package com.sinc.enhanced.ui.navigation

import android.content.Intent
import androidx.compose.animation.*
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.sinc.enhanced.SincApp
import com.sinc.enhanced.data.model.Track
import com.sinc.enhanced.service.DownloadService
import com.sinc.enhanced.ui.components.BottomNavBar
import com.sinc.enhanced.ui.components.PlayerMiniBar
import com.sinc.enhanced.ui.screens.admin.AdminScreen
import com.sinc.enhanced.ui.screens.auth.LoginScreen
import com.sinc.enhanced.ui.screens.auth.RegisterScreen
import com.sinc.enhanced.ui.screens.history.HistoryScreen
import com.sinc.enhanced.ui.screens.library.LibraryScreen
import com.sinc.enhanced.ui.screens.player.PlayerScreen
import com.sinc.enhanced.ui.screens.queue.QueueScreen
import com.sinc.enhanced.ui.screens.home.HomeScreen
import com.sinc.enhanced.ui.screens.search.SearchScreen
import com.sinc.enhanced.ui.screens.settings.SettingsScreen
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

object Routes {
    const val LOGIN = "login"
    const val REGISTER = "register"
    const val HOME = "home"
    const val SEARCH = "search"
    const val QUEUE = "queue"
    const val LIBRARY = "library"
    const val PLAYLISTS = "playlists"
    const val IMPORT_PLAYLIST = "import_playlist"
    const val PLAYER = "player"
    const val HISTORY = "history"
    const val SETTINGS = "settings"
    const val ADMIN = "admin"
}

@Composable
fun AppNavigation() {
    val navController = rememberNavController()
    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = navBackStackEntry?.destination?.route ?: Routes.LOGIN
    val scope = rememberCoroutineScope()

    val authRepository = SincApp.instance.container.authRepository
    val authState by authRepository.authState.collectAsState(initial = com.sinc.enhanced.data.repository.AuthState())

    var startDest by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) {
        val sessionValid = authRepository.restoreSession()
        startDest = if (sessionValid) Routes.HOME else Routes.LOGIN
    }

    startDest?.let { start ->
        val isAuthScreen = currentRoute == Routes.LOGIN || currentRoute == Routes.REGISTER
        val bottomTabRoutes = listOf(Routes.HOME, Routes.QUEUE, Routes.LIBRARY, Routes.SETTINGS)
        val showBottomBar = !isAuthScreen && currentRoute in bottomTabRoutes

        val musicPlayer = SincApp.instance.container.musicPlayer
        val playerState by musicPlayer.state.collectAsState()

        Scaffold(
            bottomBar = {
                if (!isAuthScreen) {
                    Column {
                        AnimatedVisibility(
                            visible = playerState.currentTrack != null && currentRoute != Routes.PLAYER,
                            enter = slideInVertically(initialOffsetY = { it }),
                            exit = slideOutVertically(targetOffsetY = { it })
                        ) {
                            PlayerMiniBar(
                                title = playerState.currentTrack?.title,
                                artist = playerState.currentTrack?.artist,
                                isPlaying = playerState.isPlaying,
                                onPlayPause = { musicPlayer.togglePlayPause() },
                                onClick = { navController.navigate(Routes.PLAYER) }
                            )
                        }

                        if (showBottomBar) {
                            BottomNavBar(
                                currentRoute = currentRoute,
                                onNavigate = { route ->
                                    if (route != currentRoute) {
                                        navController.navigate(route) {
                                            popUpTo(Routes.HOME) { saveState = true }
                                            launchSingleTop = true
                                            restoreState = true
                                        }
                                    }
                                }
                            )
                        }
                    }
                }
            }
        ) { innerPadding ->
            NavHost(
                navController = navController,
                startDestination = start,
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding)
            ) {
                composable(Routes.LOGIN) {
                    LoginScreen(
                        onLoginSuccess = {
                            navController.navigate(Routes.HOME) {
                                popUpTo(Routes.LOGIN) { inclusive = true }
                            }
                            scope.launch { schedulePing() }
                        },
                        onNavigateRegister = { navController.navigate(Routes.REGISTER) },
                        onSkip = {
                            navController.navigate(Routes.HOME) {
                                popUpTo(Routes.LOGIN) { inclusive = true }
                            }
                        }
                    )
                }
                composable(Routes.REGISTER) {
                    RegisterScreen(
                        onRegisterSuccess = {
                            navController.navigate(Routes.HOME) {
                                popUpTo(Routes.LOGIN) { inclusive = true }
                            }
                            scope.launch { schedulePing() }
                        },
                        onNavigateLogin = { navController.popBackStack() }
                    )
                }
                composable(Routes.HOME) {
                    HomeScreen(
                        onSearch = { navController.navigate(Routes.SEARCH) },
                        onNavigateSettings = { navController.navigate(Routes.SETTINGS) },
                        onNavigateHistory = { navController.navigate(Routes.HISTORY) },
                        onPlayTrack = { track, url ->
                            musicPlayer.playUrl(track, url)
                            navController.navigate(Routes.PLAYER)
                        }
                    )
                }
                composable(Routes.SEARCH) {
                    val context = LocalContext.current
                    SearchScreen(
                        onPlayTrack = { track, url ->
                            musicPlayer.playUrl(track, url)
                            navController.navigate(Routes.PLAYER)
                        },
                        onDownloadTrack = { track, audioUrl ->
                            scope.launch {
                                SincApp.instance.container.downloadRepository.addToQueue(track, audioUrl)
                                val intent = Intent(context, DownloadService::class.java).apply {
                                    action = DownloadService.ACTION_DOWNLOAD
                                    putExtra(DownloadService.EXTRA_TRACK_ID, track.id)
                                }
                                context.startForegroundService(intent)
                                navController.navigate(Routes.QUEUE)
                            }
                        },
                        onNavigateArtist = { artistId ->
                            navController.navigate("artist/$artistId")
                        },
                        onNavigateTrack = { trackId ->
                            navController.navigate("track/$trackId")
                        },
                        onNavigateSettings = { navController.navigate(Routes.SETTINGS) },
                        onNavigateHistory = { navController.navigate(Routes.HISTORY) }
                    )
                }
                composable(Routes.QUEUE) {
                    QueueScreen()
                }
                composable(Routes.LIBRARY) {
                    LibraryScreen(
                        onPlayLocal = { localTrack ->
                            val track = Track(
                                id = "local_${localTrack.id}",
                                title = localTrack.title,
                                artist = localTrack.artist,
                                album = localTrack.album,
                                durationMs = localTrack.durationMs
                            )
                            musicPlayer.playUrl(track, localTrack.filePath)
                            navController.navigate(Routes.PLAYER)
                        },
                        onPlayDownloaded = { download ->
                            val track = Track(
                                id = download.trackId,
                                title = download.title,
                                artist = download.artist,
                                album = download.album,
                                durationMs = download.durationMs,
                                artworkUrl = download.artworkUrl,
                                source = download.source
                            )
                            musicPlayer.playUrl(track, download.filePath ?: "")
                            navController.navigate(Routes.PLAYER)
                        },
                        onNavigatePlaylists = {
                            navController.navigate(Routes.PLAYLISTS)
                        },
                        onNavigateImportPlaylist = {
                            navController.navigate(Routes.IMPORT_PLAYLIST)
                        }
                    )
                }
                composable(Routes.PLAYER) {
                    PlayerScreen(
                        onNavigateArtist = { artistName ->
                            navController.navigate("artist/$artistName")
                        }
                    )
                }
                composable(Routes.HISTORY) {
                    HistoryScreen(
                        onPlayHistory = { filePath ->
                            val state = musicPlayer.state.value
                            state.currentTrack?.let { track ->
                                musicPlayer.playUrl(track, filePath)
                                navController.navigate(Routes.PLAYER)
                            }
                        }
                    )
                }
                composable(Routes.SETTINGS) {
                    SettingsScreen(
                        onLogout = {
                            scope.launch {
                                authRepository.clearAuth()
                                navController.navigate(Routes.LOGIN) {
                                    popUpTo(0) { inclusive = true }
                                }
                            }
                        },
                        onNavigateAdmin = { navController.navigate(Routes.ADMIN) }
                    )
                }
                composable(Routes.ADMIN) {
                    AdminScreen()
                }
                composable(Routes.PLAYLISTS) {
                    com.sinc.enhanced.ui.screens.playlist.PlaylistListScreen(
                        onPlaylistClick = { playlistId ->
                            navController.navigate("playlist/$playlistId")
                        },
                        onImportPlaylist = {
                            navController.navigate(Routes.IMPORT_PLAYLIST)
                        }
                    )
                }
                composable("playlist/{playlistId}") { backStackEntry ->
                    val playlistId = backStackEntry.arguments?.getString("playlistId")?.toIntOrNull() ?: return@composable
                    com.sinc.enhanced.ui.screens.playlist.PlaylistDetailScreen(
                        playlistId = playlistId,
                        onPlayTrack = { track ->
                            track.previewUrl?.let { url ->
                                musicPlayer.playUrl(track, url)
                                navController.navigate(Routes.PLAYER)
                            }
                        },
                        onNavigateBack = { navController.popBackStack() }
                    )
                }
                composable(Routes.IMPORT_PLAYLIST) {
                    val ctx = androidx.compose.ui.platform.LocalContext.current
                    com.sinc.enhanced.ui.screens.playlist.ImportPlaylistScreen(
                        onDownloadTrack = { track, audioUrl ->
                            scope.launch {
                                val repo = SincApp.instance.container.downloadRepository
                                repo.addToQueue(track, audioUrl)
                                val intent = android.content.Intent(ctx, com.sinc.enhanced.service.DownloadService::class.java).apply {
                                    action = com.sinc.enhanced.service.DownloadService.ACTION_PROCESS_QUEUE
                                }
                                ctx.startForegroundService(intent)
                            }
                        },
                        onNavigateBack = { navController.popBackStack() }
                    )
                }
                composable("artist/{artistId}") { backStackEntry ->
                    val artistId = backStackEntry.arguments?.getString("artistId") ?: return@composable
                    com.sinc.enhanced.ui.screens.artist.ArtistDetailScreen(
                        artistId = artistId,
                        onPlayTrack = { track, url ->
                            musicPlayer.playUrl(track, url)
                            navController.navigate(Routes.PLAYER)
                        },
                        onNavigateBack = { navController.popBackStack() }
                    )
                }
                composable("track/{trackId}") { backStackEntry ->
                    val trackId = backStackEntry.arguments?.getString("trackId") ?: return@composable
                    com.sinc.enhanced.ui.screens.track.TrackDetailScreen(
                        trackId = trackId,
                        onPlayTrack = { track, url ->
                            musicPlayer.playUrl(track, url)
                            navController.navigate(Routes.PLAYER)
                        },
                        onNavigateArtist = { id ->
                            navController.navigate("artist/$id")
                        },
                        onNavigateBack = { navController.popBackStack() }
                    )
                }
            }
        }
    }
}

private suspend fun schedulePing() {
    val api = SincApp.instance.container.apiClient
    val auth = SincApp.instance.container.authRepository
    try {
        if (auth.authState.first().isLoggedIn) {
            api.ping()
        }
    } catch (_: Exception) {}
}
