# Accuracy evaluations and approved-note questions

September 9, 2026: Jeff reported low accuracy on a newly photographed, entirely synthetic handwritten note and explicitly requested evaluations, a QVAC-based accuracy path and natural-language database questions. This promotes a bounded approved-note query into the current branch. It does not accept handwriting generally, change historical evidence, or replace the printed-note physical acceptance workflow.

## Implemented controls and measured experiments

- Measure extraction against independently transcribed human reference text. Preserve that reference as an append-only encrypted record bound to the capture hash and original extraction run. Never use model output as ground truth, rewrite old approvals or reconstruct missing raw output.
- Score word and character edit rates with stated normalization and substitution/deletion/insertion counts. Separately inspect numbers, negations, uncertainty, missing spans and unsupported additions. A low aggregate error rate can still hide a consequential error.
- Freeze a stricter line-by-line extraction prompt and compare it against the current prompt on the same reviewed development images, model hashes and load configuration. Retain exact prompts, original outputs, native token counters, TTFT and throughput with units/methods. Missing mandatory fields invalidate a run. Do not promote an accuracy change merely because it sounds better.
- Improve Android capture detail as a candidate: a higher resolution preference, JPEG quality 100 and actual dimensions/rotation/encoding metadata inside the encrypted queue. A requested resolution is not proof of Fold output dimensions; this change needs paired physical comparisons and an installed APK identity.
- Add separate read-only natural-language questions over the selected patient's current approved notes. Application code selects bounded passages; the QVAC model returns only source IDs through native JSON Schema constraints. The app validates those IDs and obtains whole passages from canonical record/revision locators. Display only verified quotations, their note dates and search coverage. Model prose does not become clinical history.

## What the documented QVAC stack supports

The [multimodal guide](https://docs.qvac.tether.io/ai-capabilities/multimodal/) requires matched vision weights/projector pairs. Current VisionPsy base already uses the documented preprocessing setting; switching its flag to the Flash setting would be incorrect. Matched Flash or Qwen3-VL are possible measured challengers, not demonstrated handwriting improvements.

The [RAG guide](https://docs.qvac.tether.io/ai-capabilities/rag/) describes embeddings, retrieval and grounded completion, and cautions that its built-in vector store is a prototype. The first query implementation uses local QVAC Qwen3 completion with application-controlled lexical passage selection. It is not semantic embedding search. A later QVAC embedding index must preserve patient/revision filtering, encrypted persistence and lock purge; no unencrypted note database is introduced here.

The [fine-tuning guide](https://docs.qvac.tether.io/ai-capabilities/fine-tuning/) documents text/chat tuning for specific architectures. It does not establish a VisionPsy image-to-transcription training recipe. Generated handwriting-style fixtures remain evaluation inputs, not trained models. Current [OCR documentation](https://docs.qvac.tether.io/ai-capabilities/ocr/) and installed SDK 0.18.2 differ on the underlying model format; verify the installed plugin before attempting integration. Its non-generative timing fields cannot be relabeled as LLM native token counts or TTFT.

## Evaluation split and promotion rules

The existing six reviewed extraction fixtures are already-seen development cases, including two generated handwriting-style examples. They are not a held-out handwriting benchmark. Keep the newly reported failing handwritten capture private in its current encrypted session until its human reference and explicit synthetic evidence review are available. Preserve the first, unrelated unconfirmed-provenance vault without export.

Record image identity, capture medium when actually observed, writer/source, line/reference text, legibility, device/capture settings and preprocessing. Keep photographs of the same note, crops and rewritten variants in one split. Before claiming generalization, reserve unseen writers and notes, including ordinary and difficult text, numbers/units, negations and unreadable regions. Do not tune prompts on the reserved test set.

Promote a candidate only on a predeclared comparison with complete performance evidence and inspected errors. Development improvements do not establish held-out, physical Fold or clinical acceptance. If a stricter prompt regresses, retain the existing production prompt and publish the measured regression on reviewed synthetic inputs.

For queries, test answerable and absent facts, synonyms, wrong-patient notes, stale/superseded revisions, fabricated quotation/record identifiers, prompt-like source text, empty histories and lock/patient-change races. An empty bounded result means no answer was found in the searched passages, not that the fact is absent from the entire database.

## Unchanged release boundary

Local Windows inference; SDK 0.18.2; team ancestry 21f7f40736c201f8d3c14a36ced4cdb426639122; one GPU job at a time with a dedicated evidence owner. No cloud/Pi5 inference, automatic approval, generated SQL, diagnosis, external reference corpus, new submission repository or automatic submission. Existing SYN-HW-002 stays provisional. The capture-quality APK installation is now verified by matching installed/build SHA-256 (see the current handoff); physical capture quality and the full phone lifecycle/human workflow remain unaccepted. September 11 04:00–08:00 Panama remains reserved for verification, handoff and Jeff's submission.
