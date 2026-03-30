package com.gmserp.mobile

import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class GmsApiClient(
    private val sessionStore: SessionStore,
    private val baseUrl: String = BuildConfig.API_BASE_URL
) {
    suspend fun getPublicBranding(companyCode: String): Branding = withContext(Dispatchers.IO) {
        val payload = request(
            path = "/api/public-branding?companyCode=${encode(companyCode.trim())}",
            method = "GET",
            includeCookies = false
        )
        parseBranding(payload)
    }

    suspend fun restoreSession(): SessionUser? = withContext(Dispatchers.IO) {
        val payload = request(path = "/api/session", method = "GET")
        if (payload == null || payload == JSONObject.NULL) {
            sessionStore.clearSession()
            return@withContext null
        }
        parseUser(payload as JSONObject)
    }

    suspend fun login(companyCode: String, username: String, password: String): SessionUser =
        withContext(Dispatchers.IO) {
            val payload = request(
                path = "/api/login",
                method = "POST",
                body = JSONObject()
                    .put("companyCode", companyCode.trim())
                    .put("username", username.trim())
                    .put("password", password)
            ) as JSONObject

            parseUser(payload)
        }

    suspend fun loginWithFirebaseToken(companyCode: String, idToken: String): SessionUser =
        withContext(Dispatchers.IO) {
            val payload = request(
                path = "/api/login/firebase",
                method = "POST",
                body = JSONObject()
                    .put("companyCode", companyCode.trim())
                    .put("idToken", idToken.trim())
            ) as JSONObject

            parseUser(payload)
        }

    suspend fun getBootstrap(): BootstrapPayload = withContext(Dispatchers.IO) {
        val payload = request(path = "/api/bootstrap", method = "GET") as JSONObject
        val user = payload.optJSONObject("user")?.let(::parseUser)
        val branding = payload.optJSONObject("branding")?.let(::parseBranding) ?: Branding()
        val company = payload.optJSONObject("company")?.let(::parseCompany)
        val modules = payload.optJSONArray("modules").toStringList()
            .mapNotNull { entry ->
                if (entry is JSONObject) {
                    entry.optString("name").trim().ifEmpty { null }
                } else {
                    null
                }
            }

        BootstrapPayload(
            user = user,
            role = payload.optString("role"),
            superAdmin = payload.optBoolean("superAdmin"),
            branding = branding,
            company = company,
            moduleNames = modules
        )
    }

    suspend fun requestAccountDeletion(companyCode: String, email: String): DeletionRequestResult =
        withContext(Dispatchers.IO) {
            val payload = request(
                path = "/api/account/delete/request",
                method = "POST",
                body = JSONObject()
                    .put("companyCode", companyCode.trim())
                    .put("email", email.trim())
            ) as JSONObject

            DeletionRequestResult(
                email = payload.optString("email"),
                companyCode = payload.optString("companyCode")
            )
        }

    suspend fun confirmAccountDeletion(companyCode: String, email: String, code: String): DeletionConfirmResult =
        withContext(Dispatchers.IO) {
            val payload = request(
                path = "/api/account/delete/confirm",
                method = "POST",
                body = JSONObject()
                    .put("companyCode", companyCode.trim())
                    .put("email", email.trim())
                    .put("code", code.trim())
            ) as JSONObject

            if (payload.optBoolean("deleted")) {
                sessionStore.clearSession()
            }

            DeletionConfirmResult(
                deleted = payload.optBoolean("deleted"),
                companyCode = payload.optString("companyCode"),
                loginUrl = payload.optString("loginUrl")
            )
        }

    suspend fun logout() = withContext(Dispatchers.IO) {
        try {
            request(path = "/api/logout", method = "POST", body = JSONObject())
        } finally {
            sessionStore.clearSession()
        }
    }

    private fun parseBranding(json: JSONObject): Branding {
        return Branding(
            appName = json.optString("appName").ifBlank { "GMS ERP" },
            companyName = json.optString("companyName"),
            companyCode = json.optString("companyCode"),
            primaryColorHex = json.optString("primaryColor").ifBlank { "#0EA5A4" },
            subtitle = json.optString("subtitle"),
            whiteLabel = json.optBoolean("whiteLabel")
        )
    }

    private fun parseUser(json: JSONObject): SessionUser {
        return SessionUser(
            id = json.optString("id"),
            name = json.optString("name"),
            role = json.optString("role"),
            companyId = json.optString("company_id"),
            companyCode = json.optString("company_code"),
            branchId = json.optString("branch_id"),
            branchName = json.optString("branch_name")
        )
    }

    private fun parseCompany(json: JSONObject): CompanySummary {
        return CompanySummary(
            id = json.optString("id"),
            name = json.optString("name"),
            companyCode = json.optString("company_code"),
            primaryColorHex = json.optString("primary_color").ifBlank { "#0EA5A4" },
            appName = json.optString("app_name")
        )
    }

    private fun request(
        path: String,
        method: String,
        body: JSONObject? = null,
        includeCookies: Boolean = true
    ): Any? {
        val url = URL("${baseUrl.trimEnd('/')}$path")
        val connection = (url.openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = 15000
            readTimeout = 20000
            setRequestProperty("Accept", "application/json")
            setRequestProperty("Content-Type", "application/json")
            if (includeCookies) {
                val cookieHeader = sessionStore.getCookieHeader()
                if (cookieHeader.isNotBlank()) {
                    setRequestProperty("Cookie", cookieHeader)
                }
            }
            doInput = true
            if (method == "POST" || method == "PUT" || method == "PATCH") {
                doOutput = true
            }
        }

        try {
            if (body != null && connection.doOutput) {
                OutputStreamWriter(connection.outputStream, Charsets.UTF_8).use { writer ->
                    writer.write(body.toString())
                }
            }

            sessionStore.mergeSetCookieHeaders(connection.headerFields["Set-Cookie"] ?: emptyList())
            val responseCode = connection.responseCode
            val rawText = readResponseText(connection, responseCode in 200..299)
            val envelope = if (rawText.isBlank()) JSONObject() else JSONObject(rawText)
            if (!envelope.optBoolean("success")) {
                throw IllegalStateException(envelope.optString("error").ifBlank { "Request failed." })
            }
            return envelope.opt("data")
        } finally {
            connection.disconnect()
        }
    }

    private fun readResponseText(connection: HttpURLConnection, isSuccess: Boolean): String {
        val stream = if (isSuccess) connection.inputStream else connection.errorStream
        if (stream == null) {
            return ""
        }

        return stream.bufferedReader().use(BufferedReader::readText)
    }

    private fun encode(value: String): String {
        return java.net.URLEncoder.encode(value, Charsets.UTF_8.name())
    }
}

private fun JSONArray?.toStringList(): List<Any?> {
    if (this == null) {
        return emptyList()
    }
    return List(length()) { index -> opt(index) }
}
