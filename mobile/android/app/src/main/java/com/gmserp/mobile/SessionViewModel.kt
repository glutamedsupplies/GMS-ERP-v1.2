package com.gmserp.mobile

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

class SessionViewModel(
    private val sessionStore: SessionStore,
    private val apiClient: GmsApiClient
) : ViewModel() {
    private var brandingJob: Job? = null

    var uiState = androidx.compose.runtime.mutableStateOf(
        SessionUiState(
            companyCode = sessionStore.getCompanyCode(),
            username = sessionStore.getUsername()
        )
    )
        private set

    init {
        restoreSession()
        if (uiState.value.companyCode.isNotBlank()) {
            refreshBranding(uiState.value.companyCode)
        }
    }

    fun updateCompanyCode(value: String) {
        val companyCode = value.trim()
        sessionStore.saveCompanyCode(companyCode)
        uiState.value = uiState.value.copy(companyCode = companyCode)
        brandingJob?.cancel()
        brandingJob = viewModelScope.launch {
            delay(180)
            if (companyCode.isBlank()) {
                uiState.value = uiState.value.copy(
                    branding = Branding(),
                    infoMessage = "",
                    errorMessage = ""
                )
                return@launch
            }
            refreshBranding(companyCode)
        }
    }

    fun updateUsername(value: String) {
        sessionStore.saveUsername(value)
        uiState.value = uiState.value.copy(username = value)
    }

    fun updatePassword(value: String) {
        uiState.value = uiState.value.copy(password = value)
    }

    fun updateDeletionEmail(value: String) {
        uiState.value = uiState.value.copy(deletionEmail = value.trim())
    }

    fun updateDeletionCode(value: String) {
        uiState.value = uiState.value.copy(deletionCode = value.trim())
    }

    fun openDeleteAccount() {
        uiState.value = uiState.value.copy(
            screen = MobileScreen.DELETE_ACCOUNT,
            deletionEmail = uiState.value.deletionEmail.ifBlank {
                uiState.value.username.takeIf { it.contains('@') }.orEmpty()
            },
            errorMessage = "",
            infoMessage = ""
        )
    }

    fun closeDeleteAccount() {
        uiState.value = uiState.value.copy(
            screen = if (uiState.value.user == null) MobileScreen.LOGIN else MobileScreen.WORKSPACE,
            deletionCode = "",
            errorMessage = "",
            infoMessage = ""
        )
    }

    fun submitLogin() {
        val current = uiState.value
        if (current.companyCode.isBlank()) {
            uiState.value = current.copy(errorMessage = "Company ID is required.", infoMessage = "")
            return
        }
        if (current.username.isBlank()) {
            uiState.value = current.copy(errorMessage = "Username is required.", infoMessage = "")
            return
        }
        if (current.password.isBlank()) {
            uiState.value = current.copy(errorMessage = "Password is required.", infoMessage = "")
            return
        }

        viewModelScope.launch {
            uiState.value = uiState.value.copy(isBusy = true, errorMessage = "", infoMessage = "Signing in...")
            runCatching {
                val user = apiClient.login(
                    companyCode = uiState.value.companyCode,
                    username = uiState.value.username,
                    password = uiState.value.password
                )
                sessionStore.saveCompanyCode(user.companyCode.ifBlank { uiState.value.companyCode })
                sessionStore.saveUsername(uiState.value.username)
                sessionStore.saveUserSnapshot(user)
                val bootstrap = apiClient.getBootstrap()
                uiState.value = uiState.value.copy(
                    isBusy = false,
                    screen = MobileScreen.WORKSPACE,
                    user = user,
                    bootstrap = bootstrap,
                    branding = bootstrap.branding,
                    password = "",
                    deletionEmail = uiState.value.deletionEmail.ifBlank {
                        uiState.value.username.takeIf { it.contains('@') }.orEmpty()
                    },
                    errorMessage = "",
                    infoMessage = "Signed in successfully.",
                    lastUpdatedAtLabel = buildTimestampLabel()
                )
            }.onFailure { error ->
                uiState.value = uiState.value.copy(
                    isBusy = false,
                    errorMessage = error.message ?: "Unable to sign in.",
                    infoMessage = ""
                )
            }
        }
    }

    fun announceNativeGoogleFlow() {
        uiState.value = uiState.value.copy(
            errorMessage = "",
            infoMessage = "Wire the native Firebase Google token here, then send it to /api/login/firebase."
        )
    }

    fun announceNativeAppleFlow() {
        uiState.value = uiState.value.copy(
            errorMessage = "",
            infoMessage = "Wire Sign in with Apple through Firebase on iOS, then exchange the token through /api/login/firebase."
        )
    }

    fun requestDeletionCode() {
        val current = uiState.value
        if (current.companyCode.isBlank()) {
            uiState.value = current.copy(errorMessage = "Company ID is required.", infoMessage = "")
            return
        }
        if (current.deletionEmail.isBlank()) {
            uiState.value = current.copy(errorMessage = "Verified email is required.", infoMessage = "")
            return
        }

        viewModelScope.launch {
            uiState.value = uiState.value.copy(isBusy = true, errorMessage = "", infoMessage = "Sending deletion code...")
            runCatching {
                apiClient.requestAccountDeletion(
                    companyCode = uiState.value.companyCode,
                    email = uiState.value.deletionEmail
                )
            }.onSuccess { result ->
                uiState.value = uiState.value.copy(
                    isBusy = false,
                    deletionEmail = result.email.ifBlank { uiState.value.deletionEmail },
                    errorMessage = "",
                    infoMessage = "Deletion code sent to ${result.email.ifBlank { uiState.value.deletionEmail }}."
                )
            }.onFailure { error ->
                uiState.value = uiState.value.copy(
                    isBusy = false,
                    errorMessage = error.message ?: "Unable to send deletion code.",
                    infoMessage = ""
                )
            }
        }
    }

    fun confirmDeletion() {
        val current = uiState.value
        if (current.deletionCode.isBlank()) {
            uiState.value = current.copy(errorMessage = "Verification code is required.", infoMessage = "")
            return
        }

        viewModelScope.launch {
            uiState.value = uiState.value.copy(isBusy = true, errorMessage = "", infoMessage = "Deleting account...")
            runCatching {
                apiClient.confirmAccountDeletion(
                    companyCode = uiState.value.companyCode,
                    email = uiState.value.deletionEmail,
                    code = uiState.value.deletionCode
                )
            }.onSuccess {
                sessionStore.clearSession()
                uiState.value = uiState.value.copy(
                    isBusy = false,
                    screen = MobileScreen.LOGIN,
                    user = null,
                    bootstrap = null,
                    deletionCode = "",
                    password = "",
                    errorMessage = "",
                    infoMessage = "Account deleted. Sign in again only if you still have access.",
                    lastUpdatedAtLabel = buildTimestampLabel()
                )
            }.onFailure { error ->
                uiState.value = uiState.value.copy(
                    isBusy = false,
                    errorMessage = error.message ?: "Unable to delete account.",
                    infoMessage = ""
                )
            }
        }
    }

    fun logout() {
        viewModelScope.launch {
            uiState.value = uiState.value.copy(isBusy = true, errorMessage = "", infoMessage = "Signing out...")
            runCatching {
                apiClient.logout()
            }.onSuccess {
                sessionStore.clearSession()
                uiState.value = uiState.value.copy(
                    isBusy = false,
                    screen = MobileScreen.LOGIN,
                    user = null,
                    bootstrap = null,
                    password = "",
                    deletionCode = "",
                    errorMessage = "",
                    infoMessage = "Signed out.",
                    lastUpdatedAtLabel = buildTimestampLabel()
                )
            }.onFailure { error ->
                uiState.value = uiState.value.copy(
                    isBusy = false,
                    errorMessage = error.message ?: "Unable to sign out.",
                    infoMessage = ""
                )
            }
        }
    }

    fun restoreSession() {
        viewModelScope.launch {
            uiState.value = uiState.value.copy(isBusy = true, screen = MobileScreen.SPLASH, errorMessage = "", infoMessage = "Restoring session...")
            runCatching {
                val user = apiClient.restoreSession()
                if (user == null) {
                    return@runCatching null
                }
                sessionStore.saveCompanyCode(user.companyCode.ifBlank { sessionStore.getCompanyCode() })
                sessionStore.saveUserSnapshot(user)
                val bootstrap = apiClient.getBootstrap()
                user to bootstrap
            }.onSuccess { result ->
                if (result == null) {
                    uiState.value = uiState.value.copy(
                        isBusy = false,
                        screen = MobileScreen.LOGIN,
                        user = sessionStore.getUserSnapshot(),
                        bootstrap = null,
                        password = "",
                        errorMessage = "",
                        infoMessage = "",
                        lastUpdatedAtLabel = buildTimestampLabel()
                    )
                    return@onSuccess
                }

                val (user, bootstrap) = result
                uiState.value = uiState.value.copy(
                    isBusy = false,
                    screen = MobileScreen.WORKSPACE,
                    user = user,
                    bootstrap = bootstrap,
                    branding = bootstrap.branding,
                    companyCode = user.companyCode.ifBlank { uiState.value.companyCode },
                    deletionEmail = uiState.value.deletionEmail.ifBlank {
                        uiState.value.username.takeIf { it.contains('@') }.orEmpty()
                    },
                    errorMessage = "",
                    infoMessage = "Session restored.",
                    lastUpdatedAtLabel = buildTimestampLabel()
                )
            }.onFailure { error ->
                sessionStore.clearCookieHeader()
                uiState.value = uiState.value.copy(
                    isBusy = false,
                    screen = MobileScreen.LOGIN,
                    user = sessionStore.getUserSnapshot(),
                    bootstrap = null,
                    password = "",
                    errorMessage = error.message ?: "Unable to restore session.",
                    infoMessage = ""
                )
            }
        }
    }

    private fun refreshBranding(companyCode: String) {
        viewModelScope.launch {
            runCatching {
                apiClient.getPublicBranding(companyCode)
            }.onSuccess { branding ->
                uiState.value = uiState.value.copy(branding = branding)
            }.onFailure {
                uiState.value = uiState.value.copy(branding = Branding(companyCode = companyCode))
            }
        }
    }

    private fun buildTimestampLabel(): String {
        return SimpleDateFormat("MMM d, h:mm a", Locale.US).format(Date())
    }
}

class SessionViewModelFactory(
    private val sessionStore: SessionStore,
    private val apiClient: GmsApiClient
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        if (modelClass.isAssignableFrom(SessionViewModel::class.java)) {
            return SessionViewModel(sessionStore, apiClient) as T
        }
        throw IllegalArgumentException("Unsupported ViewModel class: ${modelClass.name}")
    }
}
