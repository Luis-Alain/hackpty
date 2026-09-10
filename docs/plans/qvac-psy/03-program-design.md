# Program design

## September 9 amendment: MedPsy-centered chart review
Approved direction: a private clinician chart-review and documentation assistant answering **What changed since the previous visit, and what still needs clarification?** MedPsy should interpret reviewed medical text, compare documented facts and produce source-linked drafts. This is a proposed implementation contract. Follow [status](00-status.md) for delivered behavior and evidence; existing Qwen probes and quote-only query results remain attributed to their actual models.

The user's Track 2 brief motivates MedPsy's central role. Competition eligibility has not been independently established here. A renamed model or quote lookup alone does not demonstrate the proposed medical-review value.

## Human workflow
1. Select the synthetic patient, pair the Fold and photograph an actual printed synthetic English clinician note.
2. Transfer through the encrypted queue and paired private-Wi-Fi channel. Delete the pending capture only after its matching durable receipt.
3. Run QVAC VisionPsy on Windows. Show the image beside extracted text; require clinician correction and source review before MedPsy interpretation.
4. Supply the reviewed current note and explicitly dated approved history to a chart-review operation. Show documented changes, unresolved conflicts and clarification questions with supporting passages.
5. Allow natural-language questions over the selected patient's approved current record revisions. Disclose coverage and abstain when the supplied evidence lacks the answer.
6. Produce a bounded document for human editing and exact approval. Bind approval to the final content and evidence revisions, then encrypt, save, reload and show it in approved patient history.

The minimum comparison uses two dated synthetic outpatient records and a fresh corrected note. A medication can be documented as stopped while the reason remains unknown: report both without inventing an explanation. Distinguish denied symptoms from symptoms not assessed or not documented. Preserve patient versus informant attribution, uncertainty and provisional wording.

