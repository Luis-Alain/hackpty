# PsyRec — QVAC Psy challenge

Native Android capture and local Windows clinician documentation, built in TypeScript, with an iPhone port validated by an iOS simulator build. **Work in progress:** this branch is being developed in small tested checkpoints. Nothing in this README certifies clinical safety or sponsor eligibility.

## Release workflow

Z Fold photo of a printed synthetic clinician note → authenticated encrypted transfer → local QVAC VisionPsy extraction → source review → draft and exact clinician approval → encrypted save/reload. The clinician can browse previous approved notes for the selected patient. Historical material is distinct from this session's source.

## Team integration

- **This release:** photo capture, reviewed clinical records, scored transcription evaluations and bounded read-only questions over selected-patient approved notes (September 9 user steering).
- **Later semantic RAG, owned by teammate:** implement the optional `ApprovedNotesRetriever` port in `packages/contracts/index.d.ts`. Return approved-record/revision IDs and excerpt locators. The application checks patient and revision authorization itself. The bounded question flow uses local QVAC completion over application-selected passages; it does not add an embedding index or vector database.
- **Later Philips voice integration:** implement `VoiceProcessor` to supply transcription/segments to source review. Voice processing cannot approve a clinical record. Audio is not part of this release.
- Keep shared runtime logic separate from clinical approval and vault code. App/core/runtime source is TypeScript, with Kotlin Android and Swift iOS Expo modules for native capture, encrypted storage and pinned TLS. Python is not required.

## Judging evidence

The submission must demonstrate the complete user workflow, not only an SDK call or benchmark. Structured synthetic-run JSONL must include model identity/configuration, model-load timing, **actual prompts**, SDK prompt/generated/emitted token counts, **TTFT**, and **throughput**, with units and measurement methods. Missing required fields fail the release evidence gate. Do not claim an unrun benchmark or infer metrics from string length. Clinical run records stay inside the encrypted vault; publish only synthetic evidence.

Real desktop workflow evidence is linked below. Physical-device, complete privacy and independent-setup acceptance remain open until their receipts are linked. Current progress is tracked in [Factory status](docs/plans/qvac-psy/00-status.md) and the [Wayfinder map](.scratch/qvac-psy/map.md).

## Device identity checkpoint · September 9

The [current continuation](docs/handoffs/2026-09-09-device-identity-checkpoint.md) records a new Android build with encrypted native manufacturer/model identity. Replacement phones now export separately labelled Android candidates; both Fold workflow gates require the observed Samsung SM-F966B. The installer inspects/hashes first and skips a matching APK. The new APK is built and signature-verified, **not installed**; ADB still showed no device at 22:19:39 UTC. Validation: 71 root tests, six native JVM tests, six mocked installer cases, mobile TypeScript and native/instrumentation compilation passed; no device instrumentation or new inference occurred. The existing desktop stays open pending saved-edit confirmation. Full physical/human acceptance remains open.

## Development

Node >=22.17; npm; Windows x64 with Vulkan >=1.4. Install with `npm ci`, then `npm run build` / `npm test`. Desktop launch is `npm start`. Provision model files using `node dist/diagnostics/qvac-spike/provision.js`, then run `npm run test:runtime`. `node dist/diagnostics/qvac-spike/validate-evidence.js` checks required native evidence. Native Expo Android capture is implemented in `apps/mobile/`; its local build and Fold acceptance are tracked separately. No inference API keys are required.

`npm run test:workflow` exercises real desktop UI handlers in a fresh isolated synthetic vault and runs real local inference; schedule it alone on the GPU. Its output stays under ignored `.local/desktop-workflow/` until reviewed. `npm run check:desktop-evidence` validates the reviewed desktop receipt and explicitly does not establish phone acceptance. `npm run check:release` requires a separate connected physical Fold receipt; absent or incomplete evidence fails, never skips. `npm run check:mobile` typechecks the native app's TypeScript after its dependencies are installed.

### Accuracy and query checkpoint · September 9

Jeff's latest synthetic handwritten capture exposed low accuracy. The new [accuracy controls](docs/ACCURACY.md) save a blank, human-entered reference separately in the encrypted vault and score the exact retained extraction with WER/CER and edit counts. Local approved-note questions now use QVAC source-ID selection with native structured output; the app displays canonical passages, dates, revisions and bounded search coverage. This remains experimental: the 1.7B model selected the complete expected source set in 6/10 cases and missed relevant passages, including a denial. No clinical query reliability is accepted.

A frozen stricter VisionPsy prompt regressed on the six already-seen development images: WER rose from 0.7353% to 2.9412%, and CER from 1.5064% to 3.8239%. The original production extraction prompt is retained. Both generated handwriting-style fixtures remained at zero normalized word errors; that does not explain or resolve the user's physical handwriting failure. The current capture needs a human reference before scoring. Exact synthetic inputs, prompts, model/load settings, native token counts, TTFT and throughput are retained in [reviewed evaluation evidence](diagnostics/qvac-spike/TRANSCRIPTION-EVALUATION.md).

