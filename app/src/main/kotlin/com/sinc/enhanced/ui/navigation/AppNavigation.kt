package com.sinc.enhanced.ui.navigation

import androidx.compose.animation.*
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.sinc.enhanced.SincApp
import com.sinc.enhanced.data.model.Track
import com.sinc.enhanced.ui.components.BottomNavBar
import com.sinc.enhanced.ui.components.PlayerMiniBar
import com.sinc.enhanced.ui.screens.admin.AdminScreen
import com.sinc.enhanced.ui.screens.auth.LoginScreen
import com.sinc.enhanced.ui.screens.auth.RegisterScreen
import com.sinc.enhanced.ui.screens.history.HistoryScreen
import com.sinc.enhanced.ui.screens.library.LibraryScreen
import com.sinc.enhanced.ui.screens.player.PlayerScreen
import com.sinc.enhanced.ui.screens.queue.QueueScreen
import com.sinc.enhanced.ui.screens.search.SearchScreen
import com.sinc.enhanced.ui.screens.settings.SettingsScreen
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

object Routes {
    const val LOGIN = "login"
    const val REGISTER = "register"
    const val SEARCH = "search"
    const val QUEUE = "queue"
    const val LIBRARY = "library"
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
        startDest = if (sessionValid) Routes.SEARCH else Routes.LOGIN
    }

    startDest?.let { start ->
        val isAuthScreen = currentRoute == Routes.LOGIN || currentRoute == Routes.REGISTER
        val bottomTabRoutes = listOf(Routes.SEARCH, Routes.QUEUE, Routes.LIBRARY, Routes.ADMIN)
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
                                            popUpTo(Routes.SEARCH) { saveState = true }
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
                            navController.navigate(Routes.SEARCH) {
                                popUpTo(Routes.LOGIN) { inclusive = true }
                            }
                            scope.launch { schedulePing() }
                        },
                        onNavigateRegister = { navController.navigate(Routes.REGISTER) },
                        onSkip = {
                            navController.navigate(Routes.SEARCH) {
                                popUpTo(Routes.LOGIN) { inclusive = true }
                            }
                        }
                    )
                }
                composable(Routes.REGISTER) {
                    RegisterScreen(
                        onRegisterSuccess = {
                            navController.navigate(Routes.SEARCH) {
                                popUpTo(Routes.LOGIN) { inclusive = true }
                            }
                            scope.launch { schedulePing() }
                        },
                        onNavigateLogin = { navController.popBackStack() }
                    )
                }
                composable(Routes.SEARCH) {
                    SearchScreen(
                        onPlayTrack = { trackId, url ->
                            val track = Track(id = trackId, title = "", artist = "", album = "")
                            musicPlayer.playUrl(track, url)
                            navController.navigate(Routes.PLAYER)
                        },
                        onDownloadTrack = { _, _ ->
                            navController.navigate(Routes.QUEUE)
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
                        }
                    )
                }
                composable(Routes.PLAYER) {
                    PlayerScreen()
                }
                composable(Routes.HISTORY) {
                    HistoryScreen(
                        onPlayHistory = { _ ->
                            navController.navigate(Routes.PLAYER)
                        }
                    )
                }
                composable(Routes.ADMIN) {
                    AdminScreen()
                }
                composable(Routes.SETTINGS) {
                    SettingsScreen()
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