Current-source drafting remains source-only by default. Chart briefs and query answers are read-only, unapproved assistance. A history-informed draft is a separate explicit mode with visible historical evidence; adding chart review must not silently change existing drafting semantics. Use general outpatient English examples, not psychiatric, therapy or crisis claims, consistent with the [official MedPsy scope](https://qvac.tether.io/blog/meet-medpsy-a-private-medical-ai-small-enough-for-your-phone/).

## Ownership and evidence contract
Core service owns patient/encounter binding, source revisions, authorization, draft approval, supersession and retrieval validation. Vault owns encryption and durable writes. Capture gateway owns pairing, authentication, bounds and idempotency. Runtime owns QVAC lifecycle and measured results. Renderer owns no filesystem or network authority.

Existing interfaces include `extractImage(input) -> ExtractionResult`, `draftFromSource(input) -> DraftResult` and optional `retrieveApprovedNotes({ patientId, query, signal }) -> RetrievalHit[]`. Preserve their semantics. Proposed `reviewChart(evidencePacket, task) -> ChartReviewResult` is a target contract, not an implemented SDK API.

The service, not the model, builds an evidence packet containing:
- Selected patient and encounter identifiers; reviewed current-source revision and content hash, tagged as current.
- Historical record/revision identifiers, source dates, canonical excerpt ranges and exact text, tagged as historical. Only approved current revisions qualify.
- Task/question, available coverage, selected excerpts and any omissions imposed by context limits.

Proposed output contains findings, unknowns, conflicts and an optional draft, with evidence references for factual statements. Validate schema, allowed identifiers, patient ownership, approval state, active revisions and exact canonical text boundaries. Revalidate after inference and before accepting or persisting results; source changes invalidate affected output and require renewed review.

Reference integrity is not proof of semantic entailment. Human review and reference-based evaluation must check that cited passages actually support each claim. Preserve sufficient surrounding context for negation and attribution. Limited coverage cannot establish that something never occurred in the full history.

Cancellation, lock and patient changes invalidate pending results and purge sensitive UI state. Model output cannot execute SQL, select patients, grant access or approve documents. Treat source text as evidence, never executable instructions. Bounded source selection can supply the minimum packet; an embedding store or new external corpus is unnecessary for this release.

## Model and runtime decision
Evaluate [MedPsy-1.7B](https://huggingface.co/qvac/MedPsy-1.7B) first, using the official [Q4_K_M imatrix GGUF](https://huggingface.co/qvac/MedPsy-1.7B-GGUF). Evaluate [MedPsy-4B](https://huggingface.co/qvac/MedPsy-4B) with its [Q4_K_M imatrix GGUF](https://huggingface.co/qvac/MedPsy-4B-GGUF) as the quality challenger. Published file sizes are approximately 1.28 GB and 2.72 GB respectively; they do not establish total VRAM requirements or successful operation on this PC.

The 1.7B model is based on Qwen3-1.7B in thinking mode; 4B uses Qwen3-4B-Thinking-2507. Do not blindly inherit the generic model's `reasoning_budget: 0` or a no-thinking prompt. Verify chat template, reasoning controls, final-answer handling, structured output and termination against installed SDK **0.18.2**. Current [online text-generation documentation](https://docs.qvac.tether.io/ai-capabilities/text-generation/) may describe another SDK version.

Keep local Windows inference and run one GPU job at a time. Unload VisionPsy before loading MedPsy; measure load, inference and unload behavior. Reserve budget for both reasoning and the final answer. Record the exact configuration tested rather than presenting proposed settings as a working default. No load, hardware-fit or quality claim is established by this design review.

## Evaluation and adoption gates
Separate three questions:
- **Product benefit:** current generic-model workflow versus correctly configured MedPsy, measuring actual review quality and effort. Disclose configuration differences.
- **Medical specialization:** MedPsy-1.7B versus Qwen3-1.7B with comparable thinking mode, quantization, evidence packets, templates, schema and sampling budgets.
- **Capacity:** MedPsy-4B versus 1.7B. A larger-model win does not isolate medical training; that claim needs a matched 4B base-model control.

Freeze a proposed 16-case English synthetic suite before tuning, with independently reviewed atomic gold facts, permitted evidence and prohibited additions. Include explicit facts; negation; missing versus negative; dates; current versus historical; contradictions; patient/informant and family/patient attribution; provisional wording; prescribed/taken/stopped/unknown medication status; missing dose; unclear source; answerable and absent questions; wrong-patient, superseded and stale evidence; injection; and context truncation. Cases may cover multiple conditions.

First evaluate MedPsy on verified text. Separately measure VisionPsy character and word error rates against human transcription, then assess the downstream effect of OCR errors. The six existing seen development fixtures are not a held-out test set. A handwritten failure used for tuning becomes regression/development evidence. Generated handwriting-style images remain exploratory inputs and do not establish handwriting acceptance.

Score atomic fact precision/recall, critical unsupported claims, negation/subject/date/dose preservation, evidence support, abstention, first-pass schema validity, truncation and clinician correction count/time. Retain failures and retries. Predeclare required-fact recall and review-effort targets before comparing models.

Every accepted run needs the exact prompt, evidence packet, output schema, model identity/artifact hash, quantization, template, SDK/native addon, device/backend, context and generation budgets, reasoning and sampling settings, load configuration and load time. Record native prompt and generated token counts, TTFT in milliseconds and throughput in tokens/second with explicit timing boundaries and formulas. Separate native first-token timing from first visible answer latency; distinguish reasoning and final-answer counts where the runtime exposes them. Never substitute characters or stream chunks for native tokens. Missing required fields fails acceptance.

Adoption requires completed valid output, complete performance evidence, no observed critical unsupported clinical statements, invented citations, cross-patient leakage or negation/attribution reversals on the frozen suite, plus the predeclared factual-coverage target and measured review benefit without critical regression. A small synthetic suite cannot establish clinical safety or generalization. If gates fail, report the result; do not silently fall back or relabel Qwen output as MedPsy.

Keep the dedicated performance evidence owner throughout implementation. Private raw run records remain encrypted, including exact prompts and outputs. Publish only reviewed synthetic evidence. Reasoning traces are not clinical evidence.

## Release constraints and remaining human acceptance
Automated tests and native SDK probes do not replace the full observed workflow, including exact human approval and encrypted reload. Phone-side encrypted queue restart, interrupted retry, certificate rejection and deletion only after the matching durable receipt must be observed.

Primary capture acceptance remains printed synthetic English paper. Existing SYN-HW-002 evidence remains provisional: observer failure, missing assisted lock-purge/phone observations and uncertain paper-versus-display provenance are not repaired or relabeled by this amendment. Preserve the first unconfirmed-provenance private vault; do not export or reconstruct missing raw output or retry the rejected temporary-file cleanup.

Keep SDK 0.18.2, team commit `21f7f40736c201f8d3c14a36ced4cdb426639122`, TypeScript, the native Android bridge and local Windows inference. Existing iPhone signing/physical testing follows [its handoff](../../../apps/mobile/docs/ios-xcode-handoff.md); no repeated simulator work is implied.

External-corpus RAG, Philips voice, phone-local inference, Pi5/cloud inference, autonomous treatment and a general agent platform are outside this implementation. Preserve repository portability and upstream history. Do not reset the original 40-hour ceiling; reserve September 11, 04:00–08:00 Panama for verification, handoff and user submission before 08:00. This amendment authorizes design changes, not a main merge, submission or creation of the separate submission repository.
