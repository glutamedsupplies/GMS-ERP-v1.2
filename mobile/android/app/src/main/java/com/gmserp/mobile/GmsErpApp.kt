package com.gmserp.mobile

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel

@Composable
fun GmsErpApp() {
    val context = LocalContext.current
    val sessionStore = remember(context) { SessionStore(context.applicationContext) }
    val apiClient = remember(context) { GmsApiClient(sessionStore) }
    val sessionViewModel: SessionViewModel = viewModel(
        factory = SessionViewModelFactory(sessionStore, apiClient)
    )
    val uiState = sessionViewModel.uiState.value
    val colorScheme = remember(uiState.branding.primaryColorHex) {
        buildColorScheme(uiState.branding.primaryColorHex)
    }

    MaterialTheme(colorScheme = colorScheme) {
        Surface(
            modifier = Modifier.fillMaxSize(),
            color = MaterialTheme.colorScheme.background
        ) {
            when (uiState.screen) {
                MobileScreen.SPLASH -> SplashScreen(uiState)
                MobileScreen.LOGIN -> AdaptiveShell(uiState.branding) {
                    LoginScreen(uiState, sessionViewModel)
                }
                MobileScreen.WORKSPACE -> AdaptiveShell(uiState.branding) {
                    WorkspaceScreen(uiState, sessionViewModel)
                }
                MobileScreen.DELETE_ACCOUNT -> AdaptiveShell(uiState.branding) {
                    DeleteAccountScreen(uiState, sessionViewModel)
                }
            }
        }
    }
}

@Composable
private fun AdaptiveShell(
    branding: Branding,
    content: @Composable () -> Unit
) {
    BoxWithConstraints(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .statusBarsPadding()
            .navigationBarsPadding()
            .imePadding()
            .padding(16.dp)
    ) {
        val wideLayout = maxWidth >= 900.dp
        if (wideLayout) {
            Row(
                modifier = Modifier.fillMaxSize(),
                horizontalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                BrandPanel(
                    branding = branding,
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxSize()
                )
                Box(
                    modifier = Modifier
                        .weight(1.2f)
                        .fillMaxSize()
                ) {
                    content()
                }
            }
        } else {
            Column(
                modifier = Modifier.fillMaxSize(),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                BrandPanel(branding = branding, modifier = Modifier.fillMaxWidth())
                Box(modifier = Modifier.fillMaxWidth()) {
                    content()
                }
            }
        }
    }
}

@Composable
private fun BrandPanel(branding: Branding, modifier: Modifier = Modifier) {
    Card(
        modifier = modifier,
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.64f)
        ),
        shape = RoundedCornerShape(28.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Text(
                text = branding.appName.ifBlank { "GMS ERP" },
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold
            )
            Text(
                text = branding.companyName.ifBlank {
                    "Universal mobile shell for employee, head-admin, and super-admin workspaces."
                },
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Text(
                text = branding.subtitle.ifBlank {
                    "Company-aware login, session restore, runtime branding, and store-compliant account deletion."
                },
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            InfoCard(
                title = "Beta 1 focus",
                body = "Login, attendance, inventory stock, team directory, settings, and head-admin shell foundations."
            )
            InfoCard(
                title = "Large-screen rule",
                body = "This shell stretches into a two-pane tablet layout automatically so forms and dashboards stay usable."
            )
        }
    }
}

