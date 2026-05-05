# GMS ERP Flutter Mobile Client

This Flutter app is a mobile-first client for the existing GMS ERP backend.

## Included now

- Company-aware login and public branding fetch
- Forgot-password flow with email code verification
- Session restore with persisted cookies and local user snapshot
- Responsive phone and tablet shell
- Employee flow:
  - dashboard overview
  - time in / time out
  - cutoff time card
  - inventory stock
  - team directory
  - settings summary
- Head-admin flow:
  - dashboard overview
  - people directory with create, edit, and delete account actions
  - branch management with create, edit, activate/deactivate, and delete actions
  - attendance snapshot
  - company bulletin with announcement and calendar item management
  - editable company settings

## UI notes

- Form rows and action buttons stack automatically on smaller phone widths
- Admin edits open in bottom sheets so they stay readable on phones
- The design stays dark, high-contrast, and touch-friendly for daily use

## Important note

The machine used for this patch does not currently have the Flutter SDK installed, so Android and iOS platform folders were not generated from CLI commands here.

## Finish local setup

1. Use the repo-local Flutter wrapper instead of relying on a global `flutter` install.
2. Open a terminal in the repo root.
3. Quick checks:

```powershell
mobile\flutter-local.cmd --version
mobile\flutter-local.cmd devices
```

4. Run the app on Android:

```powershell
powershell -ExecutionPolicy Bypass -File mobile\flutter_app\run-android.ps1
```

5. Build an APK:

```powershell
powershell -ExecutionPolicy Bypass -File mobile\flutter_app\build-apk.ps1
```

6. APK output:

```text
mobile/flutter_app/build/app/outputs/flutter-apk/app-debug.apk
```

7. Release APK:

```powershell
powershell -ExecutionPolicy Bypass -File mobile\flutter_app\build-apk.ps1 -Release
```

## Notes

- The helper script auto-detects `JAVA_HOME` and the Android SDK from Android Studio on Windows.
- If the `android/` wrapper does not exist yet, the build scripts generate it automatically with `--overwrite`.
- iOS folders can be scaffolded later, but a real iPhone installable build still requires `macOS + Xcode`.

## Backend target

The app points to `https://gmserp.com` by default. Change the base URL in `lib/src/services/gms_api_client.dart` if you want to target a staging or LAN server.