The higher-detail Android capture candidate is now built and installed on the Fold by an in-place update with installed-APK hash verification: SHA-256 `283425bdd88a6a01fc6c71baea8d9455bdcf04d7b6906e4d1c492d8650bc416b`. It requests 2048×1536 and JPEG quality 100, records actual output metadata in encrypted phone storage and retains the 8 MiB transfer limit. [Installation evidence](apps/mobile/evidence/capture-quality-candidate.json) does not establish a physical accuracy gain or phone lifecycle acceptance.

Current automated validation: 68 tests passed with no failures/skips, mobile TypeScript and Kotlin compilation passed, six native JVM checks passed, and an isolated synthetic desktop UI check passed. The UI check uses explicit test doubles and creates no human approval/reference evidence. The original full physical workflow, human review and phone durability observations remain open. See the [accuracy checkpoint](docs/handoffs/2026-09-09-accuracy-query-checkpoint.md) before continuing. The 4B challenger also scored 6/10, with a slower decode rate and a different error pattern; it was not promoted.

### Earlier prepared physical-run checkpoint · September 9

The following records the earlier preparation state; the capture candidate installation above supersedes its unverified-APK status.

Jeff chose to perform the physical steps later. Follow the [fresh-run checklist](docs/handoffs/2026-09-09-prepared-physical-run.md): `npm run prepare:fold` creates a new vault and asks for the passphrase in the app; a trusted paper-source observation is bound to the received DEMO-001 photo before clinical review. The native Android journal records installed APK identity, encrypted queue restart, wrong-certificate rejection, interrupted upload/retry and matching-receipt photo replacement. Reports travel through paired TLS into the encrypted PC vault; this implementation is not a claim those physical observations have occurred.

The new local Release APK is SHA-256 `6c7311593faf65a99e787b92cdb396b98866e984550dc372a838cae24780f8a5`. It uses the existing local Android Debug signing identity. No Android device was detected and its installation remains unverified. Use the [in-place installation/hash-verification script](apps/mobile/scripts/install-verified-android.ps1) when the Fold is connected; it preserves app data.

Acceptance now rejects missing or contradictory native lifecycle, paper provenance, loaded-model identity and shared performance measurements. Existing SYN-HW-002 remains provisional, the first unconfirmed-provenance private vault remains intact, and no real GPU run or clinical approval was performed during preparation. [Enforced offline testing](diagnostics/qvac-spike/ENFORCED-OFFLINE-PLAN.md) remains a proposal requiring an isolated worker and Windows administrator access.

Validation: `npm test` passed 47 tests with zero failures/skips; mobile TypeScript passed; 3 native Kotlin/JVM policy tests passed and instrumentation compiled without device execution. The retained desktop/native/performance-binding verifiers passed their existing scopes. The absent primary receipt and failed SYN-HW-002 receipt still fail physical acceptance. No new inference was run.

### Earlier verified checkpoint · September 9

Read the [earlier AIOS continuation](docs/handoffs/2026-09-09-aios-continuation.md) before resuming. Implementation `98ce270` includes the [iPhone/Xcode handoff](apps/mobile/docs/ios-xcode-handoff.md). Its [EAS simulator build](apps/mobile/docs/ios-build-validation.json) finished successfully with four native Swift tests and compilation; authenticated status was rechecked at 19:29:57 UTC. Physical iPhone signing/testing remain open. The Expo project is `@hackpty/psyrec-capture`; local Android builds remain supported. The latest recorded local Android APK was built, but the Fold's last observed installation is older.

Continuation is active with dedicated runtime/performance, native Expo/transfer, and desktop/clinical-review owners. The coordinator owns shared contracts, dependencies and Git; real GPU jobs are serialized. The handoff remains an unfinished implementation checkpoint.

Runtime cancellation/timeout cleanup and six further synthetic GPU completions are now recorded in [lifecycle evidence](artifacts/evidence/lifecycle-quality-summary.json). The [quality review](artifacts/evidence/quality-review.json) reports an unreadable-line omission; mandatory clinician correction remains part of the release. Socket sampling observed no owned connections but does not establish enforced offline operation. [Demo instructions and Spanish narration](docs/DEMO.md) are prepared for the physical workflow.