@Composable
private fun SplashScreen(uiState: SessionUiState) {
    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                text = uiState.branding.appName.ifBlank { "GMS ERP" },
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold
            )
            Spacer(modifier = Modifier.height(10.dp))
            Text(
                text = uiState.infoMessage.ifBlank { "Preparing mobile workspace..." },
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

@Composable
private fun LoginScreen(uiState: SessionUiState, viewModel: SessionViewModel) {
    AppCard(title = "Sign in") {
        StatusBanners(uiState)
        OutlinedTextField(
            value = uiState.companyCode,
            onValueChange = viewModel::updateCompanyCode,
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Company ID") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next)
        )
        Spacer(modifier = Modifier.height(12.dp))
        OutlinedTextField(
            value = uiState.username,
            onValueChange = viewModel::updateUsername,
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Username or email") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(
                keyboardType = KeyboardType.Email,
                imeAction = ImeAction.Next
            )
        )
        Spacer(modifier = Modifier.height(12.dp))
        OutlinedTextField(
            value = uiState.password,
            onValueChange = viewModel::updatePassword,
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Password") },
            singleLine = true,
            visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(
                keyboardType = KeyboardType.Password,
                imeAction = ImeAction.Done
            )
        )
        Spacer(modifier = Modifier.height(16.dp))
        Button(
            onClick = viewModel::submitLogin,
            modifier = Modifier.fillMaxWidth(),
            enabled = !uiState.isBusy
        ) {
            Text(if (uiState.isBusy) "Please wait..." else "Continue")
        }
        Spacer(modifier = Modifier.height(10.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            OutlinedButton(
                onClick = viewModel::announceNativeGoogleFlow,
                modifier = Modifier.weight(1f),
                enabled = !uiState.isBusy
            ) {
                Text("Google")
            }
            OutlinedButton(
                onClick = viewModel::announceNativeAppleFlow,
                modifier = Modifier.weight(1f),
                enabled = !uiState.isBusy
            ) {
                Text("Apple")
            }
        }
        Spacer(modifier = Modifier.height(8.dp))
        TextButton(
            onClick = viewModel::openDeleteAccount,
            enabled = !uiState.isBusy,
            modifier = Modifier.fillMaxWidth()
        ) {
            Text("Delete account")
        }
        Spacer(modifier = Modifier.height(10.dp))
        InfoCard(
            title = "Native auth handoff",
            body = "Google and Apple buttons are already routed in the state layer. Plug in Firebase provider token acquisition here, then exchange through /api/login/firebase."
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun WorkspaceScreen(uiState: SessionUiState, viewModel: SessionViewModel) {
    val modules = uiState.bootstrap?.moduleNames.orEmpty()
    val user = uiState.user

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = uiState.bootstrap?.company?.name
                            ?: uiState.branding.companyName.ifBlank { uiState.branding.appName }
                    )
                },
                actions = {
                    TextButton(onClick = viewModel::restoreSession, enabled = !uiState.isBusy) {
                        Text("Refresh")
                    }
                    TextButton(onClick = viewModel::logout, enabled = !uiState.isBusy) {
                        Text("Logout")
                    }
                }
            )
        }
    ) { innerPadding ->
        AppCard(
            title = "Workspace ready",
            modifier = Modifier.padding(innerPadding)
        ) {
            StatusBanners(uiState)
            InfoCard(
                title = user?.name?.ifBlank { "Signed-in user" } ?: "Signed-in user",
                body = buildString {
                    append("Role: ")
                    append(user?.role?.ifBlank { "employee" } ?: "unknown")
                    if (user?.branchName?.isNotBlank() == true) {
                        append("\nBranch: ${user.branchName}")
                    }
                    if (uiState.lastUpdatedAtLabel.isNotBlank()) {
                        append("\nSynced: ${uiState.lastUpdatedAtLabel}")
                    }
                }
            )
            Spacer(modifier = Modifier.height(12.dp))
            InfoCard(
                title = "Company routing",
                body = "Company code ${uiState.companyCode.ifBlank { "not set" }} stays pinned for branding, session recovery, and public flows like account deletion."
            )
            Spacer(modifier = Modifier.height(12.dp))
            InfoCard(
                title = "Beta wave modules",
                body = if (modules.isNotEmpty()) {
                    modules.take(8).joinToString(separator = "\n") { "- $it" }
                } else {
                    "Use this shell to attach employee workspace, attendance, inventory stock, team directory, settings, and head-admin feature screens."
                }
            )
            Spacer(modifier = Modifier.height(14.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Button(
                    onClick = viewModel::openDeleteAccount,
                    modifier = Modifier.weight(1f),
                    enabled = !uiState.isBusy
                ) {
                    Text("Account deletion")
                }
                OutlinedButton(
                    onClick = viewModel::restoreSession,
                    modifier = Modifier.weight(1f),
                    enabled = !uiState.isBusy
                ) {
                    Text("Reload bootstrap")
                }
            }
        }
    }
}

