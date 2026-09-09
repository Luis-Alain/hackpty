# PsyRec — QVAC Psy challenge

Native Android capture and local Windows clinician documentation, built in TypeScript. **Work in progress:** this branch is being developed in small tested checkpoints. Nothing in this README certifies clinical safety or sponsor eligibility.

## Release workflow

Z Fold photo of a printed synthetic clinician note → authenticated encrypted transfer → local QVAC VisionPsy extraction → source review → draft and exact clinician approval → encrypted save/reload. The clinician can browse previous approved notes for the selected patient. Historical material is distinct from this session's source.

## Team integration

- **This release:** photo capture and reviewed clinical records.
- **Later RAG, owned by teammate:** implement the optional `ApprovedNotesRetriever` port in `packages/contracts/index.d.ts`. Return approved-record/revision IDs and excerpt locators. The application checks patient and revision authorization itself. No retrieval backend or vector database is included now.
- **Later Philips voice integration:** implement `VoiceProcessor` to supply transcription/segments to source review. Voice processing cannot approve a clinical record. Audio is not part of this release.
- Keep shared runtime logic separate from clinical approval and vault code. App/core/runtime source is TypeScript, with a Kotlin Expo module for Android camera, Keystore encryption and pinned TLS. Python is not required.

## Judging evidence

The submission must demonstrate the complete user workflow, not only an SDK call or benchmark. Structured synthetic-run JSONL must include model identity/configuration, model-load timing, **actual prompts**, SDK prompt/generated/emitted token counts, **TTFT**, and **throughput**, with units and measurement methods. Missing required fields fail the release evidence gate. Do not claim an unrun benchmark or infer metrics from string length. Clinical run records stay inside the encrypted vault; publish only synthetic evidence.

Real desktop workflow evidence is linked below. Physical-device, complete privacy and independent-setup acceptance remain open until their receipts are linked. Current progress is tracked in [Factory status](docs/plans/qvac-psy/00-status.md) and the [Wayfinder map](.scratch/qvac-psy/map.md).

## Development

Node >=22.17; npm; Windows x64 with Vulkan >=1.4. Install with `npm ci`, then `npm run build` / `npm test`. Desktop launch is `npm start`. Provision model files using `node dist/diagnostics/qvac-spike/provision.js`, then run `npm run test:runtime`. `node dist/diagnostics/qvac-spike/validate-evidence.js` checks required native evidence. Native Expo Android capture is implemented in `apps/mobile/`; its local build and Fold acceptance are tracked separately. No inference API keys are required.

`npm run test:workflow` exercises real desktop UI handlers in a fresh isolated synthetic vault and runs real local inference; schedule it alone on the GPU. Its output stays under ignored `.local/desktop-workflow/` until reviewed. `npm run check:desktop-evidence` validates the reviewed desktop receipt and explicitly does not establish phone acceptance. `npm run check:release` requires a separate connected physical Fold receipt; absent or incomplete evidence fails, never skips. `npm run check:mobile` typechecks the native app's TypeScript after its dependencies are installed.

### Verified checkpoint · September 9

Continuation is active with dedicated runtime/performance, native Expo/transfer, and desktop/clinical-review owners. The coordinator owns shared contracts, dependencies and Git; real GPU jobs are serialized. The handoff remains an unfinished implementation checkpoint.

Runtime cancellation/timeout cleanup and six further synthetic GPU completions are now recorded in [lifecycle evidence](artifacts/evidence/lifecycle-quality-summary.json). The [quality review](artifacts/evidence/quality-review.json) reports an unreadable-line omission; mandatory clinician correction remains part of the release. Socket sampling observed no owned connections but does not establish enforced offline operation. [Demo instructions and Spanish narration](docs/DEMO.md) are prepared for the physical workflow.

Electron was patched from 40.0.0 to **40.10.6** with the scoped install-script allowance preserved. TypeScript checking and desktop smoke pass. Production dependency audit reports zero findings; the full audit retains one Electron advisory, [GHSA-9f4c-93c8-jc8g](https://github.com/advisories/GHSA-9f4c-93c8-jc8g). The application denies all new windows with `setWindowOpenHandler`, the publisher's documented mitigation. This is not a claim of a clean full audit.

29 tests pass. The [connected desktop renderer workflow](artifacts/evidence/desktop-workflow.json) passed all ten steps using real VisionPsy and Qwen3 inference: image import, source correction/review, bounded draft, exact whitespace-preserving approval, patient-scoped history, renderer lock purge and encrypted reload. Exact input/output hashes and prompts are linked by the workflow gate. This is automated desktop import evidence, not a physical Fold or human clinician acceptance claim. Two real HTTPS tests cover wrong certificates, partial uploads and durable receipt retries; the receiver's TLS identity and failed run records now live inside the encrypted vault. The physical evidence gate additionally requires ordered trusted UI input observations and canonical approval/history/reload records. Physical capture, enforced offline operation and crash privacy remain open.

The native Fold app transfers over private Wi-Fi with certificate pinning; USB is used for local installation and diagnostics. The first physical transfer succeeded, but its source was handwritten with unconfirmed synthetic provenance, so it stays private and does not count toward release acceptance. A fresh known-synthetic physical workflow remains required. Phone-local inference is not implemented; SDK Android integration feasibility is being checked separately.

Jeff requested [generated handwriting-style synthetic notes](artifacts/fixtures/handwriting/manifest.json) on September 9. Two labelled fixtures include exact generation prompts and visually verified ground truth. [Two real local extractions](artifacts/evidence/handwriting-exploratory-review.json) preserved all words after case/punctuation normalization; capitalization and cursive line breaks differed. Complete native performance evidence is retained. These are additional exploratory evaluation inputs, not a trained model or a general handwriting-support claim. The primary physical acceptance flow still uses the printed synthetic note.

`@qvac/sdk` is pinned to **0.18.2**, aligned with the team's shared runtime from commit `21f7f40736c201f8d3c14a36ced4cdb426639122`. That runtime retains P2P delegation needed by other entries; this PsyRec release uses local PC inference. This supersedes the original 0.19.0 plan pin. VisionPsy base uses its matching base projector and leaves `image_no_upscale` unset. Models are provisioned before offline use; model bytes and private vaults are not committed.

The upstream `src/core/` runtime is being adapted into the TypeScript `packages/runtime/` interface with projector support, exact prompt capture, strict evidence validation and an encrypted application sink. Upstream `evidencia/` and `THIRD_PARTY.md` retain team provenance; they do not establish PsyRec acceptance or expand this branch's submission scope. [PsyRec attribution](docs/PSYREC-THIRD-PARTY.md) identifies this release's actual models, licences and inherited code.

## Submission portability

Development uses the shared hackathon repository and `QVAC-Psy` branch. Per organizer guidance reported by Jeff, each challenge will be submitted in its own repository. This branch carries relative documentation links, MIT attribution, lockfile and self-contained dependencies so its history can be moved intact. Do not require another challenge's repository to run PsyRec.

## Boundaries

Synthetic English inputs; Spanish final demo video. No diagnosis, therapy, treatment advice, cloud inference, cross-patient retrieval, patient sharing, Pi5, or promise of handwriting/background recording. Separate formal validation is needed before real clinical use.

## Prior base

The September 8 architecture and a historical pre-event Whisper/Llama pilot informed this design. This branch began with its existing MIT licence. Current implementation is being written during the competition; no old pilot execution is reported as a Windows acceptance run. See [prior-base record](PRIOR-BASE.md).
