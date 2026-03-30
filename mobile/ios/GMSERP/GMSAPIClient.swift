import Foundation

enum APIClientError: LocalizedError {
    case invalidResponse
    case requestFailed(String)

    var errorDescription: String? {
        switch self {
        case .invalidResponse:
            return "Invalid response from server."
        case let .requestFailed(message):
            return message
        }
    }
}

final class GMSAPIClient {
    private let sessionStore: SessionStore
    private let session: URLSession
    private let baseURL: URL

    init(
        sessionStore: SessionStore,
        baseURL: URL = AppConfig.apiBaseURL,
        session: URLSession = .shared
    ) {
        self.sessionStore = sessionStore
        self.baseURL = baseURL
        self.session = session
    }

    func getPublicBranding(companyCode: String) async throws -> Branding {
        let encodedCode = companyCode.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
        let payload = try await request(
            path: "/api/public-branding?companyCode=\(encodedCode)",
            method: "GET",
            includeCookies: false
        )
        return parseBranding(payload)
    }

    func restoreSession() async throws -> SessionUser? {
        let payload = try await request(path: "/api/session", method: "GET")
        guard let payload else {
            sessionStore.clearSession()
            return nil
        }

        return parseUser(payload)
    }

    func login(companyCode: String, username: String, password: String) async throws -> SessionUser {
        let payload = try await request(
            path: "/api/login",
            method: "POST",
            body: [
                "companyCode": companyCode.trimmingCharacters(in: .whitespacesAndNewlines),
                "username": username.trimmingCharacters(in: .whitespacesAndNewlines),
                "password": password
            ]
        ) ?? [:]

        return parseUser(payload)
    }

    func loginWithFirebaseToken(companyCode: String, idToken: String) async throws -> SessionUser {
        let payload = try await request(
            path: "/api/login/firebase",
            method: "POST",
            body: [
                "companyCode": companyCode.trimmingCharacters(in: .whitespacesAndNewlines),
                "idToken": idToken.trimmingCharacters(in: .whitespacesAndNewlines)
            ]
        ) ?? [:]

        return parseUser(payload)
    }

