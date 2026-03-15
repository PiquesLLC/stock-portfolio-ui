# iOS App Store Readiness

This repo now includes the minimum iOS project artifacts needed for Xcode Cloud and App Store submission review:

- shared Xcode scheme at `ios/App/App.xcodeproj/xcshareddata/xcschemes/App.xcscheme`
- app entitlements at `ios/App/App/App.entitlements`
- app privacy manifest at `ios/App/App/PrivacyInfo.xcprivacy`
- current Capacitor iOS plugin sync via `npm run cap:sync`

## Repo-side checks completed

- Sign in with Apple entitlement is present
- push background mode is declared in `Info.plist`
- non-exempt encryption flag is declared in `Info.plist`
- native Capacitor plugins are synced into `ios/App/CapApp-SPM/Package.swift`

## Still requires a Mac / Xcode / Apple portal

- set the Apple Development Team in the Xcode project
- confirm the `App` scheme is shared and selected in Xcode Cloud
- enable target capabilities in Xcode:
  - Sign in with Apple
  - Push Notifications
  - In-App Purchase
- verify provisioning profiles / signing certificates
- archive the app and resolve any Xcode validation warnings
- verify App Store Connect metadata:
  - screenshots
  - privacy nutrition labels
  - subscription products and review notes
  - test account / demo instructions if needed

## Recommended Xcode verification pass

1. Open `ios/App/App.xcodeproj` in Xcode.
2. Select the `App` target.
3. Confirm bundle ID is correct: `com.nala.portfolio`.
4. Set `Version` and `Build` to release values.
5. In Signing & Capabilities, enable:
   - Sign in with Apple
   - Push Notifications
   - In-App Purchase
6. Run a release archive.
7. Fix any validation issues before enabling Xcode Cloud release workflows.
