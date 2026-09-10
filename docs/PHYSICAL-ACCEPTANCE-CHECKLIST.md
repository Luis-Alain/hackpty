# Physical acceptance checklist — assisted session (Track 2, QVAC-Psy)

Executable checklist for the assisted physical session with the user (Jeff) on
the Windows PC + Samsung Fold SM-F966B. Synthetic data only; every printed or
photographed note states SYNTHETIC / NOT A REAL PATIENT.

This checklist sequences and names evidence; it does **not** duplicate the
procedure text. Authoritative procedure:
[docs/handoffs/2026-09-09-prepared-physical-run.md](handoffs/2026-09-09-prepared-physical-run.md)
(read it first) and the device-identity caveat in
[docs/handoffs/2026-09-09-device-identity-checkpoint.md](handoffs/2026-09-09-device-identity-checkpoint.md).
Blinded transcription procedure: [docs/OCR-TRANSCRIPTION-FORM.md](OCR-TRANSCRIPTION-FORM.md).
In-app human-reference scoring: [docs/ACCURACY.md](ACCURACY.md).

**Standing caveat (from the device-identity checkpoint):** save the phone's
transfer-observation report successfully **before pairing another encounter** —
the app holds one set of pairing credentials, and replacing them can strand a
previous unsynced journal.

Legend: **Evidence** = file the step must produce; **Verify** = command the
coordinator runs afterwards (coordinator owns builds/shared `dist/`).

## 0. Preparation (before the user session)

1. **Readiness without launching.**
   Command: `node dist/apps/desktop/fold-launch.js --check` (after `npm run build`).
   Expected: readiness passes without launching or creating a vault.
   Evidence: console output retained in the session log.
2. **Verify the installed APK (read-only).**
   Command: `powershell -NoProfile -ExecutionPolicy Bypass -File apps/mobile/scripts/install-verified-android.ps1 -VerifyOnly`
   (reference only — do not edit the script). `-VerifyOnly` never installs.
   Expected: measured manufacturer `samsung`, model `SM-F966B`; installed APK
   sha256 reported. As observed 2026-09-09T23:24:34Z (Cell B, B5), the installed
   sha256 is `4c9d47a2a26621da7c1d17eb63fe3922bd7d7b7544396693fa47e87326c34db2`,
   identical to the current local release build
   (`apps/mobile/android/app/build/outputs/apk/release/app-release.apk`).
   This step requires: record the installed hash AND the local build hash
   (`sha256sum apps/mobile/android/app/build/outputs/apk/release/app-release.apk`),
   require them equal, and require the coordinator to confirm that this build is
   the intended one before proceeding. Note:
   `apps/mobile/evidence/device-identity-preparation.json` still records the
   older build hash `b3d5a9f2167d7adb773c97416bbd0bacf45e2df4eaa00b384c9b984b222d78f2`
   and must be reconciled by the other coordinator (Cell B cannot edit it).
   No uninstall, no data clear.
   Evidence: the script writes the retained identity record to
   `.local/mobile-install/<stamp>-<guid>/identity.json` (gitignored) — never to
   `apps/mobile/evidence/`.
   Verify: `ls -t .local/mobile-install | head -1` then
   `cat .local/mobile-install/<newest>/identity.json`; the coordinator checks
   the fields `deviceManufacturer` (samsung), `deviceModel` (SM-F966B),
   `installedApkSha256`, and `installedHashMatchesBuild` (true).
3. **Print the synthetic notes on paper (one A4 sheet each):**
   - `diagnostics/qvac-spike/fixtures/print-synthetic-note.html` (DEMO-001 — release fixture)
   - `diagnostics/qvac-spike/fixtures/print-synthetic-chart-A-2026-09-09.html` (current-visit chart note)
   - `diagnostics/qvac-spike/ocr-fixtures/print/print-synthetic-ocr-stress-01.html` (development OCR stress)
   A displayed page does not satisfy the release.
4. **Blinded transcription BEFORE any model output.**
   Follow docs/OCR-TRANSCRIPTION-FORM.md line by line from the paper; write
   `[unclear]` for unreadable/masked lines; never guess. Enter it via the app's
   human-reference panel or the manifest `humanTranscription` field.
   Evidence: saved human reference (app) or updated
   `diagnostics/qvac-spike/ocr-fixtures/manifest.json` entry (`status: ready`, photo `sha256` filled).