    func getBootstrap() async throws -> BootstrapPayload {
        let payload = try await request(path: "/api/bootstrap", method: "GET") ?? [:]
        let user = parseOptionalDictionary(payload["user"]).map(parseUser)
        let branding = parseOptionalDictionary(payload["branding"]).map(parseBranding) ?? Branding()
        let company = parseOptionalDictionary(payload["company"]).map(parseCompany)
        let modules = (payload["modules"] as? [[String: Any]])?.compactMap {
            ($0["name"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
        } ?? []

        return BootstrapPayload(
            user: user,
            role: payload["role"] as? String ?? "",
            superAdmin: payload["superAdmin"] as? Bool ?? false,
            branding: branding,
            company: company,
            moduleNames: modules
        )
    }

    func requestAccountDeletion(companyCode: String, email: String) async throws -> DeletionRequestResult {
        let payload = try await request(
            path: "/api/account/delete/request",
            method: "POST",
            body: [
                "companyCode": companyCode.trimmingCharacters(in: .whitespacesAndNewlines),
                "email": email.trimmingCharacters(in: .whitespacesAndNewlines)
            ]
        ) ?? [:]

        return DeletionRequestResult(
            email: payload["email"] as? String ?? "",
            companyCode: payload["companyCode"] as? String ?? ""
        )
    }

    func confirmAccountDeletion(companyCode: String, email: String, code: String) async throws -> DeletionConfirmResult {
        let payload = try await request(
            path: "/api/account/delete/confirm",
            method: "POST",
            body: [
                "companyCode": companyCode.trimmingCharacters(in: .whitespacesAndNewlines),
                "email": email.trimmingCharacters(in: .whitespacesAndNewlines),
                "code": code.trimmingCharacters(in: .whitespacesAndNewlines)
            ]
        ) ?? [:]

        if payload["deleted"] as? Bool == true {
            sessionStore.clearSession()
        }

        return DeletionConfirmResult(
            deleted: payload["deleted"] as? Bool ?? false,
            companyCode: payload["companyCode"] as? String ?? "",
            loginURL: payload["loginUrl"] as? String ?? ""
        )
    }

    func logout() async {
        _ = try? await request(path: "/api/logout", method: "POST", body: [:])
        sessionStore.clearSession()
    }

    private func request(
        path: String,
        method: String,
        body: [String: Any]? = nil,
        includeCookies: Bool = true
    ) async throws -> [String: Any]? {
        guard let url = URL(string: path, relativeTo: baseURL)?.absoluteURL else {
            throw APIClientError.invalidResponse
        }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.timeoutInterval = 20
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        if includeCookies, !sessionStore.cookieHeader.isEmpty {
            request.setValue(sessionStore.cookieHeader, forHTTPHeaderField: "Cookie")
        }

        if let body {
            request.httpBody = try JSONSerialization.data(withJSONObject: body, options: [])
        }

        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw APIClientError.invalidResponse
        }

        let headerFields = Dictionary(
            uniqueKeysWithValues: http.allHeaderFields.map { key, value in
                (String(describing: key), String(describing: value))
            }
        )
        let cookies = HTTPCookie.cookies(withResponseHeaderFields: headerFields, for: url)
        if !cookies.isEmpty {
            sessionStore.cookieHeader = cookies
                .map { "\($0.name)=\($0.value)" }
                .joined(separator: "; ")
        } else {
            sessionStore.mergeSetCookieHeader(http.value(forHTTPHeaderField: "Set-Cookie"))
        }

        guard let root = try JSONSerialization.jsonObject(with: data, options: []) as? [String: Any] else {
            throw APIClientError.invalidResponse
        }

        if (root["success"] as? Bool) != true {
            let message = root["error"] as? String ?? "Request failed."
            throw APIClientError.requestFailed(message)
        }

        if let payload = root["data"] as? [String: Any] {
            return payload
        }

        if root["data"] is NSNull {
            return nil
        }

        if let payloadArray = root["data"] as? [[String: Any]] {
            return ["items": payloadArray]
        }

        if let payloadBool = root["data"] as? Bool {
            return ["value": payloadBool]
        }

        if let payloadString = root["data"] as? String {
            return ["value": payloadString]
        }

        if http.statusCode >= 400 {
            throw APIClientError.invalidResponse
        }

        return [:]
    }

    private func parseBranding(_ dictionary: [String: Any]) -> Branding {
        Branding(
            appName: dictionary["appName"] as? String ?? AppConfig.appName,
            companyName: dictionary["companyName"] as? String ?? "",
            companyCode: dictionary["companyCode"] as? String ?? "",
            primaryColorHex: dictionary["primaryColor"] as? String ?? "#0EA5A4",
            subtitle: dictionary["subtitle"] as? String ?? "",
            whiteLabel: dictionary["whiteLabel"] as? Bool ?? false
        )
    }

    private func parseUser(_ dictionary: [String: Any]) -> SessionUser {
        SessionUser(
            id: dictionary["id"] as? String ?? "",
            name: dictionary["name"] as? String ?? "",
            role: dictionary["role"] as? String ?? "",
            companyId: dictionary["company_id"] as? String ?? "",
            companyCode: dictionary["company_code"] as? String ?? "",
            branchId: dictionary["branch_id"] as? String ?? "",
            branchName: dictionary["branch_name"] as? String ?? ""
        )
    }

    private func parseCompany(_ dictionary: [String: Any]) -> CompanySummary {
        CompanySummary(
            id: dictionary["id"] as? String ?? "",
            name: dictionary["name"] as? String ?? "",
            companyCode: dictionary["company_code"] as? String ?? "",
            primaryColorHex: dictionary["primary_color"] as? String ?? "#0EA5A4",
            appName: dictionary["app_name"] as? String ?? ""
        )
    }

    private func parseOptionalDictionary(_ value: Any?) -> [String: Any]? {
        value as? [String: Any]
    }
}
