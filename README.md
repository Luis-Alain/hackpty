# PsyRec — QVAC Psy challenge

Native Android capture and local Windows clinician documentation, built in TypeScript. **Work in progress:** this branch is being developed in small tested checkpoints. Nothing in this README certifies clinical safety or sponsor eligibility.

## Release workflow

Z Fold photo of a printed synthetic clinician note → authenticated encrypted transfer → local QVAC VisionPsy extraction → source review → draft and exact clinician approval → encrypted save/reload. The clinician can browse previous approved notes for the selected patient. Historical material is distinct from this session's source.

## Team integration

- **This release:** photo capture and reviewed clinical records.
- **Later RAG, owned by teammate:** implement the optional `ApprovedNotesRetriever` port in `packages/contracts/index.d.ts`. Return approved-record/revision IDs and excerpt locators. The application checks patient and revision authorization itself. No retrieval backend or vector database is included now.
- **Later Philips voice integration:** implement `VoiceProcessor` to supply transcription/segments to source review. Voice processing cannot approve a clinical record. Audio is not part of this release.
- Keep shared runtime logic separate from clinical approval and vault code. All application/test source is TypeScript; Python is not required.

## Judging evidence

The submission must demonstrate the complete user workflow, not only an SDK call or benchmark. Structured synthetic-run JSONL must include model identity/configuration, model-load timing, **actual prompts**, SDK prompt/generated/emitted token counts, **TTFT**, and **throughput**, with units and measurement methods. Missing required fields fail the release evidence gate. Do not claim an unrun benchmark or infer metrics from string length. Clinical run records stay inside the encrypted vault; publish only synthetic evidence.

Real-model, physical-device, privacy and independent-setup acceptance remain open until their receipts are linked. Current progress is tracked in [Factory status](docs/plans/qvac-psy/00-status.md) and the [Wayfinder map](.scratch/qvac-psy/map.md).

## Development

Node >=22.17; npm; Windows x64 with Vulkan >=1.4. Install with `npm ci`, then `npm run build` / `npm test`. Desktop launch is `npm start` once the desktop slice is present. Android setup and provisioning commands will be added with that slice. No inference API keys are required.

`@qvac/sdk` is pinned to 0.19.0. VisionPsy base uses its matching base projector and leaves `image_no_upscale` unset. Models are provisioned before offline use; model bytes and private vaults are not committed.

## Submission portability

Development uses the shared hackathon repository and `QVAC-Psy` branch. Per organizer guidance reported by Jeff, each challenge will be submitted in its own repository. This branch carries relative documentation links, MIT attribution, lockfile and self-contained dependencies so its history can be moved intact. Do not require another challenge's repository to run PsyRec.

## Boundaries

Synthetic English inputs; Spanish final demo video. No diagnosis, therapy, treatment advice, cloud inference, cross-patient retrieval, patient sharing, Pi5, or promise of handwriting/background recording. Separate formal validation is needed before real clinical use.

## Prior base

The September 8 architecture and a historical pre-event Whisper/Llama pilot informed this design. This branch began with its existing MIT licence. Current implementation is being written during the competition; no old pilot execution is reported as a Windows acceptance run. See [prior-base record](PRIOR-BASE.md).
