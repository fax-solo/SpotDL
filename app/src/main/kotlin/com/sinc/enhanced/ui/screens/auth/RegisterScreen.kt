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
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
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
import com.sinc.enhanced.ui.theme.TextMid

@Composable
fun RegisterScreen(
    onRegisterSuccess: () -> Unit,
    onNavigateLogin: () -> Unit,
    onNavigateSettings: () -> Unit = {},
    viewModel: RegisterViewModel = viewModel(factory = RegisterViewModel.Factory())
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    var username by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var confirmPassword by remember { mutableStateOf("") }

    LaunchedEffect(uiState.isSuccess) {
        if (uiState.isSuccess) onRegisterSuccess()
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Brush.verticalGradient(listOf(Surface, Ink)))
    ) {
        SincWaveBars()
        RegisterForm(
            uiState = uiState,
            state = RegisterFormState(username, password, confirmPassword),
            actions = RegisterFormActions(
                onUsernameChange = { username = it; viewModel.clearError() },
                onPasswordChange = { password = it; viewModel.clearError() },
                onConfirmPasswordChange = { confirmPassword = it; viewModel.clearError() },
                onSubmit = {
                    viewModel.register(username, password, confirmPassword)
                }
            ),
            onNavigateLogin = onNavigateLogin
        )
    }
}

internal data class RegisterFormState(
    val username: String,
    val password: String,
    val confirmPassword: String
)

internal data class RegisterFormActions(
    val onUsernameChange: (String) -> Unit,
    val onPasswordChange: (String) -> Unit,
    val onConfirmPasswordChange: (String) -> Unit,
    val onSubmit: () -> Unit
)

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
private fun RegisterForm(
    uiState: RegisterUiState,
    state: RegisterFormState,
    actions: RegisterFormActions,
    onNavigateLogin: () -> Unit
) {
    val focusManager = LocalFocusManager.current
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        SincWordmark(tagline = "Join the server to sync across devices")

        Spacer(Modifier.height(28.dp))

        OutlinedTextField(
            value = state.username,
            onValueChange = actions.onUsernameChange,
            label = { Text("Username (min 3 chars)") },
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
            label = { Text("Password (min 8 chars, 1 letter + 1 number)") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(
                keyboardType = KeyboardType.Password,
                imeAction = ImeAction.Next
            ),
            keyboardActions = KeyboardActions(
                onNext = { focusManager.moveFocus(FocusDirection.Down) }
            ),
            shape = RoundedCornerShape(16.dp)
        )

        Spacer(Modifier.height(12.dp))

        OutlinedTextField(
            value = state.confirmPassword,
            onValueChange = actions.onConfirmPasswordChange,
            label = { Text("Confirm Password") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            visualTransformation = PasswordVisualTransformation(),
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
            } else {
                Text("Create account")
            }
        }

        Spacer(Modifier.height(12.dp))

        TextButton(onClick = onNavigateLogin) {
            Text(
                text = "Already have an account? Login",
                style = MaterialTheme.typography.bodySmall
            )
        }
    }
}
