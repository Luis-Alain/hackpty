# Isolated phone history check

This optional harness runs one fixed synthetic lookup using the production history runtime, native journal and bundled model. It uses a separate application ID, storage and Keystore namespace. It never imports the production App, SecureStore or pairing/history-sync flow. It does not establish production pairing, clinical quality, offline transfer or full workflow acceptance.

Provision the normal Android project with Expo first. Stop other Gradle work; use the same JDK 17 and Android toolchain as the mobile build. From apps/mobile/android:

```powershell
$env:NODE_ENV = 'production'
./gradlew.bat -I ../checks/history-evidence.init.gradle :app:assembleRelease :app:assembleReleaseAndroidTest -PreactNativeArchitectures=arm64-v8a --console=plain --max-workers=1 '-Dorg.gradle.parallel=false' '-Dorg.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=768m'
```

Unset ENTRY_FILE; the init script refuses an override. After public dependencies have been provisioned, --offline can be added. The init script changes only the app's isolated build output, application/test IDs, label, test runner and React entry; production source and APK output remain intact.

Outputs under the repository root:

- .local/mobile-history-evidence/android-app-build/outputs/apk/release/app-release.apk
- .local/mobile-history-evidence/android-app-build/outputs/apk/androidTest/release/app-release-androidTest.apk

Before installation, verify the first manifest is tech.adwen.psyrec.capture.evidence, labelled **PsyRec synthetic check**, and the second is tech.adwen.psyrec.capture.evidence.test, targeting only the evidence package with tech.adwen.psyrec.historycheck.HistoryEvidenceInstrumentation. Verify matching signatures, nondebuggable release, production APK hash unchanged, and distinct installed UIDs with adb shell pm list packages --user 0 -U tech.adwen.psyrec.capture.

Install only these two APKs. Do not open the evidence app manually: its entry starts the lookup, and the runner refuses existing journals rather than erasing evidence. Keep the device unlocked and let the runner launch it:

```powershell
adb -s DEVICE_SERIAL shell am instrument -w -r tech.adwen.psyrec.capture.evidence.test/tech.adwen.psyrec.historycheck.HistoryEvidenceInstrumentation
```

Require parsed historyEvidence.status="passed", syntheticOnly=true, exact APK/bundle/model identities, authenticated readback, canonical S1 source, real token/timing fields and the pass marker. Raw mode -r also prints code -1; formatted mode prints the supplied stream instead. An ADB exit code alone is not success. Retain failures and partial evidence. Never clear the production app or overwrite a prior run to obtain a pass.

The harness retains prompts, source revisions, request IDs, native generated/emitted counts and timing methods. SDK load timing excludes prior file copy/checksum. The close check observes the SDK promise only. A single short lookup cannot establish sustained throughput or clinical performance.

The [September 10 result](../evidence/mobile-history-synthetic-run-20260910.json) passed on Samsung SM-F966B using QVAC 0.18.2 and CPU execution. Its distinct candidate APK is explicitly identified.
