# GMS ERP Native Mobile Foundation

This folder starts the native mobile rollout promised in the launch plan.

What is included now:

- `android/`: Kotlin + Jetpack Compose project scaffold pointed at `https://gmserp.com`
- `ios/`: SwiftUI source foundation pointed at `https://gmserp.com`
- Shared behavior implemented in both foundations:
  - Company-aware login
  - Session restore shell
  - Public branding fetch
  - Self-service account deletion flow using the existing backend routes
  - Role-aware workspace placeholder routing for the next beta waves

Important notes:

- The Android side includes Gradle build scripts and source structure, but the Gradle wrapper is not generated in this repo yet.
- The iOS side includes SwiftUI source files ready to be added to an Xcode app target. An `.xcodeproj` is not generated from this Windows workspace.
- Beta 2 and Beta 3 operational modules still need to be ported into these native shells.