@Composable
private fun DeleteAccountScreen(uiState: SessionUiState, viewModel: SessionViewModel) {
    AppCard(title = "Delete account") {
        StatusBanners(uiState)
        InfoCard(
            title = "Store compliance",
            body = "This screen calls the same deletion endpoints added to the backend and mirrors the public deletion page for users who uninstall first."
        )
        Spacer(modifier = Modifier.height(12.dp))
        OutlinedTextField(
            value = uiState.companyCode,
            onValueChange = viewModel::updateCompanyCode,
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Company ID") },
            singleLine = true,
            enabled = !uiState.isBusy
        )
        Spacer(modifier = Modifier.height(12.dp))
        OutlinedTextField(
            value = uiState.deletionEmail,
            onValueChange = viewModel::updateDeletionEmail,
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Verified email") },
            singleLine = true,
            enabled = !uiState.isBusy,
            keyboardOptions = KeyboardOptions(
                keyboardType = KeyboardType.Email,
                imeAction = ImeAction.Next
            )
        )
        Spacer(modifier = Modifier.height(12.dp))
        OutlinedTextField(
            value = uiState.deletionCode,
            onValueChange = viewModel::updateDeletionCode,
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Verification code") },
            singleLine = true,
            enabled = !uiState.isBusy,
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done)
        )
        Spacer(modifier = Modifier.height(16.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            OutlinedButton(
                onClick = viewModel::requestDeletionCode,
                modifier = Modifier.weight(1f),
                enabled = !uiState.isBusy
            ) {
                Text("Send code")
            }
            Button(
                onClick = viewModel::confirmDeletion,
                modifier = Modifier.weight(1f),
                enabled = !uiState.isBusy
            ) {
                Text("Confirm delete")
            }
        }
        Spacer(modifier = Modifier.height(8.dp))
        TextButton(
            onClick = viewModel::closeDeleteAccount,
            modifier = Modifier.fillMaxWidth(),
            enabled = !uiState.isBusy
        ) {
            Text("Back")
        }
    }
}

@Composable
private fun AppCard(
    title: String,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit
) {
    Card(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(28.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(22.dp)
        ) {
            Text(
                text = title,
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold
            )
            Spacer(modifier = Modifier.height(16.dp))
            content()
        }
    }
}

@Composable
private fun StatusBanners(uiState: SessionUiState) {
    if (uiState.errorMessage.isNotBlank()) {
        InfoCard(
            title = "Needs attention",
            body = uiState.errorMessage,
            tint = MaterialTheme.colorScheme.errorContainer
        )
        Spacer(modifier = Modifier.height(12.dp))
    }
    if (uiState.infoMessage.isNotBlank()) {
        InfoCard(
            title = "Status",
            body = uiState.infoMessage,
            tint = MaterialTheme.colorScheme.primaryContainer
        )
        Spacer(modifier = Modifier.height(12.dp))
    }
}

@Composable
private fun InfoCard(
    title: String,
    body: String,
    tint: Color = MaterialTheme.colorScheme.surfaceVariant
) {
    Card(
        colors = CardDefaults.cardColors(containerColor = tint),
        shape = RoundedCornerShape(22.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp)
        ) {
            Text(
                text = title,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold
            )
            Spacer(modifier = Modifier.height(6.dp))
            Text(
                text = body,
                style = MaterialTheme.typography.bodyMedium
            )
        }
    }
}

private fun buildColorScheme(primaryHex: String) = darkColorScheme(
    primary = colorFromHex(primaryHex),
    secondary = colorFromHex(primaryHex).copy(alpha = 0.82f),
    tertiary = Color(0xFF22C55E),
    background = Color(0xFF07131F),
    surface = Color(0xFF0D1B2A),
    surfaceVariant = Color(0xFF13263A),
    error = Color(0xFFEF4444)
)

private fun colorFromHex(value: String): Color {
    val raw = value.trim().removePrefix("#")
    val normalized = when (raw.length) {
        6 -> "FF$raw"
        8 -> raw
        else -> "FF0EA5A4"
    }

    return try {
        Color(normalized.toLong(16))
    } catch (_error: Exception) {
        Color(0xFF0EA5A4)
    }
}
