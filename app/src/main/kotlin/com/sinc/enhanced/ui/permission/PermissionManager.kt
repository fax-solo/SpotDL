package com.sinc.enhanced.ui.permission

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat

sealed class AudioPermissionState {
    data object Granted : AudioPermissionState()
    data object NotAsked : AudioPermissionState()
    data object Denied : AudioPermissionState()
    data object DeniedPermanently : AudioPermissionState()
}

@Composable
fun rememberAudioPermissionState(): AudioPermissionState {
    val context = LocalContext.current
    val permission = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        Manifest.permission.READ_MEDIA_AUDIO
    } else {
        Manifest.permission.READ_EXTERNAL_STORAGE
    }

    var deniedOnce by remember { mutableStateOf(false) }
    var state by remember {
        mutableStateOf<AudioPermissionState>(
            if (ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED) {
                AudioPermissionState.Granted
            } else {
                AudioPermissionState.NotAsked
            }
        )
    }

    val launcher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission()
    ) { granted ->
        state = if (granted) {
            AudioPermissionState.Granted
        } else if (deniedOnce) {
            AudioPermissionState.DeniedPermanently
        } else {
            deniedOnce = true
            AudioPermissionState.Denied
        }
    }

    return state
}

@Composable
fun PermissionRequestEffect(
    permissionState: AudioPermissionState,
    onPermissionResult: (AudioPermissionState) -> Unit
) {
    val context = LocalContext.current
    val permission = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        Manifest.permission.READ_MEDIA_AUDIO
    } else {
        Manifest.permission.READ_EXTERNAL_STORAGE
    }

    var deniedOnce by remember { mutableStateOf(false) }

    val launcher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission()
    ) { granted ->
        val newState = if (granted) {
            AudioPermissionState.Granted
        } else if (deniedOnce) {
            AudioPermissionState.DeniedPermanently
        } else {
            deniedOnce = true
            AudioPermissionState.Denied
        }
        onPermissionResult(newState)
    }

    LaunchedEffect(permissionState) {
        if (permissionState == AudioPermissionState.NotAsked) {
            launcher.launch(permission)
        }
    }
}

@Composable
fun PermissionRequiredContent(
    permissionState: AudioPermissionState,
    onRequestPermission: () -> Unit,
    content: @Composable () -> Unit
) {
    when (permissionState) {
        is AudioPermissionState.Granted -> content()

        is AudioPermissionState.NotAsked -> {
            LaunchedEffect(Unit) { onRequestPermission() }
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
        }

        is AudioPermissionState.Denied, is AudioPermissionState.DeniedPermanently -> {
            val context = LocalContext.current
            val isPermanent = permissionState is AudioPermissionState.DeniedPermanently
            var showDialog by remember { mutableStateOf(true) }

            if (showDialog) {
                AlertDialog(
                    onDismissRequest = { showDialog = false },
                    title = { Text("Audio Access Required") },
                    text = {
                        Text(
                            if (isPermanent) {
                                "Sinc Enhanced needs access to your music files. Please enable the permission in Settings."
                            } else {
                                "Grant audio access to browse your local music library."
                            }
                        )
                    },
                    confirmButton = {
                        Button(onClick = {
                            showDialog = false
                            if (isPermanent) {
                                context.startActivity(
                                    Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                                        data = Uri.fromParts("package", context.packageName, null)
                                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                                    }
                                )
                            } else {
                                onRequestPermission()
                            }
                        }) {
                            Text(if (isPermanent) "Open Settings" else "Grant Permission")
                        }
                    },
                    dismissButton = {
                        TextButton(onClick = { showDialog = false }) {
                            Text("Not Now")
                        }
                    }
                )
            }

            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(
                        if (isPermanent) "Permission permanently denied"
                        else "Cannot access music library",
                        style = MaterialTheme.typography.titleMedium
                    )
                    Spacer(Modifier.height(8.dp))
                    Text(
                        if (isPermanent) "Enable audio access in Settings"
                        else "Grant audio permission to view your music",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Spacer(Modifier.height(16.dp))
                    Button(onClick = {
                        if (isPermanent) {
                            context.startActivity(
                                Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                                    data = Uri.fromParts("package", context.packageName, null)
                                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                                }
                            )
                        } else {
                            onRequestPermission()
                        }
                    }) {
                        Text(if (isPermanent) "Open Settings" else "Retry")
                    }
                }
            }
        }
    }
}
