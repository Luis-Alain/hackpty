# PsyRec native Android capture

This Expo SDK 55 / React Native 0.83 app captures a printed synthetic English note on Android and transfers it to the paired Windows PsyRec vault. Inference is on the PC. Expo Go cannot run the local Kotlin module. Android builds remain local. The iPhone port also has an optional EAS simulator validation build; inference remains on the paired PC.

The existing local app is linked to [@hackpty/psyrec-capture](https://expo.dev/accounts/hackpty/projects/psyrec-capture), project ID `b57b65cb-66a6-454f-8301-72259ee2a828`. Expo account membership was verified as Owner before linking. `app.json` records the account/project association; Android package identity and local build scripts are preserved. Linking the project did not run a cloud build, publish an update, or enable cloud inference. `eas project:info` verifies the association when signed in.

## Local build

Install Node 22.17+, JDK 17, Android SDK platform 36, build tools 36.0.0, NDK 27.1.12297006, CMake 3.22.1 and Android platform tools. Set `JAVA_HOME` and `ANDROID_HOME` to your local installations. From this directory:

```powershell
npm ci
npm run check
npm run prebuild
Set-Location android
./gradlew.bat app:assembleDebug -PreactNativeArchitectures=arm64-v8a
```

The debug APK is `android/app/build/outputs/apk/debug/app-debug.apk`. It requires the local Metro server (`npm start`, then `adb reverse tcp:8081 tcp:8081`) when launched. `npm run android` can build/install directly on a USB-debugging device. For a self-contained local test APK, use `./gradlew.bat app:assembleRelease -PreactNativeArchitectures=arm64-v8a`; the generated Expo development keystore is only a local test signing identity, not a publication credential. Supply a proper private signing setup for distribution later. The generated `android/` project and all APK/build/toolchain files stay out of Git. Native module and Expo config plugins remain the reproducible source.

SDK and Gradle dependency downloads are provisioning. After provisioning, the capture workflow uses private LAN TLS and local PC inference only. The current session installed its optional toolchain beneath the repository's ignored `.local/android-tools/`; that path is not a product dependency.

With `JAVA_HOME` and `ANDROID_HOME` set, `./scripts/build-android.ps1` performs dependency installation, TypeScript validation, Expo generation and a self-contained arm64 Release build, then prints the APK size and SHA-256. Use `-Variant Debug` for a Metro-dependent build.

## Phone-to-PC walkthrough

1. Connect phone and PC to the same private Wi-Fi. Unlock the PsyRec PC vault, select the intended patient and new encounter, and start the capture receiver using its private IPv4 address. Permit the Windows receiver through a private-network firewall prompt if required.
2. In the native Android app, allow camera permission, select **Scan PC pairing QR**, and scan only the QR physically displayed on your own PC. Invitations expire after two minutes and are single-use. Pairing binds the device token to that encounter.
3. Confirm the encounter on both screens. Open **Photograph printed note**, frame the printed synthetic English page in focus and press **Capture and encrypt**.
4. Press **Send / retry safely**. A completed status means the PC returned the same encounter, device, transfer, image hash and a durable capture receipt. Continue extraction/source review/approval on the PC.
5. If a send is interrupted, restart the app and retry the encrypted pending item. Do not clear app data: that destroys the Android Keystore key. Pairing is disabled while any capture is pending, preserving the original device credentials required for receipt deduplication.

## Privacy and failure boundaries

- CameraX captures JPEG into memory; orientation adjustment and AES-256-GCM encryption happen before any photo is written. The app does not write a gallery image or a plaintext camera cache. Ciphertext plus encrypted metadata is atomically persisted in Android's no-backup directory with an Android Keystore key.
- Pairing credentials use Expo SecureStore. Android backup and cleartext HTTP are disabled. The app requests no audio/storage permissions, disables screenshots with `FLAG_SECURE`, and removes camera preview when backgrounded.
- The physical QR supplies the PC leaf-certificate SHA-256 fingerprint. The native bridge checks certificate validity and this pin for each HTTPS connection; redirects are disabled, endpoint must be a private IPv4 address, and global TLS defaults are never relaxed. A changed certificate requires a fresh physical pairing QR.
- Pending photos survive network errors and mismatched receipts. The PC commits its receipt and photo together in the encrypted vault, and deduplicates retries after restart. One capture per encounter is intentional.
- After a successful receipt, the phone atomically replaces the encrypted photo with encrypted receipt metadata. That marker survives restart and prevents taking another photo for the already completed encounter. Pair a new PC encounter for each additional page/visit.
- Uninstalling/clearing app data loses queued captures and pairing keys. Keep encrypted pending items until the PC confirms receipt. UI/source/patient confirmation remains mandatory on the PC; mobile performs no clinical interpretation.

## Evidence status

Root `tests/transport.test.ts` executes real localhost HTTPS: wrong pin rejection, one-use pairing, partial upload interruption, retry/deduplication after encrypted vault reload, changed-content/encounter rejection, and encrypted server identity persistence. It does **not** establish Android TLS, CameraX, SecureStore, physical Fold or LAN acceptance. Those need the actual native build and connected Fold walkthrough; do not infer them from the Node tests.

`./gradlew.bat psyrec-transfer:testReleaseUnitTest` exercises the actual Kotlin certificate-pin/endpoint policy with a public synthetic certificate fixture: exact pin accepted, wrong/missing certificate rejected, and public/DNS/credential/path/fragment endpoints rejected. These JVM checks do not exercise Android Keystore or phone networking. The fixture contains a public certificate only, with its generated private key discarded.

`./gradlew.bat psyrec-transfer:connectedReleaseAndroidTest` runs actual Android Keystore/queue checks on a connected Android device in a separate test package: encrypted reopen, ciphertext tamper rejection, photo-to-receipt replacement, and completed-encounter guard. It uses only generated synthetic test records and does not access the installed PsyRec app's private data.

The native implementation follows [Expo local modules](https://docs.expo.dev/modules/get-started/), [Expo camera](https://docs.expo.dev/versions/v55.0.0/sdk/camera/) for QR only, and [CameraX in-memory capture](https://developer.android.com/media/camera/camerax/take-photo).

## iPhone source port

The [iPhone source port and build instructions](README.ios.md) reuse this app’s TypeScript interface. iOS Release simulator compilation and four native Swift tests passed; signing and physical iPhone acceptance are pending. Follow the [Xcode teammate handoff](docs/ios-xcode-handoff.md).
