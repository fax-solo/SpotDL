package com.sinc.enhanced.ui.screens.auth

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusDirection
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.sinc.enhanced.data.util.generateWaveform
import com.sinc.enhanced.ui.theme.Emerald
import com.sinc.enhanced.ui.theme.Ink
import com.sinc.enhanced.ui.theme.PlexMono
import com.sinc.enhanced.ui.theme.Surface
import com.sinc.enhanced.ui.theme.TextHigh
import com.sinc.enhanced.ui.theme.TextLow
import com.sinc.enhanced.ui.theme.TextMid

@Composable
fun LoginScreen(
    onLoginSuccess: () -> Unit,
    onNavigateRegister: () -> Unit,
    onSkip: () -> Unit,
    onNavigateSettings: () -> Unit = {},
    viewModel: LoginViewModel = viewModel(factory = LoginViewModel.Factory())
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    var username by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var passwordVisible by remember { mutableStateOf(false) }

    LaunchedEffect(uiState.isSuccess) {
        if (uiState.isSuccess) onLoginSuccess()
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Brush.verticalGradient(listOf(Surface, Ink)))
    ) {
        SincWaveBars()
        LoginForm(
            uiState = uiState,
            state = LoginFormState(username, password, passwordVisible),
            actions = LoginFormActions(
                onUsernameChange = { username = it; viewModel.clearError() },
                onPasswordChange = { password = it; viewModel.clearError() },
                onTogglePassword = { passwordVisible = !passwordVisible },
                onSubmit = { viewModel.login(username, password) }
            ),
            onNavigateRegister = onNavigateRegister,
            onSkip = onSkip
        )
    }
}

internal data class LoginFormState(
    val username: String,
    val password: String,
    val passwordVisible: Boolean
)

internal data class LoginFormActions(
    val onUsernameChange: (String) -> Unit,
    val onPasswordChange: (String) -> Unit,
    val onTogglePassword: () -> Unit,
    val onSubmit: () -> Unit
)

@Composable
internal fun SincWordmark(
    tagline: String,
    hint: String? = null
) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
            text = "SINC",
            style = MaterialTheme.typography.displaySmall.copy(
                fontFamily = PlexMono,
                fontWeight = FontWeight.SemiBold,
                letterSpacing = 10.sp
            ),
            color = TextHigh
        )
        Spacer(Modifier.height(12.dp))
        Text(
            text = tagline,
            style = MaterialTheme.typography.bodyMedium,
            color = TextMid
        )
        if (hint != null) {
            Text(
                text = hint,
                style = MaterialTheme.typography.bodySmall,
                color = TextLow
            )
        }
    }
}

@Composable
private fun SincWaveBars() {
    val bars = remember { generateWaveform("sinc", 24) }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 48.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically
    ) {
        bars.forEach { amp ->
            Box(
                modifier = Modifier
                    .width(7.dp)
                    .height((amp * 28).dp)
                    .background(Emerald, RoundedCornerShape(4.dp))
            )
            Spacer(Modifier.width(6.dp))
        }
    }
}

@Composable
private fun LoginForm(
    uiState: LoginUiState,
    state: LoginFormState,
    actions: LoginFormActions,
    onNavigateRegister: () -> Unit,
    onSkip: () -> Unit
) {
    val focusManager = LocalFocusManager.current
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        SincWordmark(
            tagline = "Login to sync stats & playlists",
            hint = "Optional — you can skip and use the app offline"
        )

        Spacer(Modifier.height(28.dp))

        OutlinedTextField(
            value = state.username,
            onValueChange = actions.onUsernameChange,
            label = { Text("Username") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
            keyboardActions = KeyboardActions(
                onNext = { focusManager.moveFocus(FocusDirection.Down) }
            ),
            shape = RoundedCornerShape(16.dp)
        )

        Spacer(Modifier.height(12.dp))

        OutlinedTextField(
            value = state.password,
            onValueChange = actions.onPasswordChange,
            label = { Text("Password") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            visualTransformation = if (state.passwordVisible) {
                VisualTransformation.None
            } else {
                PasswordVisualTransformation()
            },
            keyboardOptions = KeyboardOptions(
                keyboardType = KeyboardType.Password,
                imeAction = ImeAction.Done
            ),
            keyboardActions = KeyboardActions(
                onDone = {
                    focusManager.clearFocus()
                    actions.onSubmit()
                }
            ),
            trailingIcon = {
                IconButton(onClick = actions.onTogglePassword) {
                    Icon(
                        imageVector = if (state.passwordVisible) {
                            Icons.Default.VisibilityOff
                        } else {
                            Icons.Default.Visibility
                        },
                        contentDescription = if (state.passwordVisible) {
                            "Hide password"
                        } else {
                            "Show password"
                        }
                    )
                }
            },
            shape = RoundedCornerShape(16.dp)
        )

        if (uiState.error != null) {
            Spacer(Modifier.height(12.dp))
            Text(
                text = uiState.error,
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodySmall
            )
        }

        Spacer(Modifier.height(24.dp))

        Button(
            onClick = actions.onSubmit,
            modifier = Modifier.fillMaxWidth().height(52.dp),
            enabled = !uiState.isLoading,
            shape = RoundedCornerShape(16.dp)
        ) {
            if (uiState.isLoading) {
                CircularProgressIndicator(
                    modifier = Modifier.size(24.dp),
                    color = MaterialTheme.colorScheme.onPrimary
                )
                Spacer(Modifier.width(8.dp))
                Text(if (uiState.isConnecting) "Connecting..." else "Logging in...")
            } else {
                Text("Login")
            }
        }

        Spacer(Modifier.height(16.dp))

        OutlinedButton(
            onClick = onNavigateRegister,
            modifier = Modifier.fillMaxWidth().height(46.dp),
            shape = RoundedCornerShape(16.dp)
        ) {
            Text("Create new account")
        }

        Spacer(Modifier.height(8.dp))

        TextButton(onClick = onSkip) {
            Text("Skip — use offline", style = MaterialTheme.typography.bodySmall)
        }
    }
}