5. **Fresh vault launch.** `npm run prepare:fold` (optionally `-- --address=<private-Wi-Fi-IPv4>`). User enters the passphrase in the app. Do not reuse old physical vaults or record the passphrase.

## 1. Phone observations (same new capture, in order)

Procedure details: prepared-physical-run.md §"Phone observations". All steps use
the app's native **Capture and encrypt** and **Synthetic verification steps**.

6. **Pair** to the new desktop encounter via its physical QR. Never record QR/token/credentials.
7. **Photograph** the printed DEMO-001 paper. Confirm the capture is pending.
8. **Encrypted queue restart:** force-stop the Android app (no data clear), relaunch, verify the same encrypted pending transfer reopens in a new process session.
9. **Certificate rejection:** **Verify incorrect certificate rejection** must reject the peer and retain the pending capture.
10. **Interrupted retry:** **Verify interrupted upload** must disconnect after a nonempty partial application-stream write, retain ciphertext, record the byte-count method. Then use normal send/retry.
11. **Deletion only after the matching durable receipt:** native pin verification, the matching durable PC receipt, and replacement of the encrypted photo by encrypted receipt metadata — in that order.
12. **Save transfer observations** (automatic on normal send, else **Retry saving transfer observations**). Server must acknowledge durable encrypted storage. **Do this before pairing any other encounter (standing caveat above).**
    Evidence: the app's saved native transfer-observation report (unique file chosen in-app) + the PC durable capture receipt.
    Verify: `node dist/scripts/validate-release.js --receipt=<reviewed-receipt-path>` (runs `validatePhoneLifecycle`, which requires the measured SM-F966B identity, queue reopen across process sessions, pin rejection with retained queue, interrupted partial upload, and receipt-ordered photo removal).

## 2. Desktop human workflow

Procedure details: prepared-physical-run.md §"Human desktop workflow".

13. **Confirm photo provenance** (selected synthetic patient + encounter), then use the paper-source attestation only after personally verifying the photo came from the printed DEMO-001 page.
14. **Run VisionPsy extraction.** Compare every line against the image; **correct the source** as needed; personally confirm source review. Retain the actual raw extraction — never reconstruct it from corrected text.
    Evidence: encrypted run record (exact prompt, model identity/config, native token counts, TTFT, tokens/s with methods). Missing metrics fail the run.
15. **Blinded score** the extraction against the step-4 human reference (app panel, docs/ACCURACY.md).
16. **Generate the bounded draft** from the reviewed source; read/edit the exact text; **approve the exact final document** personally.
17. **Run the MedPsy chart review** ("What changed since the previous visit, and what still needs clarification?") over the reviewed current-visit source plus the explicitly identified approved historical record (SYN-CR-A-2026-06-12). Inspect the result line by line.
    Caveat: the chart-review suite (`diagnostics/qvac-spike/chart-review/suite/REVIEW-CHECKLIST.md`) is **NOT FROZEN** until Jeff confirms its gold rows; results are development observations, not accuracy claims.
    Evidence: chart-review run record in the encrypted vault (same mandatory metrics).
18. **Verify selected-patient approved history**, switch to the empty second synthetic patient and verify exclusion.
19. **Lock, reload, verify:** lock, verify renderer purge, unlock with the private passphrase, reselect the patient, verify the exact immutable approved text reloads.
20. **Export the workflow candidate** (**Export workflow candidate for review**) to a new local path (existing files cannot be overwritten). Candidate acceptance flags stay false until coordinator + performance owner review.
    Evidence: exported workflow candidate JSON (synthetic data only).
    Verify: `node dist/scripts/validate-release.js --receipt=<candidate-path>` must FAIL on an unreviewed candidate; after review, save a separate reviewed receipt (never edit a candidate in place) and re-run against it.

## 3. Coordinator verification after the session

21. `node dist/scripts/validate-release.js --receipt=<reviewed-receipt-path>` (or `npm run check:release -- --receipt=...`) — full receipt validation including phone lifecycle and human review bindings.
22. `node dist/diagnostics/qvac-spike/ocr-score.js <run-id>` — offline OCR scoring of archived extraction evidence against manifest references (no inference; never overwrites).
23. Preserve all failed/provisional receipts unchanged. An absent or incomplete candidate must fail; a score alone cannot pass release acceptance.
