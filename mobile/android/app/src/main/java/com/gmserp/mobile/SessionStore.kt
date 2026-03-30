package com.gmserp.mobile

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONObject

class SessionStore(context: Context) {
    private val prefs: SharedPreferences = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    fun saveCompanyCode(value: String) {
        prefs.edit().putString(KEY_COMPANY_CODE, value.trim()).apply()
    }

    fun getCompanyCode(): String = prefs.getString(KEY_COMPANY_CODE, "")?.trim().orEmpty()

    fun saveUsername(value: String) {
        prefs.edit().putString(KEY_USERNAME, value.trim()).apply()
    }

    fun getUsername(): String = prefs.getString(KEY_USERNAME, "")?.trim().orEmpty()

    fun saveCookieHeader(value: String) {
        prefs.edit().putString(KEY_COOKIE_HEADER, value.trim()).apply()
    }

    fun getCookieHeader(): String = prefs.getString(KEY_COOKIE_HEADER, "")?.trim().orEmpty()

    fun clearCookieHeader() {
        prefs.edit().remove(KEY_COOKIE_HEADER).apply()
    }

    fun saveUserSnapshot(user: SessionUser?) {
        if (user == null) {
            prefs.edit().remove(KEY_USER_SNAPSHOT).apply()
            return
        }

        val payload = JSONObject()
            .put("id", user.id)
            .put("name", user.name)
            .put("role", user.role)
            .put("companyId", user.companyId)
            .put("companyCode", user.companyCode)
            .put("branchId", user.branchId)
            .put("branchName", user.branchName)
            .toString()

        prefs.edit().putString(KEY_USER_SNAPSHOT, payload).apply()
    }

    fun getUserSnapshot(): SessionUser? {
        val raw = prefs.getString(KEY_USER_SNAPSHOT, null) ?: return null
        return try {
            val json = JSONObject(raw)
            SessionUser(
                id = json.optString("id"),
                name = json.optString("name"),
                role = json.optString("role"),
                companyId = json.optString("companyId"),
                companyCode = json.optString("companyCode"),
                branchId = json.optString("branchId"),
                branchName = json.optString("branchName")
            )
        } catch (_error: Exception) {
            null
        }
    }

    fun clearSession() {
        prefs.edit()
            .remove(KEY_COOKIE_HEADER)
            .remove(KEY_USER_SNAPSHOT)
            .apply()
    }

    fun mergeSetCookieHeaders(values: List<String>) {
        if (values.isEmpty()) {
            return
        }

        val cookieMap = LinkedHashMap<String, String>()
        getCookieHeader()
            .split(';')
            .map { it.trim() }
            .filter { it.contains('=') }
            .forEach { entry ->
                val parts = entry.split('=', limit = 2)
                cookieMap[parts[0].trim()] = parts.getOrElse(1) { "" }.trim()
            }

        values.forEach { header ->
            val pair = header.substringBefore(';').trim()
            if (!pair.contains('=')) {
                return@forEach
            }
            val parts = pair.split('=', limit = 2)
            val name = parts[0].trim()
            val value = parts.getOrElse(1) { "" }.trim()
            if (name.isNotEmpty() && value.isNotEmpty()) {
                cookieMap[name] = value
            }
        }

        saveCookieHeader(cookieMap.entries.joinToString("; ") { "${it.key}=${it.value}" })
    }

    companion object {
        private const val PREFS_NAME = "gms_erp_mobile"
        private const val KEY_COMPANY_CODE = "company_code"
        private const val KEY_USERNAME = "username"
        private const val KEY_COOKIE_HEADER = "cookie_header"
        private const val KEY_USER_SNAPSHOT = "user_snapshot"
    }
}
