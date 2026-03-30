import SwiftUI

struct ContentView: View {
    @ObservedObject var viewModel: SessionViewModel

    var body: some View {
        let state = viewModel.uiState

        ZStack {
            Color.appBackground.ignoresSafeArea()

            switch state.screen {
            case .splash:
                SplashView(state: state)
            case .login:
                AdaptiveShell(branding: state.branding) {
                    LoginView(viewModel: viewModel, state: state)
                }
            case .workspace:
                AdaptiveShell(branding: state.branding) {
                    WorkspaceView(viewModel: viewModel, state: state)
                }
            case .deleteAccount:
                AdaptiveShell(branding: state.branding) {
                    DeleteAccountView(viewModel: viewModel, state: state)
                }
            }
        }
        .tint(Color(hex: state.branding.primaryColorHex))
    }
}

private struct SplashView: View {
    let state: SessionUIState

    var body: some View {
        VStack(spacing: 10) {
            Text(state.branding.appName.isEmpty ? AppConfig.appName : state.branding.appName)
                .font(.system(size: 32, weight: .bold, design: .rounded))
                .foregroundStyle(.white)
            Text(state.infoMessage.isEmpty ? "Preparing mobile workspace..." : state.infoMessage)
                .font(.subheadline)
                .foregroundStyle(Color.white.opacity(0.78))
        }
        .padding(24)
    }
}

private struct AdaptiveShell<Content: View>: View {
    let branding: Branding
    let content: Content

    init(branding: Branding, @ViewBuilder content: () -> Content) {
        self.branding = branding
        self.content = content()
    }

    var body: some View {
        GeometryReader { proxy in
            let wideLayout = proxy.size.width >= 900
            ScrollView {
                if wideLayout {
                    HStack(alignment: .top, spacing: 16) {
                        BrandPanel(branding: branding)
                            .frame(maxWidth: .infinity)
                        content
                            .frame(maxWidth: .infinity)
                    }
                    .padding(16)
                } else {
                    VStack(alignment: .leading, spacing: 16) {
                        BrandPanel(branding: branding)
                        content
                    }
                    .padding(16)
                }
            }
        }
    }
}

private struct BrandPanel: View {
    let branding: Branding

    var body: some View {
        CardShell {
            VStack(alignment: .leading, spacing: 16) {
                Text(branding.appName.isEmpty ? AppConfig.appName : branding.appName)
                    .font(.system(size: 28, weight: .bold, design: .rounded))
                    .foregroundStyle(.white)
                Text(
                    branding.companyName.isEmpty
                    ? "Universal mobile shell for employee, head-admin, and super-admin workspace flows."
                    : branding.companyName
                )
                .font(.body)
                .foregroundStyle(Color.white.opacity(0.82))
                Text(
                    branding.subtitle.isEmpty
                    ? "Company-aware login, session restore, runtime branding, and public account deletion are already wired to the existing backend."
                    : branding.subtitle
                )
                .font(.subheadline)
                .foregroundStyle(Color.white.opacity(0.72))

                InfoCard(
                    title: "Beta 1 focus",
                    message: "Login, attendance, inventory stock, team directory, settings, and head-admin shell foundations."
                )
                InfoCard(
                    title: "Tablet behavior",
                    message: "The shell automatically turns into a two-pane layout on wider iPad widths so forms and dashboards remain readable."
                )
            }
        }
    }
}

private struct LoginView: View {
    @ObservedObject var viewModel: SessionViewModel
    let state: SessionUIState

