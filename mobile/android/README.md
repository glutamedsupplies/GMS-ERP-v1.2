# Android Foundation

This is the first native Android scaffold for `com.gmserp.mobile`.

Current scope:

- Kotlin + Jetpack Compose app shell
- Cookie-backed API client using the existing GMS HTTPS backend
- Login, session restore, logout, branding preview, and account deletion
- Role-aware workspace placeholder for employee, head admin, and super admin flows

Next steps:

1. Generate the Gradle wrapper from a machine with Android tooling installed.
2. Add beta-wave screens module by module on top of `SessionViewModel`.
3. Replace the placeholder workspace screen with native employee and admin feature navigation.
