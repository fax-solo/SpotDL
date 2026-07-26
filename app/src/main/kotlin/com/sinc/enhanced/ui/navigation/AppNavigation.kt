package com.sinc.enhanced.ui.navigation

import android.content.Intent
import android.content.res.Configuration
import androidx.compose.animation.*
import androidx.compose.foundation.layout.*
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavDeepLink
import androidx.navigation.NavDeepLinkRequest
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import androidx.navigation.navDeepLink
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
import com.sinc.enhanced.ui.components.TrackItem
import java.net.URLEncoder
import kotlinx.coroutines.delay
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
fun AppNavigation(intent: Intent? = null) {
    val navController = rememberNavController()
    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = navBackStackEntry?.destination?.route ?: Routes.LOGIN
    val scope = rememberCoroutineScope()

    val authRepository = SincApp.instance.container.authRepository

    var startDest by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) {
        val sessionValid = authRepository.restoreSession()
        startDest = if (sessionValid) Routes.HOME else Routes.LOGIN
        if (intent != null) {
            if (navController.currentBackStackEntry == null) return@LaunchedEffect
            handleDeepLink(intent, navController)
        }
    }

    if (startDest == null) {
        Box(
            modifier = Modifier.fillMaxSize(),
            contentAlignment = Alignment.Center
        ) {
            CircularProgressIndicator()
        }
        return
    }

    startDest?.let { start ->
        val isAuthScreen = currentRoute == Routes.LOGIN || currentRoute == Routes.REGISTER
        val showBottomNavBar = !isAuthScreen && currentRoute != Routes.PLAYER

        val configuration = LocalConfiguration.current
        val isWideScreen = configuration.screenWidthDp >= 600
        val isLandscape = configuration.orientation == Configuration.ORIENTATION_LANDSCAPE
        val isTablet = configuration.screenWidthDp >= 840

        val musicPlayer = SincApp.instance.container.musicPlayer
        val playerState by musicPlayer.state.collectAsStateWithLifecycle()

        val connectivity = SincApp.instance.container.connectivityMonitor
        val isOnline by connectivity.networkState.collectAsStateWithLifecycle(initialValue = true)
        val snackbarHostState = remember { SnackbarHostState() }
        val context = LocalContext.current

        var showCellularWarning by rememberSaveable { mutableStateOf(false) }
        var pendingDownloadTrack by remember { mutableStateOf<Pair<Track, String>?>(null) }

        fun startDownload(track: Track, audioUrl: String) {
            scope.launch {
                SincApp.instance.container.downloadRepository.addToQueue(track, audioUrl)
                val intent = Intent(context, DownloadService::class.java).apply {
                    action = DownloadService.ACTION_DOWNLOAD
                    putExtra(DownloadService.EXTRA_TRACK_ID, track.id)
                }
                context.startForegroundService(intent)
                navController.navigate(Routes.QUEUE)
            }
        }

        fun initiateDownload(track: Track, audioUrl: String) {
            if (connectivity.isCellular) {
                pendingDownloadTrack = track to audioUrl
                showCellularWarning = true
            } else {
                startDownload(track, audioUrl)
            }
        }

        LaunchedEffect(isOnline) {
            if (!isOnline) {
                snackbarHostState.showSnackbar("No internet connection")
            }
        }

        Scaffold(
            snackbarHost = { SnackbarHost(snackbarHostState) },
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
                                artworkUrl = playerState.currentTrack?.artworkUrl,
                                audioSource = playerState.currentAudioSource,
                                isPlaying = playerState.isPlaying,
                                onPlayPause = { musicPlayer.togglePlayPause() },
                                onSkipNext = { musicPlayer.skipToNext() },
                                onClick = { navController.navigate(Routes.PLAYER) }
                            )
                        }

                        if (showBottomNavBar) {
                            BottomNavBar(
                                currentRoute = currentRoute,
                                onNavigate = { route ->
                                    if (route == Routes.HOME) {
                                        navController.popBackStack(Routes.HOME, false)
                                    } else if (route != currentRoute) {
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
            if (showCellularWarning) {
                AlertDialog(
                    onDismissRequest = { showCellularWarning = false; pendingDownloadTrack = null },
                    title = { Text("Download over cellular?") },
                    text = { Text("You are on a cellular network. Downloading may use your mobile data.") },
                    confirmButton = {
                        Button(onClick = {
                            showCellularWarning = false
                            pendingDownloadTrack?.let { (t, url) -> startDownload(t, url) }
                            pendingDownloadTrack = null
                        }) { Text("Download anyway") }
                    },
                    dismissButton = {
                        TextButton(onClick = { showCellularWarning = false; pendingDownloadTrack = null }) {
                            Text("Cancel")
                        }
                    }
                )
            }
            NavHost(
                navController = navController,
                startDestination = start,
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding)
                    .then(
                        if (isWideScreen) Modifier.padding(horizontal = 48.dp)
                        else if (isLandscape) Modifier.padding(horizontal = 16.dp)
                        else Modifier
                    )
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
                        },
                        onNavigateSettings = { navController.navigate(Routes.SETTINGS) }
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
                        onNavigateLogin = { navController.popBackStack() },
                        onNavigateSettings = { navController.navigate(Routes.SETTINGS) }
                    )
                }
                composable(Routes.HOME) {
                    HomeScreen(
                        onSearch = { navController.navigate(Routes.SEARCH) },
                        onSearchQuery = { query ->
                            navController.navigate("search/${URLEncoder.encode(query, "UTF-8")}")
                        },
                        onNavigateSettings = { navController.navigate(Routes.SETTINGS) },
                        onNavigateHistory = { navController.navigate(Routes.HISTORY) },
                        onPlayTrack = { track, url ->
                            musicPlayer.playUrl(track, url)
                            navController.navigate(Routes.PLAYER)
                        }
                    )
                }
                composable(
                    route = Routes.SEARCH,
                    deepLinks = listOf(navDeepLink { uriPattern = "sinc://search" })
                ) {
                    SearchScreen(
                        initialQuery = "",
                        onPlayTrack = { track, url ->
                            musicPlayer.playUrl(track, url)
                            navController.navigate(Routes.PLAYER)
                        },
                        onDownloadTrack = { track, audioUrl -> initiateDownload(track, audioUrl) },
                        onNavigateArtist = { artistId ->
                            navController.navigate("artist/$artistId")
                        },
                        onNavigateTrack = { trackId ->
                            navController.navigate("track/$trackId")
                        },
                        onNavigateSettings = { navController.navigate(Routes.SETTINGS) },
                        onNavigateHistory = { navController.navigate(Routes.HISTORY) },
                        onPreview = { track, url ->
                            musicPlayer.previewTrack(track, url)
                        }
                    )
                }
                composable(
                    route = "search/{query}",
                    arguments = listOf(navArgument("query") { type = NavType.StringType })
                ) { backStackEntry ->
                    val initialQuery = backStackEntry.arguments?.getString("query") ?: ""
                    SearchScreen(
                        initialQuery = initialQuery,
                        onPlayTrack = { track, url ->
                            musicPlayer.playUrl(track, url)
                            navController.navigate(Routes.PLAYER)
                        },
                        onDownloadTrack = { track, audioUrl -> initiateDownload(track, audioUrl) },
                        onNavigateArtist = { artistId ->
                            navController.navigate("artist/$artistId")
                        },
                        onNavigateTrack = { trackId ->
                            navController.navigate("track/$trackId")
                        },
                        onNavigateSettings = { navController.navigate(Routes.SETTINGS) },
                        onNavigateHistory = { navController.navigate(Routes.HISTORY) },
                        onPreview = { track, url ->
                            musicPlayer.previewTrack(track, url)
                        }
                    )
                }
                composable(
                    route = Routes.QUEUE,
                    deepLinks = listOf(navDeepLink { uriPattern = "sinc://queue" })
                ) {
                    QueueScreen(
                        onPlayTrack = { track, url ->
                            musicPlayer.playUrl(track, url)
                            navController.navigate(Routes.PLAYER)
                        }
                    )
                }
                composable(
                    route = Routes.LIBRARY,
                    deepLinks = listOf(navDeepLink { uriPattern = "sinc://library" })
                ) {
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
                        },
                        onNavigateQueue = { navController.navigate(Routes.QUEUE) },
                        onShareTrack = { title, artist ->
                            val sendIntent = Intent().apply {
                                action = Intent.ACTION_SEND
                                putExtra(Intent.EXTRA_TEXT, "$title by $artist — shared via Sinc Enhanced")
                                type = "text/plain"
                            }
                            context.startActivity(Intent.createChooser(sendIntent, "Share track"))
                        }
                    )
                }
                composable(Routes.HISTORY) {
                    HistoryScreen(
                        onPlayTrack = { track, url ->
                            musicPlayer.playUrl(track, url)
                            navController.navigate(Routes.PLAYER)
                        },
                        onNavigateBack = { navController.popBackStack() }
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
                        onNavigateBack = { navController.popBackStack() },
                        onNavigateAdmin = { navController.navigate(Routes.ADMIN) },
                        onNavigateLogin = { navController.navigate(Routes.LOGIN) }
                    )
                }
                composable(Routes.ADMIN) {
                    AdminScreen(
                        onNavigateBack = { navController.popBackStack() }
                    )
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
                            val repo = SincApp.instance.container.searchRepository
                            scope.launch {
                                val url = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
                                    repo.findBestAudioForTrack(track)?.first
                                } ?: track.previewUrl
                                if (url != null) {
                                    musicPlayer.playUrl(track, url)
                                    navController.navigate(Routes.PLAYER)
                                }
                            }
                        },
                        onPlayAll = { tracks ->
                            scope.launch {
                                val loaded = tracks.map { t ->
                                    val url = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
                                        SincApp.instance.container.searchRepository.findBestAudioForTrack(t)?.first
                                    } ?: t.previewUrl
                                    if (url != null) t.copy(previewUrl = url) else t
                                }
                                musicPlayer.playAll(loaded)
                                navController.navigate(Routes.PLAYER)
                            }
                        },
                        onNavigateBack = { navController.popBackStack() }
                    )
                }
                composable(Routes.IMPORT_PLAYLIST) {
                    val ctx = LocalContext.current
                    com.sinc.enhanced.ui.screens.playlist.ImportPlaylistScreen(
                        onDownloadTrack = { track, audioUrl ->
                            scope.launch {
                                SincApp.instance.container.downloadRepository.addToQueue(track, audioUrl)
                            }
                        },
                        onQueueComplete = {
                            val intent = Intent(ctx, DownloadService::class.java).apply {
                                action = DownloadService.ACTION_PROCESS_QUEUE
                            }
                            ctx.startForegroundService(intent)
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
                        onNavigateArtist = { id ->
                            navController.navigate("artist/$id")
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

private fun handleDeepLink(intent: Intent, navController: androidx.navigation.NavController) {
    val uri = intent.data ?: return
    when (uri.scheme) {
        "sinc" -> {
            when (uri.host) {
                "search" -> navController.navigate(Routes.SEARCH)
                "queue" -> navController.navigate(Routes.QUEUE)
                "library" -> navController.navigate(Routes.LIBRARY)
            }
        }
        "spotify" -> {
            val path = uri.pathSegments
            if (path.size >= 2) {
                when (path[0]) {
                    "track" -> navController.navigate("track/${path[1]}")
                    "album" -> navController.navigate("search/${URLEncoder.encode(uri.lastPathSegment ?: "", "UTF-8")}")
                    "artist" -> navController.navigate("artist/${path[1]}")
                    "playlist" -> navController.navigate("search/${URLEncoder.encode(uri.lastPathSegment ?: "", "UTF-8")}")
                }
            }
        }
        "https" -> {
            if (uri.host == "open.spotify.com") {
                val path = uri.pathSegments
                if (path.size >= 2) {
                    when (path[0]) {
                        "track" -> navController.navigate("track/${path[1]}")
                        "album" -> navController.navigate("search/${URLEncoder.encode(uri.lastPathSegment ?: "", "UTF-8")}")
                        "artist" -> navController.navigate("artist/${path[1]}")
                        "playlist" -> navController.navigate("search/${URLEncoder.encode(uri.lastPathSegment ?: "", "UTF-8")}")
                    }
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