    var body: some View {
        CardShell {
            VStack(alignment: .leading, spacing: 14) {
                Text("Sign in")
                    .font(.system(size: 28, weight: .bold, design: .rounded))
                    .foregroundStyle(.white)

                StatusSection(state: state)

                LabeledField(title: "Company ID") {
                    TextField("Company ID", text: Binding(
                        get: { state.companyCode },
                        set: viewModel.updateCompanyCode
                    ))
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                }

                LabeledField(title: "Username or email") {
                    TextField("Username or email", text: Binding(
                        get: { state.username },
                        set: viewModel.updateUsername
                    ))
                    .textInputAutocapitalization(.never)
                    .keyboardType(.emailAddress)
                    .autocorrectionDisabled()
                }

                LabeledField(title: "Password") {
                    SecureField("Password", text: Binding(
                        get: { state.password },
                        set: viewModel.updatePassword
                    ))
                }

                Button {
                    Task { await viewModel.submitLogin() }
                } label: {
                    Text(state.isBusy ? "Please wait..." : "Continue")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(PrimaryFillButtonStyle())
                .disabled(state.isBusy)

                HStack(spacing: 10) {
                    Button("Google") {
                        viewModel.announceNativeGoogleFlow()
                    }
                    .buttonStyle(SecondaryOutlineButtonStyle())
                    .disabled(state.isBusy)

                    Button("Apple") {
                        viewModel.announceNativeAppleFlow()
                    }
                    .buttonStyle(SecondaryOutlineButtonStyle())
                    .disabled(state.isBusy)
                }

                Button("Delete account") {
                    viewModel.openDeleteAccount()
                }
                .buttonStyle(.plain)
                .foregroundStyle(Color(hex: state.branding.primaryColorHex))
                .disabled(state.isBusy)

                InfoCard(
                    title: "Native auth handoff",
                    message: "Attach Firebase Google and Apple provider token acquisition in the iOS target, then send the ID token through /api/login/firebase."
                )
            }
        }
    }
}

private struct WorkspaceView: View {
    @ObservedObject var viewModel: SessionViewModel
    let state: SessionUIState

    var body: some View {
        let displayName = (state.user?.name ?? "").ifEmpty("Signed-in user")
        let displayRole = (state.user?.role ?? "").ifEmpty("employee")
        let branchName = state.user?.branchName ?? ""
        let modules = state.bootstrap?.moduleNames ?? []

        CardShell {
            VStack(alignment: .leading, spacing: 14) {
                Text(state.bootstrap?.company?.name ?? state.branding.companyName.ifEmpty(AppConfig.appName))
                    .font(.system(size: 28, weight: .bold, design: .rounded))
                    .foregroundStyle(.white)

                StatusSection(state: state)

                InfoCard(
                    title: displayName,
                    message: """
                    Role: \(displayRole)
                    \(!branchName.isEmpty ? "Branch: \(branchName)\n" : "")\(state.lastUpdatedAtLabel.isEmpty ? "" : "Synced: \(state.lastUpdatedAtLabel)")
                    """
                )

                InfoCard(
                    title: "Company routing",
                    message: "Company code \(state.companyCode.ifEmpty("not set")) stays pinned for branding, session recovery, and public flows like account deletion."
                )

                InfoCard(
                    title: "Beta wave modules",
                    message: !modules.isEmpty
                        ? modules.prefix(8).map { "- \($0)" }.joined(separator: "\n")
                        : "Use this shell to attach employee workspace, attendance, inventory stock, team directory, settings, and head-admin screens."
                )

                HStack(spacing: 10) {
                    Button("Account deletion") {
                        viewModel.openDeleteAccount()
                    }
                    .buttonStyle(PrimaryFillButtonStyle())
                    .disabled(state.isBusy)

                    Button("Reload bootstrap") {
                        Task { await viewModel.restoreSession() }
                    }
                    .buttonStyle(SecondaryOutlineButtonStyle())
                    .disabled(state.isBusy)
                }

                Button("Logout") {
                    Task { await viewModel.logout() }
                }
                .buttonStyle(SecondaryOutlineButtonStyle())
                .disabled(state.isBusy)
            }
        }
    }
}

private struct DeleteAccountView: View {
    @ObservedObject var viewModel: SessionViewModel
    let state: SessionUIState

