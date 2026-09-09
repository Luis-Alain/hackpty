# Android capture UI and startup fix — September 9, 2026

The connected Samsung SM-F966B now has the recovered mobile capture design in APK `4c9d47a2a26621da7c1d17eb63fe3922bd7d7b7544396693fa47e87326c34db2`. In-place installation and pulled-back SHA-256 verification completed at 23:00:20 UTC / 18:00 Panama. Package `tech.adwen.psyrec.capture`, version 0.1.0/code 1 and the existing Android Debug signer are preserved. No uninstall or app-data clear occurred. See the [final UI installation receipt](../../apps/mobile/evidence/mobile-ui-install-20260909.json).

## Recovered design and implementation

Jeff's missing UI/UX work was a standalone preview, originally outside the repository with no application changes. Its original HTML, capture/history storyboards, notes and render checks are now byte-preserved under [docs/design/mobile-study](../design/mobile-study/README.md). The existing desktop workspace and stylesheet were its visual authority.

The actual native app now uses the study's teal/sage palette, PsyRec header, larger state-specific headings, accessible actions, setup steps and connection disclosure. Connect, camera capture, encrypted pending/retry and receipt-complete states use existing native transport. Queue restoration must succeed before capture/pair controls enable. Pending captures prevent new pairing. Android observation sync is unknown after restart until acknowledged; a native-confirmed legacy absence is separately labelled and never reconstructed or counted as saved. Phone history, phone-local inference and mobile RAG remain planned, not operational UI.

The packaged source is recorded by SHA-256 in the installation receipt. Mobile TypeScript and the offline local Release build passed; signature verification and bundle inspection confirmed the build includes all four capture headlines. The installed APK hash matches the build. A cold start retained PID 22619 at 5, 15 and 30 seconds, with no new exit and MainActivity resumed. The phone subsequently locked: the accessibility attempt exposed only Android system UI, with no matching app labels. Live on-device visual inspection is therefore still pending. No screenshot protection was disabled.

These checks do not establish camera/QR operation, queue recovery, transfer lifecycle or full physical workflow acceptance. No new photo, pairing, human review/approval or inference occurred. The root suite was not rerun over Claude's active changes.

## Earlier startup failure and correction

The prepared `b3d5a9f...` APK installed at 22:34:40 UTC but crashed during JS module initialization. Android initially returned `Status: ok`; the process exited at 22:35:02 UTC with a view-thread violation. Installation success and startup failure remain distinct.

Expo can replay the foreground lifecycle event while creating a module on the JS thread. Both module creation and foreground callbacks now marshal FLAG_SECURE updates to the captured activity's UI thread. Screen protection remains enabled. The intermediate corrected APK `ff72fddf...` installed at 22:38:41 UTC and survived its separate 30-second startup check. All six existing native JVM checks passed after that native fix, which is unchanged in the final UI build. The [historical metadata receipt](../../apps/mobile/evidence/android-startup-fix-20260909.json) retains both earlier installations and checks; it is not the current APK receipt.

## Desktop and team ownership

Jeff first requested preserving the open desktop, then accidentally closed it and explicitly authorized reopening. At 22:46:24 UTC the coordinator reopened the same existing encrypted workspace using the already-compiled desktop, with no root rebuild and no startup error output. No passphrase, inference or clinical approval was entered by the assistant. This was reopening the current desktop UI, not a separately implemented desktop redesign.

Claude's three plan files plus evolving runtime, chart-review contract and diagnostics are excluded from this checkpoint. Coordinator ownership remains integration, documentation and Git; no root contracts or dependencies changed. The Android cell supplied native fixes and UI primitives before Jeff prioritized Spark. An actual `gpt-5.3-codex-spark` cell implemented App integration; the coordinator applied three final storage/camera-permission control guards. A dedicated performance/evidence reviewer remained assigned, with at most three disjoint worker cells. No GLM, Kimi or Fable was used or relabelled. No real GPU job was started.

## Continue

Unlock PsyRec and inspect the native interface first. Preserve SDK 0.18.2, team ancestry `21f7f40736c201f8d3c14a36ced4cdb426639122`, current Git ownership and the existing encrypted desktop session. Do not reinstall a matching APK. The current native module provides observation sync; its successful promise validates `stored=true` and matching encounter/transfer IDs. An older build missing that optional method would use an unverified fallback and is outside this reviewed bundle.

For physical evidence, follow the [prepared procedure](2026-09-09-prepared-physical-run.md): fresh printed synthetic paper, restart/certificate/interrupted-send/receipt observations, source review, exact human approval and encrypted reload/history. Save transfer observations before pairing another encounter. Existing provisional or unconfirmed-provenance evidence remains unchanged.

The release is unfinished. No root dependency change, main merge, submission, organizer contact, new repository, Pi5/cloud inference or old rejected cleanup occurred. Preserve the original time ceiling and September 11 04:00–08:00 Panama verification/submission buffer.
