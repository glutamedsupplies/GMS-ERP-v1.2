package com.gmserp.mobile

data class Branding(
    val appName: String = "GMS ERP",
    val companyName: String = "",
    val companyCode: String = "",
    val primaryColorHex: String = "#0EA5A4",
    val subtitle: String = "",
    val whiteLabel: Boolean = false
)

data class SessionUser(
    val id: String = "",
    val name: String = "",
    val role: String = "",
    val companyId: String = "",
    val companyCode: String = "",
    val branchId: String = "",
    val branchName: String = ""
)

data class CompanySummary(
    val id: String = "",
    val name: String = "",
    val companyCode: String = "",
    val primaryColorHex: String = "#0EA5A4",
    val appName: String = ""
)

data class BootstrapPayload(
    val user: SessionUser? = null,
    val role: String = "",
    val superAdmin: Boolean = false,
    val branding: Branding = Branding(),
    val company: CompanySummary? = null,
    val moduleNames: List<String> = emptyList()
)

data class DeletionRequestResult(
    val email: String = "",
    val companyCode: String = ""
)

data class DeletionConfirmResult(
    val deleted: Boolean = false,
    val companyCode: String = "",
    val loginUrl: String = ""
)

enum class MobileScreen {
    SPLASH,
    LOGIN,
    WORKSPACE,
    DELETE_ACCOUNT
}

data class SessionUiState(
    val screen: MobileScreen = MobileScreen.SPLASH,
    val branding: Branding = Branding(),
    val user: SessionUser? = null,
    val bootstrap: BootstrapPayload? = null,
    val companyCode: String = "",
    val username: String = "",
    val password: String = "",
    val deletionEmail: String = "",
    val deletionCode: String = "",
    val isBusy: Boolean = false,
    val errorMessage: String = "",
    val infoMessage: String = "",
    val lastUpdatedAtLabel: String = ""
)