    var body: some View {
        CardShell {
            VStack(alignment: .leading, spacing: 14) {
                Text("Delete account")
                    .font(.system(size: 28, weight: .bold, design: .rounded))
                    .foregroundStyle(.white)

                StatusSection(state: state)

                InfoCard(
                    title: "Store compliance",
                    message: "This screen uses the same deletion endpoints as the public deletion page, so App Store reviewers and real users have the same supported path."
                )

                LabeledField(title: "Company ID") {
                    TextField("Company ID", text: Binding(
                        get: { state.companyCode },
                        set: viewModel.updateCompanyCode
                    ))
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                }

                LabeledField(title: "Verified email") {
                    TextField("Verified email", text: Binding(
                        get: { state.deletionEmail },
                        set: viewModel.updateDeletionEmail
                    ))
                    .textInputAutocapitalization(.never)
                    .keyboardType(.emailAddress)
                    .autocorrectionDisabled()
                }

                LabeledField(title: "Verification code") {
                    TextField("Verification code", text: Binding(
                        get: { state.deletionCode },
                        set: viewModel.updateDeletionCode
                    ))
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                }

                HStack(spacing: 10) {
                    Button("Send code") {
                        Task { await viewModel.requestDeletionCode() }
                    }
                    .buttonStyle(SecondaryOutlineButtonStyle())
                    .disabled(state.isBusy)

                    Button("Confirm delete") {
                        Task { await viewModel.confirmDeletion() }
                    }
                    .buttonStyle(PrimaryFillButtonStyle())
                    .disabled(state.isBusy)
                }

                Button("Back") {
                    viewModel.closeDeleteAccount()
                }
                .buttonStyle(.plain)
                .foregroundStyle(Color(hex: state.branding.primaryColorHex))
                .disabled(state.isBusy)
            }
        }
    }
}

private struct StatusSection: View {
    let state: SessionUIState

    var body: some View {
        VStack(spacing: 12) {
            if !state.errorMessage.isEmpty {
                InfoCard(
                    title: "Needs attention",
                    message: state.errorMessage,
                    background: Color.red.opacity(0.22)
                )
            }
            if !state.infoMessage.isEmpty {
                InfoCard(
                    title: "Status",
                    message: state.infoMessage,
                    background: Color(hex: state.branding.primaryColorHex).opacity(0.24)
                )
            }
        }
    }
}

private struct LabeledField<Content: View>: View {
    let title: String
    let content: Content

    init(title: String, @ViewBuilder content: () -> Content) {
        self.title = title
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title.uppercased())
                .font(.caption.weight(.semibold))
                .foregroundStyle(Color.white.opacity(0.68))
            content
                .padding(.horizontal, 14)
                .frame(height: 52)
                .background(Color.white.opacity(0.08))
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                .foregroundStyle(.white)
        }
    }
}

private struct CardShell<Content: View>: View {
    let content: Content

    init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            content
        }
        .padding(22)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .fill(Color.cardBackground)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .stroke(Color.white.opacity(0.08), lineWidth: 1)
        )
    }
}

private struct InfoCard: View {
    let title: String
    let message: String
    var background: Color = Color.white.opacity(0.08)

    var contentBody: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.headline)
                .foregroundStyle(.white)
            Text(message)
                .font(.subheadline)
                .foregroundStyle(Color.white.opacity(0.82))
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .fill(background)
        )
    }

    var body: some View {
        contentBody
    }
}

private struct PrimaryFillButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .padding(.vertical, 14)
            .padding(.horizontal, 18)
            .foregroundStyle(.white)
            .background(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(Color.accentButton.opacity(configuration.isPressed ? 0.84 : 1))
            )
            .scaleEffect(configuration.isPressed ? 0.99 : 1)
    }
}

private struct SecondaryOutlineButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .padding(.horizontal, 18)
            .foregroundStyle(.white)
            .background(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(Color.white.opacity(configuration.isPressed ? 0.12 : 0.06))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(Color.white.opacity(0.12), lineWidth: 1)
            )
    }
}

private extension String {
    func ifEmpty(_ fallback: String) -> String {
        isEmpty ? fallback : self
    }
}

private extension Color {
    static let appBackground = Color(red: 0.03, green: 0.07, blue: 0.12)
    static let cardBackground = Color(red: 0.05, green: 0.11, blue: 0.18)
    static let accentButton = Color(red: 0.05, green: 0.65, blue: 0.64)

    init(hex: String) {
        let raw = hex.trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(of: "#", with: "")
        let normalized: String
        switch raw.count {
        case 6:
            normalized = "FF" + raw
        case 8:
            normalized = raw
        default:
            normalized = "FF0EA5A4"
        }

        let value = UInt64(normalized, radix: 16) ?? 0xFF0EA5A4
        let alpha = Double((value >> 24) & 0xFF) / 255
        let red = Double((value >> 16) & 0xFF) / 255
        let green = Double((value >> 8) & 0xFF) / 255
        let blue = Double(value & 0xFF) / 255
        self.init(.sRGB, red: red, green: green, blue: blue, opacity: alpha)
    }
}