Electron was patched from 40.0.0 to **40.10.6** with the scoped install-script allowance preserved. TypeScript checking and desktop smoke pass. Production dependency audit reports zero findings; the full audit retains one Electron advisory, [GHSA-9f4c-93c8-jc8g](https://github.com/advisories/GHSA-9f4c-93c8-jc8g). The application denies all new windows with `setWindowOpenHandler`, the publisher's documented mitigation. This is not a claim of a clean full audit.

The earlier checkpoint passed 32 tests. The [connected desktop renderer workflow](artifacts/evidence/desktop-workflow.json) passed all ten steps using real VisionPsy and Qwen3 inference: image import, source correction/review, bounded draft, exact whitespace-preserving approval, patient-scoped history, renderer lock purge and encrypted reload. Exact input/output hashes and prompts are linked by the workflow gate. This is automated desktop import evidence, not a physical Fold or human clinician acceptance claim. Two real HTTPS tests cover wrong certificates, partial uploads and durable receipt retries; the receiver's TLS identity and failed run records now live inside the encrypted vault. The physical evidence gate requires trusted human source review/approval and canonical approval/history/reload records. Assistant navigation checks must be explicitly attributed and cannot substitute for human approval. A live logo-navigation bug was fixed: same-document fragments retain IPC access while other URLs remain rejected. Physical acceptance, enforced offline operation and crash privacy remain open.

The native Fold app transfers over private Wi-Fi with certificate pinning; USB is used for local installation and diagnostics. The first physical transfer succeeded, but its source was handwritten with unconfirmed synthetic provenance, so it stays private and does not count toward release acceptance. A subsequent physical capture of the generated SYN-HW-002 fixture has human review and approval plus successful assisted history/reload checks. Its diagnostic observer reported a failure and lacks the encrypted assisted lock-purge observation; strict acceptance remains incomplete. A regression now protects delayed observation writes across locking, without changing the original failed evidence. Paper-versus-screen remains unconfirmed. Phone-local inference is not implemented; a [bounded SDK 0.18.2 Android plan](apps/mobile/docs/phone-inference-plan.md) documents exact dependency and measurement work separately.

The [provisional physical workflow](artifacts/evidence/physical-fold-exploratory-provisional.json) retains the failed steps. Its [independent performance review](artifacts/evidence/physical-performance-binding-review.json) verifies photo/receipt/run hashes, exact prompts, full native metrics, human approval and matching encrypted reload. A 213-sample process/network observation found no inference-owned sockets; this remains observational. `node dist/diagnostics/qvac-spike/review-physical-performance.js` verifies the published artifacts without private local inputs or writes. See the [recovery checkpoint](docs/handoffs/2026-09-09-recovery-checkpoint.md) for continuation.

Jeff requested [generated handwriting-style synthetic notes](artifacts/fixtures/handwriting/manifest.json) on September 9. Two labelled fixtures include exact generation prompts and visually verified ground truth. [Two real local extractions](artifacts/evidence/handwriting-exploratory-review.json) preserved all words after case/punctuation normalization; capitalization and cursive line breaks differed. Complete native performance evidence is retained. These are additional exploratory evaluation inputs, not a trained model or a general handwriting-support claim. The primary physical acceptance flow still uses the printed synthetic note.

`@qvac/sdk` is pinned to **0.18.2**, aligned with the team's shared runtime from commit `21f7f40736c201f8d3c14a36ced4cdb426639122`. That runtime retains P2P delegation needed by other entries; this PsyRec release uses local PC inference. This supersedes the original 0.19.0 plan pin. VisionPsy base uses its matching base projector and leaves `image_no_upscale` unset. Models are provisioned before offline use; model bytes and private vaults are not committed.

The upstream `src/core/` runtime is being adapted into the TypeScript `packages/runtime/` interface with projector support, exact prompt capture, strict evidence validation and an encrypted application sink. Upstream `evidencia/` and `THIRD_PARTY.md` retain team provenance; they do not establish PsyRec acceptance or expand this branch's submission scope. [PsyRec attribution](docs/PSYREC-THIRD-PARTY.md) identifies this release's actual models, licences and inherited code.

## Submission portability

Development uses the shared hackathon repository and `QVAC-Psy` branch. Per organizer guidance reported by Jeff, each challenge will be submitted in its own repository. This branch carries relative documentation links, MIT attribution, lockfile and self-contained dependencies so its history can be moved intact. Do not require another challenge's repository to run PsyRec.

A [clean source archive check](artifacts/evidence/clean-source-check.json) installed fresh root/mobile dependencies, passed 29 tests and validated the desktop receipt on the same Windows machine. Independent-machine installation and a new submission repository remain separate; no repository was created automatically.

## Boundaries

Synthetic English inputs; Spanish final demo video. No diagnosis, therapy, treatment advice, cloud inference, cross-patient retrieval, patient sharing, Pi5, or promise of handwriting/background recording. Separate formal validation is needed before real clinical use.

## Prior base

The September 8 architecture and a historical pre-event Whisper/Llama pilot informed this design. This branch began with its existing MIT licence. Current implementation is being written during the competition; no old pilot execution is reported as a Windows acceptance run. See [prior-base record](PRIOR-BASE.md).

The [checkpoint validation receipt](artifacts/evidence/query-checkpoint-validation-20260909.json) records 68 passing tests, reviewed synthetic UI and installed APK evidence, and a successful read-only verification of 34 new plus six archived real-run records from an isolated Git index export. This does not establish independent-machine or physical human acceptance.

AIOS handoff: [September 9 reconciliation](docs/handoffs/2026-09-09-accuracy-query-checkpoint.md#aios-reconciliation--september-9-1704-panama--2204-utc) records implementation 95bb7f1, independent evidence verification, the disconnected Fold, pending same-vault restart and preserved concurrent work. Release acceptance remains open. Canonical AIOS record synchronization was explicitly approved and completed at 22:21 UTC.
