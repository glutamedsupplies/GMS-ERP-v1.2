import Combine
import Foundation

@MainActor
final class SessionViewModel: ObservableObject {
    @Published private(set) var uiState: SessionUIState

    private let sessionStore: SessionStore
    private let apiClient: GMSAPIClient
    private var brandingTask: Task<Void, Never>? = nil

    init(
        sessionStore: SessionStore = SessionStore(),
        apiClient: GMSAPIClient? = nil
    ) {
        let store = sessionStore
        self.sessionStore = store
        self.apiClient = apiClient ?? GMSAPIClient(sessionStore: store)
        self.uiState = SessionUIState(
            companyCode: store.companyCode,
            username: store.username
        )

        Task {
            await restoreSession()
            if !uiState.companyCode.isEmpty {
                await refreshBranding(uiState.companyCode)
            }
        }
    }

    func updateCompanyCode(_ value: String) {
        let companyCode = value.trimmingCharacters(in: .whitespacesAndNewlines)
        sessionStore.companyCode = companyCode
        uiState.companyCode = companyCode
        brandingTask?.cancel()
        brandingTask = Task {
            try? await Task.sleep(nanoseconds: 180_000_000)
            guard !Task.isCancelled else { return }
            if companyCode.isEmpty {
                uiState.branding = Branding()
                uiState.errorMessage = ""
                return
            }
            await refreshBranding(companyCode)
        }
    }

    func updateUsername(_ value: String) {
        sessionStore.username = value
        uiState.username = value
    }

    func updatePassword(_ value: String) {
        uiState.password = value
    }

    func submitLogin() async {
        guard !uiState.companyCode.isEmpty else {
            uiState.errorMessage = "Company ID is required."
            uiState.infoMessage = ""
            return
        }
        guard !uiState.username.isEmpty else {
            uiState.errorMessage = "Username is required."
            uiState.infoMessage = ""
            return
        }
        guard !uiState.password.isEmpty else {
            uiState.errorMessage = "Password is required."
            uiState.infoMessage = ""
            return
        }

        uiState.isBusy = true
        uiState.errorMessage = ""
        uiState.infoMessage = "Signing in..."

        do {
            let user = try await apiClient.login(
                companyCode: uiState.companyCode,
                username: uiState.username,
                password: uiState.password
            )
            sessionStore.companyCode = user.companyCode.isEmpty ? uiState.companyCode : user.companyCode
            sessionStore.username = uiState.username
            sessionStore.userSnapshot = user
            let bootstrap = try await apiClient.getBootstrap()

            uiState.isBusy = false
            uiState.screen = .workspace
            uiState.user = user
            uiState.bootstrap = bootstrap
            uiState.branding = bootstrap.branding
            uiState.password = ""
            uiState.errorMessage = ""
            uiState.infoMessage = "Signed in successfully."
            uiState.lastUpdatedAtLabel = timestampLabel()
        } catch {
            uiState.isBusy = false
            uiState.errorMessage = error.localizedDescription
            uiState.infoMessage = ""
        }
    }

    func announceNativeGoogleFlow() {
        uiState.errorMessage = ""
        uiState.infoMessage = "Wire the native Firebase Google provider here, then exchange the ID token through /api/login/firebase."
    }

    func announceNativeAppleFlow() {
        uiState.errorMessage = ""
        uiState.infoMessage = "Wire Sign in with Apple into Firebase on iOS, then exchange the ID token through /api/login/firebase."
    }

    func logout() async {
        uiState.isBusy = true
        uiState.errorMessage = ""
        uiState.infoMessage = "Signing out..."
        await apiClient.logout()
        sessionStore.clearSession()
        uiState.isBusy = false
        uiState.screen = .login
        uiState.user = nil
        uiState.bootstrap = nil
        uiState.password = ""
        uiState.errorMessage = ""
        uiState.infoMessage = "Signed out."
        uiState.lastUpdatedAtLabel = timestampLabel()
    }

    func restoreSession() async {
        uiState.isBusy = true
        uiState.screen = .splash
        uiState.errorMessage = ""
        uiState.infoMessage = "Restoring session..."

        do {
            if let user = try await apiClient.restoreSession() {
                sessionStore.companyCode = user.companyCode.isEmpty ? sessionStore.companyCode : user.companyCode
                sessionStore.userSnapshot = user
                let bootstrap = try await apiClient.getBootstrap()

                uiState.isBusy = false
                uiState.screen = .workspace
                uiState.user = user
                uiState.bootstrap = bootstrap
                uiState.branding = bootstrap.branding
                uiState.companyCode = user.companyCode.isEmpty ? uiState.companyCode : user.companyCode
                uiState.errorMessage = ""
                uiState.infoMessage = "Session restored."
                uiState.lastUpdatedAtLabel = timestampLabel()
                return
            }

            uiState.isBusy = false
            uiState.screen = .login
            uiState.user = sessionStore.userSnapshot
            uiState.bootstrap = nil
            uiState.password = ""
            uiState.errorMessage = ""
            uiState.infoMessage = ""
            uiState.lastUpdatedAtLabel = timestampLabel()
        } catch {
            sessionStore.clearCookieHeader()
            uiState.isBusy = false
            uiState.screen = .login
            uiState.user = sessionStore.userSnapshot
            uiState.bootstrap = nil
            uiState.password = ""
            uiState.errorMessage = error.localizedDescription
            uiState.infoMessage = ""
        }
    }

    private func refreshBranding(_ companyCode: String) async {
        do {
            uiState.branding = try await apiClient.getPublicBranding(companyCode: companyCode)
        } catch {
            uiState.branding = Branding(companyCode: companyCode)
        }
    }

    private func timestampLabel() -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "MMM d, h:mm a"
        return formatter.string(from: Date())
    }
}
