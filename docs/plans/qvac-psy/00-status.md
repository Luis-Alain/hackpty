# Status: PsyRec QVAC Psy

## Current accuracy and query checkpoint

The [accuracy/query handoff](../../handoffs/2026-09-09-accuracy-query-checkpoint.md) is the current continuation pointer. Jeff's reported synthetic handwriting failure prompted encrypted human-reference scoring, reproducible WER/CER comparisons, an Android capture-quality candidate and experimental local approved-note questions. The dedicated performance owner retains serialized GPU responsibility. Semantic embedding retrieval and an external corpus remain deferred.

The stricter extraction prompt was rejected: development WER 0.7353% → 2.9412%, CER 1.5064% → 3.8239%; production stays at extraction v1. All 24 new runs through the 1.7B query comparison retain complete native performance evidence. Query v3 is syntactically valid in 10/10 cases but retrieves the complete expected source set in only 6/10 (3/4 development, 3/6 fresh validation), so relevance/reliability remains unaccepted. The frozen 4B challenger also passed 6/10, with no aggregate gain and slower native decoding; it was not promoted. There are now 34 new real model runs with complete native measurements. See [evaluation methods/results](../../../diagnostics/qvac-spike/TRANSCRIPTION-EVALUATION.md).

The capture-quality APK is installed and its device APK hash matches the build: `283425bdd88a6a01fc6c71baea8d9455bdcf04d7b6906e4d1c492d8650bc416b`, observed 21:11:54 UTC on September 9. In-place installation preserved app data. No subsequent physical photo or capture-quality gain is claimed. Existing SYN-HW-002 and the first unconfirmed-provenance vault remain unchanged. The latest handwritten capture needs a human reference and remains separate from printed-note acceptance.

Validation: 68 root tests, mobile TypeScript, Kotlin compilation and six native JVM checks passed. Android instrumentation compiled but was not executed. The isolated desktop UI check and visual review passed, explicitly using synthetic test doubles and rejecting manufactured human-reference events. Full human/phone lifecycle acceptance is still open. The September 11 04:00–08:00 Panama submission buffer is unchanged.

## Previous prepared checkpoint

This is the historical preparation state; the current installation and validation above supersede its APK/device status.

The [fresh physical-run checklist](../../handoffs/2026-09-09-prepared-physical-run.md) is the next operating procedure. Jeff explicitly chose to do the physical steps later; the Fold is absent from ADB. New code prepares a unique desktop vault with human passphrase entry and trusted paper attestation, an encrypted native Android lifecycle journal and authenticated PC evidence sink, and stricter model/lifecycle/human-chain gates. Implementation and native compilation are separate from physical acceptance.

The new Release APK hash is `6c7311593faf65a99e787b92cdb396b98866e984550dc372a838cae24780f8a5`; installation is unverified. Android JVM checks pass and instrumentation compiles, but physical instrumentation is unexecuted. The dedicated runtime owner reviewed both native observation bindings and mandatory performance integrity. No new real GPU job, clinical approval, private vault export, old temporary-file cleanup, Expo link or iOS simulator validation was run.

The physical slice remains open. Follow the current checklist for queue restart, incorrect-certificate rejection, interrupted upload/retry, receipt-bound photo removal, paper capture, exact human review/approval, encrypted reload/history and observer lock purge. Enforced offline proof, complete crash privacy, independent-machine setup and Spanish video remain open. The deadline and September 11 04:00–08:00 Panama buffer are unchanged.

Validation: `npm test` passed 47 tests with zero failures/skips; mobile TypeScript passed; 3 native Kotlin/JVM policy tests passed and instrumentation compiled without device execution. The retained desktop/native/performance-binding verifiers passed their existing scopes. The absent primary receipt and failed SYN-HW-002 receipt still fail physical acceptance. No new inference was run.

## Previous checkpoints

- Historical AIOS continuation: [AIOS reconciliation at 14:40 Panama / 19:40 UTC](../../handoffs/2026-09-09-aios-continuation.md), implementation `98ce270` pushed and remote-verified. Release acceptance remains incomplete.
- Product and architecture direction: APPROVED by Jeff's explicit implementation request, September 9, 2026.
- Program design and slice sequence: implementing the approved plan; concrete contracts recorded alongside code. No fabricated separate approval events.
- Later correction incorporated: approved patient-note browsing now; optional patient-scoped RAG adapter later, supplied by teammate.
- Shared runtime integration: Jeff requested commit `21f7f40736c201f8d3c14a36ced4cdb426639122`; preserve its ancestry and adapt its runtime in TypeScript. SDK pin is now 0.18.2 for team compatibility. Original 0.19.0 plan pin is superseded. Clinical inference remains local on the PC.

## Slices
- [x] Skeleton: imported image to review screen — actual desktop renderer
- [x] Real local VisionPsy extraction and measurement — linked desktop run
- [x] Exact approval, encrypted save/reload and patient history — actual desktop renderer
- [ ] Native phone capture, authenticated encrypted transfer, receipt/retry
- [x] Consequence preview and revision invalidation — UI preview/cancel, core revision checks
- [ ] Reproducible submission evidence and Spanish video

## Open evidence
The [provisional physical capture](../../../artifacts/evidence/physical-fold-exploratory-provisional.json) is retained with explicit failed steps. [Independent measurement review](../../../artifacts/evidence/physical-performance-binding-review.json) passed photo/receipt/model-output/prompt/approval/reload bindings and all mandatory metrics for its two real GPU runs. It does not override the workflow failure. Published verification is portable and read-only.

