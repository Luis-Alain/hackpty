# Fresh Fold acceptance run — prepared, not performed

This procedure resumes the September 9 implementation. It does not accept or repair SYN-HW-002, and it never opens the first unconfirmed-provenance vault. Jeff chose to perform the physical steps later. Keep a dedicated runtime/performance evidence owner and one real GPU job at a time.

Validation: `npm test` passed 47 tests with zero failures/skips; mobile TypeScript passed; 3 native Kotlin/JVM policy tests passed and instrumentation compiled without device execution. The retained desktop/native/performance-binding verifiers passed their existing scopes. The absent primary receipt and failed SYN-HW-002 receipt still fail physical acceptance. No new inference was run.

The latest [device-identity build record](../../apps/mobile/evidence/device-identity-preparation.json) supersedes the earlier build preparation; its APK is built and signature-verified but not installed. Read the [current continuation](2026-09-09-device-identity-checkpoint.md) first. New captures measure manufacturer/model; the primary device remains Samsung SM-F966B, and replacement-phone evidence stays separate. Preserve SDK 0.18.2 and team ancestry 21f7f40736c201f8d3c14a36ced4cdb426639122. Available agent cells used the selected inherited runtime; no GLM, Kimi or Fable execution is claimed.

## Before the human session

- Use Windows and the native Android app on the same private Wi-Fi. Connect and authorize the Fold for installation/diagnostics; USB is not the photo transport.
- Run `./apps/mobile/scripts/install-verified-android.ps1` to inspect actual manufacturer/model and hash the installed APK first; it skips matching builds or performs an in-place install and verifies the result. Use `-VerifyOnly` for inspection without installation; mismatches are retained and fail verification. Do not uninstall or clear app data; pending captures and Android Keystore keys must survive.
- Print the [synthetic English DEMO-001 page](../../diagnostics/qvac-spike/fixtures/print-synthetic-note.html) on paper. A displayed page or generated handwriting fixture does not satisfy this release.
- Lock and close any previous PsyRec window normally. Run `npm run prepare:fold` from the repository. The helper creates a unique ignored vault directory; the user enters the passphrase in the app. Do not reuse either old physical vault or record the passphrase.
- For readiness without launching, run `node dist/apps/desktop/fold-launch.js --check`. If multiple private interfaces exist, launch with `npm run prepare:fold -- --address=<private-Wi-Fi-IPv4>`.
- Review the active runtime and acquire the sole GPU slot before extraction/drafting. Keep exact prompts, loaded model identity/configuration, native token counts, TTFT and throughput with units/methods. Missing measurements fail acceptance.

## Phone observations on the same new capture

1. Pair to the new desktop encounter by scanning its physical QR. Never record the QR, token or credentials.
2. Photograph the actual printed DEMO-001 paper with **Capture and encrypt**. Confirm it is pending.
3. Force-stop the Android app without clearing data, relaunch it, and verify the same encrypted pending transfer reopens in a new process session.
4. Open **Synthetic verification steps**, then **Verify incorrect certificate rejection**. It must reject the peer and retain that pending capture.
5. Choose **Verify interrupted upload**. It must disconnect after a nonempty partial application-stream write, retain ciphertext and record the byte-count method. A connection failure before upload is insufficient.
6. Use the normal send/retry action. Native pin verification, the matching durable PC receipt, and replacement of the encrypted photo by encrypted receipt metadata must be recorded in order.
7. The normal send attempts to save native observations automatically. If necessary, use **Retry saving transfer observations** on the completed encounter. The server must acknowledge durable encrypted storage. A PC capture receipt alone cannot establish the phone's deletion behavior.

Save the observation report successfully before pairing another encounter; replacing the current pairing credentials can strand an unsynced report. Do not backfill new hardware fields into older journals.

The native journal measures application writes/flushes, not packets on the network. Separate generated instrumentation checks cannot stand in for this camera transfer.

## Human desktop workflow

1. Confirm that the received image belongs to the selected synthetic patient and encounter. Use the diagnostic paper-source attestation only after personally verifying this photo came from the printed DEMO-001 page.
2. Run VisionPsy. Compare every line against the image, correct the source as needed, and personally confirm source review. Retain the actual raw extraction; never reconstruct it from corrected text.
3. Generate the bounded draft from that reviewed source. Read and edit the exact text, check the approval confirmation, and personally approve it. Assistant input must never substitute for this approval.
4. Verify the selected patient's approved history, switch to the empty second synthetic patient and verify exclusion.
5. Return to the approved patient, lock, verify renderer purge, unlock with the private passphrase, select `SYNTHETIC PRINTED DEMO-001` again and verify the exact immutable approved text reloads. The empty isolation patient is selected first by default.
6. Confirm the entire fresh vault contains synthetic data only, then choose **Export workflow candidate for review**. Choose a new local file path; existing files cannot be overwritten. The candidate intentionally has acceptance flags set to false. Keep it local and unaccepted until the coordinator and performance owner check all phone, paper, human, output, approval, history, lock/reload and native measurement bindings.

After that review, save a separate reviewed receipt with acceptance fields justified by the retained observations; do not edit a historical candidate in place.

Run `npm run check:release -- --receipt=<reviewed-receipt-path>` after a candidate has been assembled. If using npm argument forwarding is inconvenient, run `node dist/scripts/validate-release.js --receipt=<reviewed-receipt-path>` after `npm run build`. An absent or incomplete candidate must fail. Preserve the original failed/provisional receipts unchanged.

## Remaining release work

[Enforced offline evidence](../../diagnostics/qvac-spike/ENFORCED-OFFLINE-PLAN.md) is a pending proposal, not an executed test. Existing socket observations establish no enforcement. Complete crash privacy, independent-machine setup and the final [Spanish video](../DEMO.md) remain open. The iPhone teammate continues through the existing [Xcode handoff](../../apps/mobile/docs/ios-xcode-handoff.md); do not repeat completed Expo linking or the iOS simulator build.

Deadline: September 11 at 08:00 Panama. Preserve 04:00–08:00 that morning for verification, handoff and Jeff's submission. The original 40-hour ceiling has not restarted. No new repository, main merge, submission, organizer contact, Pi5 or cloud inference is authorized by this procedure.
