# PsyRec iPhone source port

Status: **native iOS Release simulator build passed; four native Swift tests passed. Physical iPhone signing, installation and acceptance remain pending.** This port uses the existing TypeScript screens and PsyRecTransfer bridge contract. Inference and clinician review remain on the paired Windows PC.

## Included source

- An Expo Swift module and CocoaPods specification, registered for iOS alongside the existing Kotlin module.
- AVFoundation rear-camera capture into memory. Portrait orientation is flattened, metadata discarded and the longest image edge bounded to 1600 pixels before JPEG encryption. There is no Photos-library write or plaintext camera file.
- AES-256-GCM ciphertext and metadata in Application Support, excluded from backup, with complete iOS file protection. A random 256-bit key is stored as non-synchronizing WhenUnlockedThisDeviceOnly Keychain data. Existing Expo SecureStore options protect pairing credentials the same way.
- A private IPv4 HTTPS endpoint and exact SHA-256 leaf-certificate pin from the physically scanned PC QR. Certificate dates are checked explicitly; the PC certificate has no IP SAN, so identity comes from its physical pin. URLSession is ephemeral, disables cookies/cache/cellular transfer and rejects redirects and responses over 16 KiB. Global TLS trust is unchanged.
- Receipt matching checks encounter, device, transfer, photo hash, capture ID and received timestamp. The encrypted photo is atomically replaced by encrypted completion metadata only after a matching receipt. Failed sends retain the photo for retry. Pending and completed encounters cannot be captured twice.
- Camera/local-network permission descriptions, no microphone or Face ID permission, and a native privacy cover for app switching and detected recording/mirroring. **iOS cannot guarantee Android FLAG_SECURE-style screenshot prevention.** Do not claim screenshot prevention or zeroization of every framework-managed memory copy.

## Build and sign on a Mac

Start with the [teammate Xcode handoff](docs/ios-xcode-handoff.md). From this directory, run **bash scripts/prepare-xcode.sh** to prepare the workspace and run the native tests.

Use a Mac with Xcode and its command-line tools, Node compatible with Expo SDK 55 and CocoaPods. From apps/mobile:

```sh
npm ci
npm run check
npx expo prebuild --platform ios --no-install
npx pod-install ios
npx expo run:ios --device
```

Choose your Apple signing team in Xcode when prompted. The bundle identifier is tech.adwen.psyrec.capture. No signing identity or Apple account is embedded in source. The generated ios/ application stays ignored; modules/psyrec-transfer/ios/ is tracked source. Use an isolated checkout for native build work; do not run prebuild --clean against the active shared checkout. Expo Go cannot load this native module.

The ios-simulator EAS profile has completed native validation without Apple signing. The ios-internal profile is ready for a teammate with suitable Apple provisioning. No App Store submission has occurred. Linking the hackpty Expo project does not supply Apple signing credentials.

## Checks and acceptance still required

The four native policy/storage tests passed on the Apple build worker. Rerun them on your Mac with:

```sh
cd modules/psyrec-transfer
swift test
```

These use only a public synthetic certificate and synthetic bytes. They cover exact/wrong pins, expiry, endpoint restrictions, encrypted reload, wrong keys, ciphertext tampering, transfer-ID binding, mismatched-receipt retention and completion recovery. The package compiles production transport/storage/policy code; camera and Expo view registration require the actual iOS application build. Passing these tests would not establish phone TLS, Keychain, camera or workflow acceptance.

On a real iPhone, allow camera and local-network access, then follow the [phone-to-PC walkthrough](README.md#phone-to-pc-walkthrough). Verify:

1. Physical QR pairing, sharp upright printed synthetic-note photo, encrypted send and the PC's durable receipt.
2. Interrupted send, restart and retry produce one PC capture. Wrong pins or mismatched receipts leave the encrypted queue intact.
3. Pending captures and credentials survive restart; locked-device access fails safely. No image appears in Photos, plaintext app files or backups.
4. App switching hides content, camera stops on backgrounding, and recording/mirroring triggers the privacy cover. Screenshot limitations stay documented.
5. Continue on the PC through extraction, source correction, bounded draft, exact approval, encrypted reload and selected-patient approved history. Record the complete synthetic workflow and mandatory model metrics before claiming acceptance.

iOS Keychain items can survive uninstall, while the app queue does not. Uninstall is not a reliable credential reset and cannot recover queued photos. Do not uninstall or clear data with a pending transfer.

References: [Expo native modules](https://docs.expo.dev/modules/overview/), [Expo local builds](https://docs.expo.dev/guides/local-app-development/), [AVFoundation](https://developer.apple.com/documentation/avfoundation/avcapturephotooutput), [Keychain accessibility](https://developer.apple.com/documentation/security/ksecattraccessiblewhenunlockedthisdeviceonly).

The iOS 17+ ATS configuration limits IP exceptions to the three RFC 1918 private IPv4 ranges; native transport still requires pinned HTTPS and TLS 1.2+. See [Apple local networking](https://developer.apple.com/documentation/bundleresources/information-property-list/nsapptransportsecurity/nsallowslocalnetworking).

## Validation recorded on September 9, 2026

- Passed: mobile TypeScript check and actual Expo iOS permission/ATS configuration.
- Passed: native module discovery on iOS and Android, plus iOS pod/class resolution.
- Passed: four native Swift XCTest cases on the Apple build worker, zero failures.
- Passed: complete iOS Release simulator compilation and bundled JavaScript. [Build and source evidence](docs/ios-build-validation.json).
- Pending: physical-device signing, installation, Keychain/camera/TLS checks and complete iPhone-to-PC workflow. No phone-installable IPA has been produced.

The iOS additions are confined to this mobile directory. Shared TypeScript screens, Android Kotlin, desktop/runtime code and root dependency versions were not changed by the port. Apple signing is intentionally left to the teammate using Xcode.
