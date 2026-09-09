# PsyRec iPhone handoff for Xcode

Use branch **QVAC-Psy** of [Luis-Alain/hackpty](https://github.com/Luis-Alain/hackpty/tree/QVAC-Psy). The iPhone port shares the Android app's TypeScript screens and talks to the existing Windows PC receiver. Models and clinician review run on that PC.

## Prepare on your Mac

Install Xcode, complete its first-launch setup, and select its command-line tools. Use Node 22.17 or newer compatible with Expo SDK 55. From the checkout:

```sh
cd apps/mobile
bash scripts/prepare-xcode.sh
open ios/PsyRecCapture.xcworkspace
```

The script installs the locked JavaScript dependencies, checks TypeScript and Expo configuration, runs the four native Swift policy/storage tests, generates the iOS app and installs CocoaPods dependencies. It does not alter the Android project. The generated ios/ project is ignored; the reproducible Swift source is in modules/psyrec-transfer/ios/.

## Sign and install with Xcode

1. Select the **PsyRecCapture** app target. Under **Signing & Capabilities**, enable automatic signing and select your Apple team.
2. Connect the iPhone, trust the Mac, and enable Developer Mode on the phone if iOS requests it. Select the physical iPhone as Xcode's run destination.
3. In **Product → Scheme → Edit Scheme → Run**, set **Build Configuration** to **Release** for a self-contained build with its JavaScript bundled.
4. Build and Run. Approve the phone's developer-trust prompts if required.

The default bundle identifier is **tech.adwen.psyrec.capture**. If Apple says that identifier is unavailable to your team, use an available identifier on the generated app target for local signing. No Apple team ID, private certificate, profile or password is committed.

A local personal signing team can be used where Xcode permits it; Apple applies its own device and expiry limits. Distributing one installer to remote teammates requires suitable distribution credentials and provisioning. An EAS simulator archive is not installable on a physical iPhone.

## Synthetic phone test

- Put the iPhone and Windows PC on the same private Wi-Fi. Allow camera and local-network permissions.
- Unlock the PC vault, select a synthetic patient's encounter, start the receiver and scan the pairing QR physically displayed on that PC.
- Photograph a printed synthetic English note, then **Send / retry safely**. Confirm the encounter and receipt on the PC.
- Interrupt a send, restart the phone app and retry. Expect a single PC capture and retained encrypted queue data until a matching durable receipt.
- Continue through PC extraction, source correction, draft review, exact approval, encrypted reload and selected-patient approved history.

Photos are captured into memory and queued as device-key encrypted ciphertext. There is no gallery write. iOS task-switcher and recording privacy covers are implemented, but iOS does not offer Android FLAG_SECURE-equivalent prevention of every screenshot. Actual Keychain, camera, TLS and the physical workflow still require device testing.

## Optional EAS internal distribution

Expo project: [@hackpty/psyrec-capture](https://expo.dev/accounts/hackpty/projects/psyrec-capture). The ios-internal profile produces a self-contained Release build using your Apple distribution credentials. Register every intended iPhone before generating its ad hoc provisioning profile. The account had no linked Apple team or signing credential set when checked on September 9, 2026.

Use the mobile-only staging helper before an EAS upload, so no desktop vaults, models or unrelated source enter the build archive:

```sh
# From apps/mobile, after npm ci:
build_dir="$(mktemp -d)/psyrec-ios"
node scripts/stage-ios-build.cjs "$build_dir"
cd "$build_dir"
export EAS_NO_VCS=1
export EAS_PROJECT_ROOT="$build_dir"
npx eas-cli@23.2.0 credentials --platform ios
npx eas-cli@23.2.0 device:create
npx eas-cli@23.2.0 build --platform ios --profile ios-internal
```

Use ios-simulator only for simulator validation without signing. Neither profile automatically submits to App Store Connect. A future TestFlight submission also needs the Apple export-encryption declaration reviewed by the account owner.

## Build evidence

The [native validation build](https://expo.dev/accounts/hackpty/projects/psyrec-capture/builds/f5aa3439-547f-4d03-a3fd-d1c15dce33d8) ran on an Apple worker. Its post-install hook passed all four Swift XCTest cases and bundled the TypeScript app. See [the recorded build result](ios-build-validation.json) for final compilation status and source hashes.

References: [Expo local iOS development](https://docs.expo.dev/guides/local-app-development/), [Expo internal distribution](https://docs.expo.dev/build/internal-distribution/), [Expo simulator builds](https://docs.expo.dev/build-reference/simulators/).
