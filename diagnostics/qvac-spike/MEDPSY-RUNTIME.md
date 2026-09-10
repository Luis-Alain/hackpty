# MedPsy-1.7B runtime verification (A2)

Scope: behavior of MedPsy-1.7B Q4_K_M imatrix on the installed @qvac/sdk 0.18.2, verified
with real GPU runs under `diagnostics/qvac-spike/gpu-lease.ts` (D7-amended lease). All inputs
are synthetic dev-split chart-review cases (`diagnostics/qvac-spike/chart-review/suite/dev-v1.json`;
the held-out split was never used). Every run, including failures, is recorded with native
metrics under `artifacts/evidence/medpsy-verify-<id>/`.

## Foreign GPU process disclosure (D7)

Run `20260910T0038Z-verify4` executed while a foreign, non-runtime GUI process held a GPU
compute context: **Cursor.exe, PID 65412** (the user's code editor; no inference workload). The
D7-amended lease records this as `observedForeignGpuProcesses` with the raw nvidia-smi lines
instead of aborting; the lease method string states the sharing. Each of that run's records
carries the observation in `leaseObservation`, and its `summary.json` carries the full
before/after lease. The two other complete runs (`20260909T2330Z-verify4` and
`20260910T0106Z-verify5`) executed while the nvidia-smi compute list held NO foreign process
(Cursor.exe had released its context); their leases show `foreignGpuProcessCount: 0` before and
after, with only the run's own `bare.exe` worker visible afterwards. Closing Cursor restores
the strict no-foreign-GPU behavior at all times and remains preferred when Jeff is present.

## Run inventory (all attempts retained)

| ID | Directory | Outcome |
| --- | --- | --- |
| 20260909T2330Z-verify1 | `artifacts/evidence/medpsy-verify-20260909T2330Z-verify1/` (empty) | Retained failed attempt. Crashed before any GPU use: `ERR_PACKAGE_PATH_NOT_EXPORTED` resolving `@qvac/sdk/package.json`. No records written. |
| 20260909T2330Z-verify2 | `artifacts/evidence/medpsy-verify-20260909T2330Z-verify2/` (empty) | Retained failed attempt. Pre-D7 lease refused to start: foreign GPU compute process Cursor.exe (PID 65412). No records written. |
| 20260910T0036Z-verify3 | `artifacts/evidence/medpsy-verify-20260910T0036Z-verify3/` (empty) | Retained failed attempt. Script bug (TDZ access to `lease` inside the `withGpuLease` callback) crashed before model load; no GPU use, no records written. Fixed in this session. |
| 20260910T0038Z-verify4 | `artifacts/evidence/medpsy-verify-20260910T0038Z-verify4/` | First successful execution by the run-2 session: load record + 7 probe records (6 succeeded, 1 failed and recorded) + summary. Ran while Cursor.exe (PID 65412) shared the GPU; every record discloses it (lease-open observation only). |
| 20260909T2330Z-verify4 | `artifacts/evidence/medpsy-verify-20260909T2330Z-verify4/` | Full run (load + 7 probe records + summary, 2026-09-10T00:49:32Z–00:50:07Z) produced by the retired earlier session's background watcher, which polled nvidia-smi and started medpsy-verify when Cursor.exe briefly left the GPU. Its lease observed NO foreign GPU process (`foreignGpuProcessCount: 0` before and after). Results are identical in kind to 0038Z-verify4 (same thinking lengths 2290/0/1937/4088/213 under seed 42, same probe-d grammar RPCError, valid JSON in d2) and are retained as independent corroboration. |
| 20260910T0106Z-verify5 | `artifacts/evidence/medpsy-verify-20260910T0106Z-verify5/` | Canonical per-record evidence. Same probes with complete per-record fields: model constant/filename/sha256, loadConfig, output digests (sha256 of contentText, thinkingTextSha256 and rawFullTextSha256 when retained), `stopReason` always present (null when the SDK did not supply one), and both before-lease and after-lease observations in every record. Lease observed no foreign GPU process. 6 succeeded, 1 failed (probe d, same grammar RPCError), all retained. |

`20260910T0106Z-verify5` is the canonical citation for per-record evidence; the two verify4
runs corroborate it (identical qualitative outcomes; the 0038Z run additionally evidences that
results hold while a foreign GUI process shares the GPU, with slightly longer wall times:
probe a 15035 ms vs 6054 ms with the GPU uncontended).

## Verified configuration and identity (canonical run: 20260910T0106Z-verify5)

- Asset: `medpsy-1.7b-q4_k_m-imat.gguf`, 1,282,439,360 bytes, sha256
  `41ee947d9cce72ec657577219fd1798fabeabf0d832217fe23c9d6d3d18d5880` (re-verified before load;
  matches SDK 0.18.2 registry constant `HEALTHCARE_1_7B_MEDICAL_Q4_K_M`).
- SDK: @qvac/sdk 0.18.2 exactly (pinned; verified against the manifest).
- Load configuration: `ctx_size 4096, device gpu, gpu_layers 99, main-gpu dedicated, parallel 1, verbosity 0`.
- Load: succeeded on GPU; load wall 4159 ms in verify5 (performance.now around loadModel,
  includes IPC startup; 4370 ms in 0038Z-verify4 with Cursor.exe sharing the GPU).
  `getLoadedModelInfo`: modelType `llamacpp-completion`, displayName `LLM (llama.cpp)`,
  addon `@qvac/llm-llamacpp`, toolDialect `hermes`, handlers batchCompletionStream /
  completionStream / finetune / translate. The chat template text itself is not exposed by
  `getLoadedModelInfo` on this SDK version; only `toolDialect` is observable. (Unverified:
  the exact template string.)
- Decode: `backendDevice: "gpu"` on every completion; native throughput 126.1–129.0 tokens/s in
  verify5 (GPU otherwise idle) versus 70.4–73.5 tokens/s in 0038Z-verify4 (Cursor.exe sharing
  the GPU) — the foreign GUI process roughly halved decode throughput, so verify5 timings are
  the performance reference and the verify4 difference is the measured cost of that sharing.
  `emittedTokens` equalled `generatedTokens` in every run of all three complete executions.

## Verified behaviors (probe by probe; numbers from verify5, identical in kind in both verify4 runs)

1. **Default thinking (a-default-thinking, DEV-01, temp 0 / seed 42 / predict 1024).**
   With no reasoning controls the model thinks: `raw.fullText` contains `<think>…</think>`;
   with `captureThinking: true` the SDK separates it — `final.contentText` contains no think
   markup and `final.thinkingText` (2290 characters here) carries the reasoning.
   594 thinking deltas then 95 content deltas; generated 691 tokens; wall 5777 ms; native
   TTFT 83.9 ms; first content delta at 4970 ms. Visible-answer
   latency in thinking mode is dominated by the reasoning, not the prefill.
2. **reasoning_budget 0 (b1-budget-0, DEV-01).** Fully suppresses thinking: zero thinking
   deltas, `thinkingTextLength` 0, no think markup in raw. Content starts immediately
   (first content 101 ms, native TTFT 87.1 ms); 163 tokens; wall 1410 ms. This is the fast,
   non-reasoning mode and it is prompt-independent (no `/no_think` needed).
3. **reasoning_budget 512 + remove_thinking_from_context (b2, DEV-01).** Thinking is bounded:
   exactly 512 thinking deltas (1937 characters), then content. `remove_thinking_from_context`
   is accepted without error. Wall 5075 ms; first content at 4272 ms.
4. **"/no_think" prompt suffix (c-no-think-suffix, DEV-02).** NOT reliable on this model:
   thinking was not suppressed — 1023 thinking deltas consumed the entire 1024-token predict
   budget, `stopReason: "length"`, and `contentText` came back EMPTY. `/no_think` must not be
   used as a reasoning control for MedPsy.
5. **json_schema + bounded thinking (d-structured-thinking, DEV-03, reasoning_budget 512).**
   FAILED before generation: RPCError `Unexpected empty grammar stack after accepting piece:
   <|im_start|> (151644)`. On SDK 0.18.2 the strict json_schema grammar is incompatible with
   thinking mode for this model. Structured output and thinking cannot be combined. (Identical
   failure in all three complete runs.)
6. **json_schema + reasoning_budget 0 (d2-structured-budget-0, DEV-01).** Succeeded; strict
   schema `chart_review_probe` produced valid parseable JSON (jsonValid true), zero thinking,
   348 tokens, wall 3413 ms, native TTFT 75.8 ms, 127.9 tokens/s. The returned JSON cited only
   permitted evidenceIds (schema enum `C1`/`H1`). The SDK supplied no stopReason on this normal
   completion; records write `stopReason: null` rather than dropping the key.
7. **Termination (e-termination-length, DEV-01, predict 48).** `stopReason: "length"` is
   returned reliably when the predict budget is exhausted. Note the interaction with thinking:
   with default (uncontrolled) thinking the reasoning consumed all 48 tokens and content was
   empty — a `length` stop with empty content. Truncation detection must key on `stopReason`,
   not on content emptiness.

## Recommended configuration for the `review` operation (adopted in A3)

```json
{
  "loadConfig": {"ctx_size": 4096, "device": "gpu", "gpu_layers": 99, "main-gpu": "dedicated", "parallel": 1, "verbosity": 0},
  "generationParams": {"temp": 0, "seed": 42, "predict": 1536, "reasoning_budget": 0},
  "captureThinking": true,
  "responseFormat": "strict json_schema named chart_review, evidenceIds enum limited to the packet"
}
```

Rationale, all from the evidence above: structured output is mandatory for chart review and
thinking breaks the grammar (probe 5), so reasoning is disabled with `reasoning_budget: 0`
(probes 2, 6) rather than `/no_think` (probe 4 shows it fails). `captureThinking: true` is
kept because the verified combination (probe 6 used it) reports thinking as counts/lengths
only (zero with budget 0); thinking text is never retained as clinical evidence. `predict`
1536 is headroom for the largest allowed output (24 findings + 12 clarifications, statements
≤ 600 chars); only `predict` 1024 and 48 were exercised in probes — 1024 sufficed for the
small dev packets with 200+ tokens to spare, and the 6000-character evidence budget (D1)
keeps prompt + 1536 generation inside ctx_size 4096. `temp 0 / seed 42` match the project's
deterministic generation standard.

## What remains unverified

- Thinking mode combined with structured output: broken on SDK 0.18.2 (probe 5); no workaround
  was found or attempted beyond `reasoning_budget: 0`. If thinking is ever wanted for review,
  the grammar interaction must be re-verified on a newer SDK.
- The exact chat template string (only `toolDialect: hermes` is observable).
- Behavior at the full 6000-character evidence budget / largest packets (probes used the small
  dev cases; predict 1536 is chosen headroom, not a measured limit).
- Long-packet latency extrapolation: verify5 timings are from small dev packets on this
  laptop's otherwise-idle GPU; the 0038Z-verify4 run shows Cursor.exe (PID 65412) sharing the
  device roughly halves decode throughput.
- MedPsy-4B and the held-out suite: out of scope for this document (A6).
