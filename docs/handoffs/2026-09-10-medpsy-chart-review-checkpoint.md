# MedPsy chart-review checkpoint — September 10, 2026

Coordinator: Claude Fable 5.1 (Claude Code), executing Jeff's Track 2 plan of September 9 with one coordinator and three disjoint cells. A separate Codex app-server session was a live peer coordinator on the same working tree throughout (device identity, Android startup fix, mobile history work); its files were never staged by this coordinator. Runners, named by their runtime identity: implementation cells on Kimi Code CLI 0.40.1 alias `kimi-code/k3` (self-report "Kimi / Moonshot AI"); adversarial review on Z.ai requested `glm-5-turbo`, runtime-reported `glm-5.3-flash`; the demo video project built by Codex CLI 0.153.0 (`gpt-6-astra`); one small fix round written by Claude Sonnet after Kimi's usage quota was exhausted (decision D9). Coordinator decisions D1–D10 are published in `docs/handoffs/2026-09-10-coordinator-decisions.md` and summarised where they matter below.

This remains an unfinished release on `QVAC-Psy`. SDK 0.18.2 and team ancestry `21f7f40736c201f8d3c14a36ced4cdb426639122` are intact. No main merge, submission, organizer contact or new repository.

## Delivered and committed (this coordination)

| Commit | Content |
|---|---|
| `4ba8d54` | `packages/contracts/chart-review.d.ts` (evidence packet, output, result), the two dated synthetic records, the 16-case held-out and 4-case development suite with schema, independent gold review and checklist, MedPsy-1.7B provisioning receipt, design documents under Jeff's direction, MedPsy attribution. |
| `74c7e92` | Cell B: printable sheets for the chart records and two OCR stress notes, deterministic bitmaps, OCR fixture protocol and blinded transcription form, `ocr-evaluation.ts` runner and `ocr-score.ts` offline scorer, `docs/PHYSICAL-ACCEPTANCE-CHECKLIST.md`. |
| `273d5dc` | Cell C: `packages/core/chart-review.ts` (application-bound packet: current reviewed source plus the selected patient's current approved records, oldest to newest, at most 6, 2000-character sentence-bounded excerpts, 6000-character total with refusal for an oversized source and disclosed omissions; post-inference revalidation; strict output validation), service persistence of encrypted, never-approved review results, desktop panel and IPC, 19 tests including human-review cases, `docs/CHART-REVIEW.md`. |
| `be0c5a7` | Suite frozen after Jeff confirmed 75 of 75 items and decided the open items (CR-15 P2 kept; CR-06 "the patient denies snoring" term removed; CR-16 "omit" wording accepted as residual risk; budget confirmed). Frozen hashes in `suite/REVIEW-LOG.md` section 4. |
| `f2fbf80` | Printable pages for every suite case (`diagnostics/qvac-spike/ocr-fixtures/print/suite/`, generator, manifest, tests, npm scripts) for the camera workflow. |
| `8567d72`, `b051598` | HyperFrames demo video project (`video/psyrec-demo`): nine scenes, Spanish narration, three textless Higgsfield B-roll clips, results scene bound to verified evidence, first cut 2:57.7. |
| `9530be3` | OCR runner assertion scoped to its own run. |

Cell A's runtime and evaluation work (review operation in `packages/runtime`, evaluation harness, scorer, verifier, `MEDPSY-RUNTIME.md`, `CHART-REVIEW-EVALUATION.md`, all evidence records) is committed in the checkpoint that follows this document once its fix round is verified; see the commit log after `b051598`.

## Measured outcomes

MedPsy-1.7B Q4_K_M imatrix loads on the RTX 4050 laptop GPU through SDK 0.18.2 and decodes at about 118 tokens/s with native TTFT near 170 ms. On this SDK the strict JSON-schema grammar cannot be combined with thinking (grammar error retained as a record), and the `/no_think` suffix does not suppress thinking; `reasoning_budget: 0` does. Details and every probe, including failures: `diagnostics/qvac-spike/MEDPSY-RUNTIME.md`.

Held-out evaluation on the frozen 16-case suite (`goldConfirmedByHuman: true`), four configurations with identical prompt module (`psyrec-chart-review-v4`, iterated on the development split only), packet binding and scorer; every number reproduced independently from the raw per-case records:

| Configuration | Strict gold recall (target ≥ 0.80) | Term-only recall | Forbidden hits | First-pass valid JSON | Cases passed |
|---|---|---|---|---|---|
| (i) MedPsy-1.7B, reasoning off + strict schema (production candidate) | 0.133 | 0.367 | 0 | 16/16 | 1/16 |
| (ii) MedPsy-1.7B, thinking, no grammar | 0.133 | 0.267 | 0 | 15/16 | 1/16 |
| (iii) Qwen3-1.7B Q4_0, reasoning off + strict schema (current generic) | 0.333 | 0.667 | 0 | 16/16 | 3/16 |
| (iv) Qwen3-1.7B Q4_0, thinking, no grammar | 0.100 | 0.100 | 0 | 2/16 | 0/16 |

No configuration meets the predeclared targets. Medical specialization shows no measured advantage over the generic model on this suite; thinking mode is not viable with structured output on SDK 0.18.2. Retained partial runs (lease refusals while the desktop application spawned its own runtime workers) and the mid-session scorer denominator fix are disclosed in `diagnostics/qvac-spike/CHART-REVIEW-EVALUATION.md`, together with the read-only verifier command. Cursor.exe shared the GPU during the runtime verification runs and is recorded in those lease records (decision D7); the four final held-out runs observed no foreign GPU process.

OCR: both development-split bitmap fixtures extracted with complete native metrics (first run `20260910T0230Z`, rerun `20260910T0312Z` under the fixed runner with a written summary); offline scoring WER 0.056 (5 of 90 words), CER 0.035 (18 of 511 characters), no exact matches, and 4 of 15 clinical rules failed: the stress note's blood-pressure value and medication name with dose were misread, and the masked note's diagnosis negation and `[unclear]` abstention marker were not preserved. A low aggregate error rate still hides consequential errors; the three paper-photo fixtures await the physical session. The real-runtime desktop integration check for the chart review passed 1/1 with MedPsy (`artifacts/evidence/chart-review-integration-20260910T0230Z.json`, synthetic).

## Product state and decision

The chart-review feature ships as experimental, read-only and unapproved assistance, exactly like the approved-note query before it: the application binds the evidence, the model never selects patients or records, results never enter approved history, and coverage plus omissions are disclosed. `MODEL-MANIFEST.json` carries a `review` role entry for MedPsy-1.7B (reasoning disabled, strict schema) because the runtime verification passed; release adoption of MedPsy is NOT established by the evaluation. Open decision for Jeff: keep MedPsy in the review role as the approved Track 2 direction with the comparison disclosed, or switch the role to Qwen3-1.7B explicitly because it measured higher. Neither is a silent fallback.

## Human and physical work

Jeff's assisted physical session with the connected Samsung SM-F966B (installed APK `4c9d47a2…`, equal to the local release build) follows `docs/PHYSICAL-ACCEPTANCE-CHECKLIST.md`: the chart record pair as history and current visit, the phone lifecycle observations, source correction, chart review, exact approval, lock and reload, then camera runs of suite cases (CR-09, CR-13, CR-15, CR-05, CR-06). Held-out cases used on camera become seen; those runs are demonstration and human-benefit evidence, never held-out accuracy. Outcome: pending at the time of writing.

## Demo video

`video/psyrec-demo` renders a 2:57.7 first cut with the results scene bound to the verified data; screen captures are placeholders until the physical session provides them, after which the final render, self-review and the human listening pass follow. Generative clips carry no text by rule.

## Next steps

1. Verify and commit Cell A's fix round (stopReason key always present in runtime records), then the OCR rerun with a fresh id.
2. Jeff's physical session evidence: export the workflow candidate, coordinator and performance-owner review, reviewed receipt; capture screen recordings for the video.
3. Final render, README/status/Wayfinder updates, AIOS records, and the September 11 04:00–08:00 Panama verification window.
