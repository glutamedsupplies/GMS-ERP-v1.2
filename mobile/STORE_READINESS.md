# GMS ERP Store Readiness

This checklist turns the current mobile foundation into a store-submittable build.

## Backend and public URLs

- Confirm production API base URL stays `https://gmserp.com`.
- Publish privacy policy URL for both stores.

## Native app setup

- Android:
  - Generate Gradle wrapper.
  - Open `mobile/android/` in Android Studio.
  - Add Firebase Android config and native Google sign-in token flow.
  - Verify phone and tablet layouts.
- iOS:
  - Create Xcode project and add `mobile/ios/GMSERP/` sources to the target.
  - Add Firebase iOS config plus Sign in with Apple and Google provider flows.
  - Verify iPhone and iPad layouts.

## Beta 1 acceptance

- Company-aware login works with `/api/login`.
- Federated login exchanges Firebase token through `/api/login/firebase`.
- Session restore works with `/api/session`.
- Bootstrap and runtime branding load from `/api/bootstrap` and `/api/public-branding`.
- Employee shell covers time in/out, time card, inventory stock, team directory, and settings.
- Head-admin shell covers people, attendance, settings, profile, and bulletin.

## Test matrix

- iPhone Safari
- iPad Safari
- Android phone Chrome
- Android tablet Chrome
- Native Android phone
- Native Android tablet
- Native iPhone
- Native iPad

## App review package

- Reviewer notes describing company ID login flow.
- Demo tenant credentials for employee and head admin.
- Screenshots for phone and tablet.
- Data safety / privacy answers for Play Console.
- App Privacy answers for App Store Connect.