The [actual desktop workflow](../../../artifacts/evidence/desktop-workflow.json) passed ten renderer steps with linked real GPU extraction/drafting, corrected-source prompt, exact approval, encrypted reload, history isolation and lock purge. The coordinator and dedicated performance owner independently validated the receipt. Root tests: 32 passed, no failures/skips; desktop gate and mobile TypeScript check passed. The full release gate deliberately fails without a separate physical Fold receipt and requires trusted human review/approval linked to canonical records. Assistant navigation checks are explicitly attributed. The logo fragment-navigation IPC defect found during physical use was fixed and regression-tested in `5503d23`. Fresh SYN-HW-002 capture, human review/approval and assisted history/reload succeeded, but the observer failure flag and missing encrypted assisted lock-purge event remain a strict evidence failure. A new encrypted lock/drain regression prevents delayed view writes across future locks; it does not repair historical evidence.

Real cancellation and timeout reject incomplete runs and clear their temporary files. Six fixed-quality GPU completions have mandatory metrics; [quality review](../../../artifacts/evidence/quality-review.json) reports five of six checks passing, with unreadable extraction omitting the uncertainty marker. Clinician image/source comparison remains mandatory. [Socket observations](../../../artifacts/evidence/lifecycle-quality-summary.json) record 49 samples with no owned sockets; this is not enforced offline proof. Two synthetic unmarked temporary directories from forced desktop test shutdowns remain: automatic approval review rejected their scoped deletion as “blocked by policy.” Runtime crash recovery is being hardened; do not claim crash-proof RAM-only image storage.

Native Expo Android release APK built and installed locally; actual Kotlin certificate policy tests passed. Wireless paired transfer and durable receipt status were observed on the Fold, but that first image was handwritten with unconfirmed provenance. It remains encrypted/private and is excluded from synthetic acceptance; the prematurely labelled metadata observation was withdrawn in commit `7f58a88`. The later known-synthetic physical run remains provisional; a clean primary printed-note run, queue restart and phone retry evidence are still required. The receiver persists its TLS private identity only in the encrypted vault. Source phone capture goes directly from camera memory to Keystore ciphertext.

September 9 steering: Expo app linked and verified as [`@hackpty/psyrec-capture`](https://expo.dev/accounts/hackpty/projects/psyrec-capture), project ID `b57b65cb-66a6-454f-8301-72259ee2a828`. Local Android build scripts/package identity are preserved. The rebuild completed (APK SHA-256 `084e23b7a10899a472691c087460e4be91bf206280690b2386e1ade089716818`); its installation is not verified. Separately, the committed iOS port passed an EAS simulator Release build, four Swift tests and compilation. Authenticated build status was rechecked as FINISHED at 19:29:57 UTC; this was a cloud build, with no cloud inference or desktop vault/model upload. Physical iPhone signing/testing remain open; see the [Xcode handoff](../../../apps/mobile/docs/ios-xcode-handoff.md). Jeff also requested generated handwritten synthetic training notes. Two [AI-generated handwriting-style fixtures](../../../artifacts/fixtures/handwriting/manifest.json) have exact generation prompts and visually reviewed ground truth. [Two exploratory local VisionPsy runs](../../../artifacts/evidence/handwriting-exploratory-review.json) preserved all normalized words, with casing/line-break differences; full metrics passed. This is separate from printed-note release acceptance. No model training, phone-local inference or general handwriting reliability is claimed.

Continuation started September 9 at 12:51 Panama. Branch and remote matched at `53722de`; required team ancestry verified. Coordinator plus three authorized cells have disjoint ownership and a dedicated performance evidence owner; real GPU jobs are serialized. Remaining event time at continuation was approximately 43 hours to September 11 08:00 Panama; do not restart the user's 40-hour ceiling. Reserve September 11 04:00–08:00 for final verification, handoff and user submission buffer; stop feature expansion earlier if device evidence is blocked.

Electron maintenance: pinned 40.10.6, preserved scoped install-script permission, 13 tests/typecheck/locked desktop smoke passed. `npm audit --omit=dev` has zero findings; full audit retains one high Electron advisory mitigated by the existing deny-all window-open handler. Native physical Fold test is requested and remains open.

Original [native feasibility](../../../artifacts/evidence/feasibility-summary.json) and [unfinished handoff](../../handoffs/2026-09-09-qvac-psy.md) remain historical checkpoints. Enforced offline operation, complete crash privacy, clean primary Fold workflow acceptance, independent-machine setup and Spanish video remain open. Human review/approval exists for the provisional exploratory run and does not close these gaps. Organizer interpretation is Jeff's external follow-up; no contact or submission is automated.

## Sources
Software Factory upstream: https://gist.github.com/Maciejdziuba/88890d7e0eeefa5a8738bbe9fd5e20b8#file-skill-md . Wayfinder was read from the existing Claude skill source; branch-local Markdown tracking selected by Jeff. No skills or AIOS runtime installed.

The [checkpoint validation receipt](../../../artifacts/evidence/query-checkpoint-validation-20260909.json) records 68 passing tests, reviewed synthetic UI and installed APK evidence, and a successful read-only verification of 34 new plus six archived real-run records from an isolated Git index export. This does not establish independent-machine or physical human acceptance.

AIOS handoff: [September 9 reconciliation](../../handoffs/2026-09-09-accuracy-query-checkpoint.md#aios-reconciliation--september-9-1704-panama--2204-utc) records implementation 95bb7f1, independent evidence verification, the disconnected Fold, pending same-vault restart and preserved concurrent work. Release acceptance remains open. Canonical AIOS record synchronization was explicitly approved and completed at 22:21 UTC.
