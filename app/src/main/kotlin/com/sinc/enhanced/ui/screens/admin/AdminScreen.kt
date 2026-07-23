package com.sinc.enhanced.ui.screens.admin

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.sinc.enhanced.SincApp
import com.sinc.enhanced.data.repository.StatsRepository
import kotlinx.coroutines.launch
import org.json.JSONObject

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AdminScreen(
    localViewModel: AdminViewModel = viewModel(factory = AdminViewModel.Factory())
) {
    val scope = rememberCoroutineScope()
    val authRepository = SincApp.instance.container.authRepository
    val authState by authRepository.authState.collectAsStateWithLifecycle(initialValue = com.sinc.enhanced.data.repository.AuthState())
    val apiClient = SincApp.instance.container.apiClient
    val localUiState by localViewModel.uiState.collectAsStateWithLifecycle()

    var serverStats by remember { mutableStateOf<JSONObject?>(null) }
    var serverUsers by remember { mutableStateOf<List<JSONObject>?>(null) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }

    fun loadServerStats() {
        if (!authState.isLoggedIn) return
        loading = true
        error = null
        scope.launch {
            try {
                serverStats = apiClient.getAdminStats()
                if (authState.isAdmin) {
                    serverUsers = apiClient.getAdminUsers()
                }
            } catch (e: Exception) {
                error = "Could not reach server"
            } finally {
                loading = false
            }
        }
    }

    LaunchedEffect(authState.isLoggedIn) {
        loadServerStats()
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp)
            .verticalScroll(rememberScrollState())
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = "Stats",
                style = MaterialTheme.typography.headlineLarge,
                color = MaterialTheme.colorScheme.onBackground
            )
            if (authState.isLoggedIn) {
                IconButton(onClick = { loadServerStats() }) {
                    Icon(Icons.Default.Refresh, "Refresh")
                }
            }
        }

        Spacer(Modifier.height(16.dp))

        if (authState.isLoggedIn && authState.isAdmin && serverStats != null) {
            val s = serverStats!!
            Text(
                text = "Server Stats",
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurface
            )
            Spacer(Modifier.height(8.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                StatCard(Modifier.weight(1f), Icons.Default.Person, "Total Users", s.optInt("total_users", 0).toString(), MaterialTheme.colorScheme.primary)
                StatCard(Modifier.weight(1f), Icons.Default.Person, "Active/Month", s.optInt("active_this_month", 0).toString(), MaterialTheme.colorScheme.tertiary)
                StatCard(Modifier.weight(1f), Icons.Default.Person, "Active/Year", s.optInt("active_this_year", 0).toString(), MaterialTheme.colorScheme.secondary)
            }

            Spacer(Modifier.height(12.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                StatCard(Modifier.weight(1f), Icons.Default.Download, "Downloads", s.optInt("total_downloads", 0).toString(), MaterialTheme.colorScheme.primary)
                StatCard(Modifier.weight(1f), Icons.Default.Download, "This Month", s.optInt("downloads_this_month", 0).toString(), MaterialTheme.colorScheme.tertiary)
                StatCard(Modifier.weight(1f), Icons.Default.Download, "This Year", s.optInt("downloads_this_year", 0).toString(), MaterialTheme.colorScheme.secondary)
            }

            serverUsers?.let { users ->
                Spacer(Modifier.height(16.dp))
                Text(
                    text = "Users (${users.size})",
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onSurface
                )
                Spacer(Modifier.height(8.dp))
                users.forEach { u ->
                    Surface(
                        modifier = Modifier.fillMaxWidth().padding(vertical = 3.dp),
                        shape = RoundedCornerShape(8.dp),
                        color = MaterialTheme.colorScheme.surfaceVariant
                    ) {
                        Row(
                            modifier = Modifier.padding(12.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column {
                                Text(u.optString("username"), style = MaterialTheme.typography.bodyMedium)
                                Text(
                                    text = "Role: ${u.optString("role")}",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                            Text(
                                text = formatTimestamp(u.optLong("last_seen_at")),
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }
            }

            Spacer(Modifier.height(24.dp))

            Text(
                text = "Local Device Stats",
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurface
            )
            Spacer(Modifier.height(8.dp))
            val localStats = localUiState.stats
            if (localStats != null) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    StatCard(Modifier.weight(1f), Icons.Default.Download, "Downloads", localStats.totalDownloads.toString(), MaterialTheme.colorScheme.primary)
                    StatCard(Modifier.weight(1f), Icons.Default.Download, "This Month", localStats.downloadsThisMonth.toString(), MaterialTheme.colorScheme.tertiary)
                    StatCard(Modifier.weight(1f), Icons.Default.Download, "This Year", localStats.downloadsThisYear.toString(), MaterialTheme.colorScheme.secondary)
                }
                Spacer(Modifier.height(8.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    StatCard(Modifier.weight(1f), Icons.Default.History, "History", localStats.totalHistoryItems.toString(), MaterialTheme.colorScheme.primary)
                    StatCard(Modifier.weight(1f), Icons.Default.History, "This Month", localStats.historyThisMonth.toString(), MaterialTheme.colorScheme.tertiary)
                    StatCard(Modifier.weight(1f), Icons.Default.History, "This Year", localStats.historyThisYear.toString(), MaterialTheme.colorScheme.secondary)
                }
                if (localStats.bySource.isNotEmpty()) {
                    Spacer(Modifier.height(8.dp))
                    Text("By Source", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(Modifier.height(4.dp))
                    localStats.bySource.forEach { sc ->
                        Text("${sc.source}: ${sc.count}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            } else if (localUiState.isLoading) {
                CircularProgressIndicator(modifier = Modifier.size(24.dp))
            }

            Spacer(Modifier.height(24.dp))

        } else if (authState.isLoggedIn && loading) {
            Box(
                modifier = Modifier.fillMaxWidth().height(200.dp),
                contentAlignment = Alignment.Center
            ) {
                CircularProgressIndicator()
            }
        } else if (authState.isLoggedIn && error != null) {
            Box(
                modifier = Modifier.fillMaxWidth().height(200.dp),
                contentAlignment = Alignment.Center
            ) {
                Text(error ?: "Error", color = MaterialTheme.colorScheme.error)
            }
        } else {
            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
                color = MaterialTheme.colorScheme.surfaceVariant
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text("Local Stats", style = MaterialTheme.typography.titleMedium)
                    Spacer(Modifier.height(4.dp))
                    Text(
                        text = "Login to see server-wide stats.\nLocal download history shown below.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
            Spacer(Modifier.height(16.dp))
            val localStats = localUiState.stats
            if (localStats != null) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    StatCard(Modifier.weight(1f), Icons.Default.Download, "Downloads", localStats.totalDownloads.toString(), MaterialTheme.colorScheme.primary)
                    StatCard(Modifier.weight(1f), Icons.Default.History, "History", localStats.totalHistoryItems.toString(), MaterialTheme.colorScheme.tertiary)
                }
            } else if (localUiState.isLoading) {
                CircularProgressIndicator(modifier = Modifier.size(24.dp))
            }
        }

        Spacer(Modifier.height(16.dp))
    }
}

private fun formatTimestamp(epoch: Long): String {
    if (epoch == 0L) return "Never"
    val sdf = java.text.SimpleDateFormat("MMM dd, yyyy", java.util.Locale.getDefault())
    return sdf.format(java.util.Date(epoch * 1000))
}

@Composable
private fun StatCard(
    modifier: Modifier = Modifier,
    icon: ImageVector,
    label: String,
    value: String,
    color: Color
) {
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(12.dp),
        color = color.copy(alpha = 0.12f)
    ) {
        Column(
            modifier = Modifier.padding(12.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Icon(icon, null, tint = color)
            Spacer(Modifier.height(4.dp))
            Text(
                text = value,
                style = MaterialTheme.typography.headlineMedium,
                color = color
            )
            Text(
                text = label,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}
