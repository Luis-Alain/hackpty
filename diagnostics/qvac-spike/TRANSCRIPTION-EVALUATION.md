# Transcription and approved-note query evaluation

SDK 0.18.2 remains pinned. Production extraction remains psyrec-extract-v1. The frozen psyrec-extract-lines-v3 experiment does not imply a quality improvement. All records below are new reviewed synthetic development evidence; no private vault was read.

The official [multimodal guide](https://docs.qvac.tether.io/ai-capabilities/multimodal/) requires the current VisionPsy base weights and matching projector constants ending in _1 with image_no_upscale absent. Flash requires its own matched unsuffixed weights/projector and image_no_upscale on. Switching the flag on for the base pair is documented to degrade quality. Installed 0.18.2 exposes those options; image_tile_mode is described for Qwen3.5-VL, not a documented VisionPsy tuning control.

The official [fine-tuning guide](https://docs.qvac.tether.io/ai-capabilities/fine-tuning/) documents LoRA training for qwen3, gemma3 and bitnet text models using supported quantizations, text or chat JSONL. It does not supply a VisionPsy image/transcript training path. No training has occurred. The [OCR page](https://docs.qvac.tether.io/ai-capabilities/ocr/) still describes ONNX, while installed 0.18.2 uses the GGUF ggml-ocr plugin. Its optional detection/recognition/total timers do not provide mandatory LLM native token counts, TTFT or token throughput. Its buffer path creates a plaintext temporary image with best-effort deletion. OCR is not added to this release.

## Frozen comparison

transcription-cases.ts contains six previously seen cases: four printed synthetic images and two visually reviewed generated handwriting-style images. The original DEMO-001 retained PNG must be used: regenerating its bitmap currently produces different bytes, which the scorer correctly rejects. The other images are SHA-256 checked against retained inference or reviewed manifest metadata. The occluded line reference uses the policy marker [unclear], never its invisible underlying duration. No output is used as ground truth.

transcription-score.ts scores archived exact outputs without inference, validates every mandatory performance field and binds the output digest, attachment digest and bytes. WER and CER include substitution/deletion/insertion counts and precise normalization methods. Clinical category rates are bounded manually specified phrase checks; unsupported lexical edits are review flags, not semantic hallucination judgments. Absent rule coverage is null.

transcription-ablation.ts freezes a new protocol before each authorized experiment, executes six v3 cases serially and then four Qwen query cases (answerable, synonym, absent fact, hostile source instruction). Every result retains exact prompt, source context, load configuration, model hashes, SDK/native-addon identities, raw output, native counts, native TTFT in ms, native throughput in tokens/s, wall timings and measurement methods. Native metrics are not reconstructed from string lengths.

The current query v3 runtime selects only source IDs from bounded approved excerpts. A native dynamic JSON Schema enumerates the IDs actually supplied. The core independently validates unique authorized IDs/current revision and displays full original source passages to preserve nearby negation; there is no model answer prose. Historical v1/v2 quote-selection protocols and their failed raw outputs remain unchanged. Current diagnostics measure exact ID-set correctness, selected-ID precision, expected-ID recall, unsupported ID count and abstention on supplied excerpts. They do not measure the lexical retrieval stage or establish clinical reliability.

GPU execution requires a coordinator lease. A read-only guard checks foreign Node/Electron runtime workers, Bare processes and native GPU compute PIDs before, during and after each request. Sampling is not a host-wide mutex or offline-enforcement proof. The first prelaunch attempt was rejected by a broad process match and is retained unchanged; subsequent guard versions restrict executable names and retain rejection metadata.

No production prompt is automatically promoted. Review paired errors and each critical check, not aggregate scores alone. These six fixtures are development/regression inputs; held-out human handwriting evaluation requires independently authored, visually verified synthetic references frozen before running candidates. The existing exploratory private handwritten run cannot be scored without an unlocked exact retained raw output and a separately supplied human transcript.

## Reviewed results on 2026-09-09

The archived six-image baseline has WER 1/136 (0.7353%) and CER 13/863 (1.5064%). Frozen extraction v3 has WER 4/136 (2.9412%) and CER 33/863 (3.8239%). Both generated handwriting-style images have zero normalized WER/CER in both runs; this provides no new handwriting improvement. V3 appends bare unclear and [un readable] in the wrong position on the masked-line case. Its frozen normalized phrase check passes the word unclear, but the separate review explicitly fails exact marker and placement. Production remains v1.

QVAC query v1 produced invalid JSON on all four development cases. Native responseFormat JSON Schema constraints in installed SDK 0.18.2 fixed syntax for v2, but only one of four exact quote-selection cases passed. V3 simplifies the model task to source-ID selection; the exact prompt and dynamic-schema definition were frozen before the six independently authored validation cases were disclosed. The validation manifest matches its pre-disclosure SHA-256 commitment. V3 passed 3/4 development and 3/6 fresh validation cases. All ten responses used valid JSON and authorized IDs, but missing relevant passages prevent clinical query reliability acceptance. No tuning followed the fresh validation results.

All 24 new model runs retain complete native performance evidence: six VisionPsy v3 extractions, four Qwen v1 queries, four Qwen v2 queries, and ten Qwen v3 selections. Quality failures remain failures. The separate prelaunch guard rejection did not launch a model.

After compiling, the following read-only command verifies all retained output, attachment, protocol, scoring and native metric bindings without loading a model:

    node dist/diagnostics/qvac-spike/verify-transcription-evaluations.js artifacts/evidence/transcription-dev-baseline-20260909.json artifacts/evidence/transcription-ablation-20260909T2114Z artifacts/evidence/query-structured-20260909T2122Z artifacts/evidence/query-source-selection-20260909T2130Z

The output reports evidence-binding success separately from query quality failures and physical release acceptance. The human workflow remains a distinct unfinished acceptance gate.

## Bounded model-size challenger

An isolated QWEN3_4B_INST_Q4_K_M challenger (2,497,280,256 bytes; SHA-256 7485fe6f11af29433bc51cab58009521f205840f5b4ae3a32fa7f92e8534fdf5) used the same frozen v3 prompt/schema and all ten exact source-ID references. It passed 6/10, matching the 1.7B model. It fixed the coworkers/colleagues example but lost the rest-at-night/sleep example; it still omitted the panic denial and returned no result on both embedded-instruction cases. The larger model is not promoted. These repeated cases are model-selection validation, not an untouched test set.

The complete reviewed record now contains 34 new real model runs. Append artifacts/evidence/query-model-comparison-20260909T2145Z to the verifier command above to check the ten challenger records too. All four printed evaluation images are read from retained PNG files and hash-bound to original inference, avoiding zlib/platform regeneration differences.

To reproduce the unpromoted 4B comparison on another checkout, provision the exact public publisher asset in query-4b-model-provisioning.json into .local/models and verify its byte count and SHA-256. Create .local/query-4b-eval/MODEL-MANIFEST.json from the modelManifest object in query-model-comparison-20260909T2145Z-protocol.json; do not replace the production manifest. Then run `node dist/diagnostics/qvac-spike/query-model-comparison.js <new-unique-id> <absolute-checkout>/.local/query-4b-eval artifacts/evidence/query-source-selection-20260909T2130Z` under the sole GPU lease. Preserve prompt source bytes and historical evidence; scoped .gitattributes rules prevent line-ending conversion of hash-bound records.
