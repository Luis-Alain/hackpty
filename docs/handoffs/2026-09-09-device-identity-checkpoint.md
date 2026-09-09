# Android device identity checkpoint — September 9, 2026

This remains an unfinished release on `QVAC-Psy`. Continue with the [prepared physical procedure](2026-09-09-prepared-physical-run.md) and [accuracy/query checkpoint, including AIOS reconciliation](2026-09-09-accuracy-query-checkpoint.md). No new model inference, private-vault access, human approval or physical capture occurred in this continuation.

## Reviewed corrections

New native Android capture journals record `Build.MANUFACTURER` and `Build.MODEL` inside encrypted storage. Existing reports stay unchanged; absent historical hardware is never backfilled. Encrypted storage accepts legacy reports but refuses changes to an already recorded identity. Fresh lifecycle acceptance requires measured hardware. Both Fold-labelled workflow modes require the previously observed Samsung `SM-F966B`. A replacement phone exports a separately labelled Android candidate with primary Fold acceptance false; it does not close the Fold release gate.

The installer now identifies the connected manufacturer/model and hashes its installed APK before deciding whether installation is needed. A matching default invocation skips installation. `-VerifyOnly` never installs; an absent or mismatched build produces a retained identity record and fails verification. Evidence paths are unique and files cannot be overwritten. In-place updates preserve the existing package/data; no uninstall or data clear is used.

## Built versus installed

The new [device-identity build record](../../apps/mobile/evidence/device-identity-preparation.json) identifies Release APK SHA-256 `b3d5a9f2167d7adb773c97416bbd0bacf45e2df4eaa00b384c9b984b222d78f2` (31,497,827 bytes). Its package is `tech.adwen.psyrec.capture`, version 0.1.0/code 1, ABI arm64-v8a. Signature verification passed with the existing Android Debug signer. **Built, not installed.**

At 22:19:39 UTC, ADB still listed no connected device; the replacement remains unidentified. The last verified Fold installation is still the September 9 21:11:54 UTC [capture-quality receipt](../../apps/mobile/evidence/capture-quality-candidate.json), SHA-256 `283425bdd88a6a01fc6c71baea8d9455bdcf04d7b6906e4d1c492d8650bc416b`. Do not change that historical receipt to the new build hash. Confirm the actual connected device/build before its next test.

## Validation

- Final `npm test`: 71 passed, zero failures/skips. Includes encrypted identity/reload/immutability, legacy preservation, replacement candidate labels and both Fold gate scopes.
- Mobile TypeScript passed; six native JVM checks passed with zero failures/skips; Kotlin and Android instrumentation compiled. Device instrumentation was not executed.
- Six mocked installer scenarios passed, covering matching, mismatched and absent installation in normal/VerifyOnly modes. These mocks performed no device operations.
- One incremental offline local Release APK build passed, followed by signature/package/ABI verification. No dependency reinstall, Expo linking or iOS build was repeated.
- The default physical release gate still fails because a fresh reviewed physical receipt is absent. The dedicated performance owner reviewed device/evidence integration; mandatory metrics remain intact. The previous 34 new plus six archived model checks are retained evidence, not newly repeated inference.

## Resume with the user

The existing desktop PID 67440 was still open at the 22:14:06 UTC process check. The saved-edit/restart question remains unanswered. Preserve `.local/desktop-workflow/physical-printed-20260909T202137Z-x4N2zL`; do not stop its process, open a second writer or create a recovery vault. Let Jeff finish/save edits and enter the passphrase locally. Its handwritten source remains unscored until he supplies the exact human reference. Directory names are not paper provenance, and normal-mode operation cannot retroactively create prepared observer events.

For the fresh primary run, print DEMO-001, use the new desktop and native build, and follow all phone restart/certificate/interrupted retry/receipt observations before human review/approval. Save transfer observations successfully **before pairing another encounter**: the app currently has one set of pairing credentials, so replacing them can strand a previous unsynced journal. After encrypted unlock, select `SYNTHETIC PRINTED DEMO-001` again to verify visible approved reload; the empty isolation patient is first by default. Local readiness (`node dist/apps/desktop/fold-launch.js --check`) passed without launching or creating a vault.

Preserve SYN-HW-002 as provisional, the first unconfirmed-provenance vault, and the rejected old temporary-file cleanup boundary. Enforced offline operation, complete crash privacy, independent-machine setup and the Spanish video remain open. Extraction v1 and query model choices are unchanged; no MedPsy, embeddings, training or general handwriting support is added.

## Ownership and publication

This continuation started from local/remote `4380ca0`; required ancestry `21f7f40736c201f8d3c14a36ced4cdb426639122` and SDK 0.18.2 remain intact. The three pre-existing MedPsy plan files retain their starting byte hashes and are excluded from this checkpoint; the ownership question remains pending. Coordinator plus three disjoint cells were used, with one assigned performance owner and no GPU job.

Only reviewed PsyRec changes are for `QVAC-Psy`. During this continuation, concurrent commit `0a120847d29909a9814315c5436d9a60e9d2181c` appeared in both the shared checkout and remote. It records separately approved canonical AIOS synchronization at 22:21 UTC; that work is preserved. See the [updated AIOS reconciliation](2026-09-09-accuracy-query-checkpoint.md#canonical-aios-synchronization-completed). This coordinator made no AIOS changes or publication. No main merge, submission, organizer contact, new repository, Pi5 or cloud inference. Preserve September 11 04:00–08:00 Panama for verification, handoff and user submission before 08:00; the original 40-hour ceiling has not restarted.
