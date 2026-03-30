import Foundation

final class SessionStore {
    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    var companyCode: String {
        get { defaults.string(forKey: Keys.companyCode)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? "" }
        set { defaults.set(newValue.trimmingCharacters(in: .whitespacesAndNewlines), forKey: Keys.companyCode) }
    }

    var username: String {
        get { defaults.string(forKey: Keys.username)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? "" }
        set { defaults.set(newValue.trimmingCharacters(in: .whitespacesAndNewlines), forKey: Keys.username) }
    }

    var cookieHeader: String {
        get { defaults.string(forKey: Keys.cookieHeader)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? "" }
        set { defaults.set(newValue.trimmingCharacters(in: .whitespacesAndNewlines), forKey: Keys.cookieHeader) }
    }

    var userSnapshot: SessionUser? {
        get {
            guard let data = defaults.data(forKey: Keys.userSnapshot) else {
                return nil
            }

            guard let snapshot = try? JSONDecoder().decode(SessionUserSnapshot.self, from: data) else {
                return nil
            }

            return snapshot.sessionUser
        }
        set {
            guard let newValue else {
                defaults.removeObject(forKey: Keys.userSnapshot)
                return
            }

            let payload = SessionUserSnapshot(
                id: newValue.id,
                name: newValue.name,
                role: newValue.role,
                companyId: newValue.companyId,
                companyCode: newValue.companyCode,
                branchId: newValue.branchId,
                branchName: newValue.branchName
            )

            if let data = try? JSONEncoder().encode(payload) {
                defaults.set(data, forKey: Keys.userSnapshot)
            }
        }
    }

    func clearCookieHeader() {
        defaults.removeObject(forKey: Keys.cookieHeader)
    }

    func clearSession() {
        defaults.removeObject(forKey: Keys.cookieHeader)
        defaults.removeObject(forKey: Keys.userSnapshot)
    }

    func mergeSetCookieHeader(_ rawValue: String?) {
        guard let rawValue, !rawValue.isEmpty else {
            return
        }

        var cookieMap: [String: String] = [:]
        cookieHeader
            .split(separator: ";")
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .forEach { entry in
                let parts = entry.split(separator: "=", maxSplits: 1).map(String.init)
                guard parts.count == 2 else { return }
                cookieMap[parts[0].trimmingCharacters(in: .whitespaces)] = parts[1].trimmingCharacters(in: .whitespaces)
            }

        rawValue
            .split(separator: ",")
            .map { String($0) }
            .forEach { entry in
                let firstPair = entry.split(separator: ";", maxSplits: 1).first ?? ""
                let parts = String(firstPair).split(separator: "=", maxSplits: 1).map(String.init)
                guard parts.count == 2 else { return }
                let name = parts[0].trimmingCharacters(in: .whitespaces)
                let value = parts[1].trimmingCharacters(in: .whitespaces)
                guard !name.isEmpty, !value.isEmpty else { return }
                cookieMap[name] = value
            }

        cookieHeader = cookieMap.map { "\($0.key)=\($0.value)" }.joined(separator: "; ")
    }
}

private extension SessionStore {
    enum Keys {
        static let companyCode = "gms.companyCode"
        static let username = "gms.username"
        static let cookieHeader = "gms.cookieHeader"
        static let userSnapshot = "gms.userSnapshot"
    }

    struct SessionUserSnapshot: Codable {
        var id: String
        var name: String
        var role: String
        var companyId: String
        var companyCode: String
        var branchId: String
        var branchName: String

        var sessionUser: SessionUser {
            SessionUser(
                id: id,
                name: name,
                role: role,
                companyId: companyId,
                companyCode: companyCode,
                branchId: branchId,
                branchName: branchName
            )
        }
    }
}
