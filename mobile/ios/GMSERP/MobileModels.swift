import Foundation

struct Branding: Equatable {
    var appName: String = AppConfig.appName
    var companyName: String = ""
    var companyCode: String = ""
    var primaryColorHex: String = "#0EA5A4"
    var subtitle: String = ""
    var whiteLabel: Bool = false
}

struct SessionUser: Equatable {
    var id: String = ""
    var name: String = ""
    var role: String = ""
    var companyId: String = ""
    var companyCode: String = ""
    var branchId: String = ""
    var branchName: String = ""
}

struct CompanySummary: Equatable {
    var id: String = ""
    var name: String = ""
    var companyCode: String = ""
    var primaryColorHex: String = "#0EA5A4"
    var appName: String = ""
}

struct BootstrapPayload: Equatable {
    var user: SessionUser? = nil
    var role: String = ""
    var superAdmin: Bool = false
    var branding: Branding = Branding()
    var company: CompanySummary? = nil
    var moduleNames: [String] = []
}

enum MobileScreen {
    case splash
    case login
    case workspace
}

struct SessionUIState: Equatable {
    var screen: MobileScreen = .splash
    var branding: Branding = Branding()
    var user: SessionUser? = nil
    var bootstrap: BootstrapPayload? = nil
    var companyCode: String = ""
    var username: String = ""
    var password: String = ""
    var isBusy: Bool = false
    var errorMessage: String = ""
    var infoMessage: String = ""
    var lastUpdatedAtLabel: String = ""
}
