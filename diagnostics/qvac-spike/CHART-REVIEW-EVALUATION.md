# Chart-review evaluation (A7) — MedPsy vs Qwen3, four D8 configurations

Date: 2026-09-10. Runner: Kimi Code CLI 0.40.1, alias kimi-code/k3 (runtime self-report
"Kimi / Moonshot AI"). All content is SYNTHETIC and NOT A REAL PATIENT; no clinical
reliability claim is made. Suite: `diagnostics/qvac-spike/chart-review/suite/draft-v1.json`
(16 held-out cases; `SUITE-FROZEN.md` exists, so all runs are labelled
`goldConfirmedByHuman: true`). Scoring: `chart-review-scoring.ts`, implementing
`suite/SUITE-SCHEMA.md` §5 exactly (strict + term coverage, negation-guarded forbidden
terms, abstention both directions, gate-failed cases counted as zero coverage in the
denominators).

## Methods

- Prompt module `packages/runtime/chart-review-prompts.ts`, frozen at
  `psyrec-chart-review-v4` after three dev-split iterations (v2 → v3 → v4; dev runs
  `chart-review-20260910T0125Z-dev-i-1`, `-0139Z-dev-i-2`, `-0143Z-dev-i-3`). The protocol
  of every run records the prompt module sha256, suite sha256, isolated manifest, verified
  asset hashes and the exact load/generation configuration.
- Packet binding `bindChartReviewPacket` (application-bound; superseded and wrong-patient
  records excluded with declared omissions; 6000-character D1 budget; per-text sha256).
- Structured configurations ran through `QvacRuntime.reviewChart` (worker + metrics gate);
  thinking configurations ran through a direct-SDK path in the harness (single lease, single
  load) because the runtime review operation is pinned to the verified structured
  configuration and SDK 0.18.2 cannot combine thinking with the strict grammar (A2 probe d).
  Free-form outputs were scored as-is: `extractChartReviewJson` strips nothing; first-pass
  validity is a scored outcome, raw text always retained.
- Question cases (CR-11 answerable, CR-12 unanswerable) additionally ran through the runtime
  query operation with the same model under test.
- Verifier (read-only): `node .local/cells/A/dist/diagnostics/qvac-spike/verify-chart-review-evaluations.js artifacts/evidence/<prefix>`
  — re-binds packets, re-checks module hashes, D8 table drift, per-case bindings, output
  digests, native metrics, and rescores. All four complete runs print
  `passed-evidence-bindings`.

## Configurations (D8)

| Label | Model (quantization) | Reasoning | Grammar | ctx | predict | Path |
| --- | --- | --- | --- | --- | --- | --- |
| (i) | MedPsy-1.7B q4_k_m imatrix | reasoning_budget 0 | strict json_schema | 4096 | 1536 | runtime reviewChart |
| (ii) | MedPsy-1.7B q4_k_m imatrix | budget 1024, captureThinking | none | 8192 | 2560 | direct SDK |
| (iii) | Qwen3-1.7B Q4_0 | reasoning_budget 0 | strict json_schema | 4096 | 1536 | runtime reviewChart |
| (iv) | Qwen3-1.7B Q4_0 | budget 1024, captureThinking | none | 8192 | 2560 | direct SDK |

Configuration differences are deliberate and disclosed: (ii)/(iv) use a larger context and
predict budget to make room for reasoning; (iii)/(iv) use the production Qwen asset (Q4_0,
not q4_k_m imatrix) as the generic control. Identical prompt module, packet binding and
scorer across all four.

## Results (held-out draft-v1, 16 cases, complete runs)

| Metric (target) | (i) MedPsy structured | (ii) MedPsy thinking | (iii) Qwen structured | (iv) Qwen thinking |
| --- | --- | --- | --- | --- |
| Run prefix (artifacts/evidence/) | chart-review-20260910T0204Z-heldout-i-full | chart-review-20260910T0215Z-heldout-ii-r2 | chart-review-20260910T0204Z-heldout-iii-full | chart-review-20260910T0215Z-heldout-iv-r2 |
| Cases run | 16/16 | 16/16 | 16/16 | 16/16 |
| goldRecallStrict (≥ 0.80) | **0.133** (4/30) | 0.133 (4/30) | **0.333** (10/30) | 0.100 (3/30) |
| goldRecallTerms (reported beside strict per D2) | 0.367 (11/30) | 0.267 (8/30) | 0.667 (20/30) | 0.100 (3/30) |
| Forbidden-term violation cases (0 required) | 0 | 0 | 0 | 0 |
| First-pass schema validity (1.0 required) | **1.0** (16/16) | 0.9375 (15/16) | **1.0** (16/16) | 0.125 (2/16) |
| Unauthorized citation cases | 0 | 1 | 0 | 14 |
| Abstention accuracy, review side (1.0 required) | 0.5 | 0.5 | 0.5 | 0 |
| Query-side abstention (CR-11 answer / CR-12 abstain) | correct / wrong | correct / wrong | correct / correct | correct / correct |
| Clarification recall | 0.7 (7/10) | 0.2 (2/10) | 0.6 (6/10) | 0 (0/10) |
| Cases passed (§5.6) | 1 (CR-14) | 1 (CR-14) | 3 (CR-04, CR-14, CR-15) | 0 |
| Truncations (stopReason length) | 0 | 0 | 0 | 0 |
| Load wall ms (avg; ii/iv single load) | 4873 | 8009 | 5191 | 7115 |
| Native TTFT ms (avg, SDK timeToFirstToken) | 171 | 214 | 179 | 203 |
| Native tokens/s (avg) | 118.4 | 100.7 | 118.3 | 102.0 |
| Prompt / generated / emitted tokens (avg) | 825 / 191 / 191 | 821 / 1084 / 1084 | 808 / 273 / 273 | 804 / 1201 / 1201 |
| Thinking chars (avg; counts/lengths only) | 0 | 3578 | 0 | 4070 |
| Visible-answer latency ms (avg, first content delta) | 217 | 11258 | 218 | 10503 |
| Completion wall ms (avg) | 1940 | 12924 | 2859 | 13110 |

Term-only recall well above strict recall (i: 0.367 vs 0.133; iii: 0.667 vs 0.333) shows the
dominant failure is kind/citation precision, not finding the facts: models often name the
right fact with the wrong `kind` or cite only one side of a comparison.

## Failures and retries (all retained)

- Dev iteration: three runs (`-dev-i-1`, `-dev-i-2`, `-dev-i-3`); dev-i-2 produced the only
  forbidden-term violation of the session ("test was ordered", unguarded reversal, DEV-04);
  v4 eliminated it on dev.
- `chart-review-20260910T0148Z-heldout-i` and `-0150Z-heldout-i-r2`: partial — the desktop
  Electron app (PID 60612) spawned QVAC runtime workers (PIDs 60008, 39564, 51476) mid-run;
  the D7 lease cancelled one in-flight case and refused the rest. No process was killed or
  signalled; a watcher waited for three consecutive clear lease checks before the full
  reruns. Partial runs are kept with their failed-case records.
- `chart-review-20260910T0152Z-heldout-i` / `-iii`: also partial (lease refusals); superseded
  by the `-full` reruns. Kept.
- Scorer denominator fix mid-session: gate-failed cases now count their gold as uncovered
  (SUITE-SCHEMA §5.1 "scores zero coverage"). Configs (ii)/(iv) were rerun as `-r2` to record
  scores under the fixed scorer; the earlier complete runs (`-0152Z-heldout-ii`, `-iv`) are
  retained and their raw outputs are bit-identical to the reruns (16/16 identical output
  sha256 — expected at temp 0, seed 42, and useful determinism evidence). Configs (i)/(iii)
  had schemaValidRate 1.0, so their stored scores are unaffected and still verify.

## Evidence completeness note (fix round 3)

GLM's verification of run 3 (`verify3-glm.txt`, `verify3-evidence.txt` SS3) found one genuine,
previously undisclosed defect: `packages/runtime/worker.ts` built `metrics.output` with
`...(final.stopReason?{stopReason:final.stopReason}:{})`, which silently dropped the
`stopReason` key whenever the SDK returned none. This affected every case that ran through
`QvacRuntime.reviewChart` — i.e. the structured configurations (i) and (iii) above — so all
32 of their held-out records (`chart-review-20260910T0204Z-heldout-i-full` and
`-heldout-iii-full`, 16 cases each) carry no `stopReason` key anywhere in
`review.metrics.output`. The direct-SDK path used by (ii)/(iv) already wrote
`stopReason: final.stopReason ?? null` explicitly and is unaffected. The read-only verifier's
key-presence assertion previously existed only on the (ii)/(iv) branch, so this gap passed
verification silently.

This does **not** change any reported number. Truncation for (i) and (iii) is independently
evidenced two other ways: no case in either run shows a length-style stop (the scorer's
`stopReason === 'length'` check is `false` for both `undefined` and `null`, and no case failed
on that basis), and average generated tokens are far below the 1536-token `predict` budget for
both configurations (191/1536 for (i), 273/1536 for (iii) — see the results table). The
reported `Truncations (stopReason length): 0` for these two columns is therefore corroborated
by output size, not solely by key absence.

Fix (this round): `packages/runtime/worker.ts` now always writes
`stopReason: final.stopReason ?? null` (never conditionally spread), `packages/runtime/types.ts`
declares `stopReason: string | null` (never optional), and the harness
(`chart-review-evaluation.ts`) now stamps every protocol it writes with
`stopReasonKeyGuaranteed: true`. The read-only verifier now asserts key presence on the
structured path too, scoped to records produced after this fix (`stopReasonKeyGuaranteed` or a
newer prompt version); the four records above predate the fix and print a named warning instead
of failing (see `verify-chart-review-evaluations.ts` header comment). All four evidence groups
remain retained unchanged — nothing under `artifacts/evidence/` was edited.

## D7 disclosure

The four complete held-out runs observed **no** foreign GPU process (leases before/after
empty; the nvidia-smi compute list held only the run's own workers). Earlier the same evening,
`medpsy-verify-20260910T0038Z-verify4` ran while Cursor.exe (PID 65412) shared the GPU and
showed roughly halved decode throughput (see MEDPSY-RUNTIME.md); no chart-review scoring run
was executed under that condition. The lease refusals above were foreign *runtime* processes
(the desktop app's workers), which always abort the lease — behavior worked as designed.

## Verdict against the predeclared targets

Targets: goldRecallStrict ≥ 0.80, zero forbidden-term hits, first-pass schema validity 1.0,
abstention correct on every abstention case.

- **No configuration meets the targets.** Zero violations is met by all four; schema validity
  1.0 is met by (i) and (iii); recall and abstention fail everywhere.
- **(iii) Qwen3-1.7B Q4_0 structured is the strongest measured configuration** (strict 0.333,
  term 0.667, 3 cases passed, both query abstentions correct) and still falls far short of
  the recall gate.
- **MedPsy-1.7B shows no specialization advantage on this suite** — it trails the generic
  Qwen in both modes (structured 0.133 vs 0.333; thinking 0.133 vs 0.100 with far worse
  citation discipline for Qwen-thinking). Under the D5 note ("adoption depends on the A6
  gates"), the gates do not pass for the MedPsy review role.
- Recommendation: keep source-only drafting as the release default; do not adopt the chart
  review operation (neither MedPsy nor Qwen) as a shipped clinical feature on this evidence.
  If the track needs a reviewed-config story, (iii) is the least-bad measured option and its
  records are complete and verifiable. Thinking mode is not viable for structured output on
  SDK 0.18.2 (grammar incompatibility when combined; undisciplined citations without it).
- Residual risks (per D4): CR-15 P2 and CR-06 P1 wording pending Jeff's decision; CR-16
  "omit" wording is a documented residual risk. CR-16 (truncation/budget) did not pass under
  any configuration; CR-14 (superseded) passed under (i), (ii) and (iii) — see per-case records.

## Verifier commands

```
node .local/cells/A/dist/diagnostics/qvac-spike/verify-chart-review-evaluations.js artifacts/evidence/chart-review-20260910T0204Z-heldout-i-full
node .local/cells/A/dist/diagnostics/qvac-spike/verify-chart-review-evaluations.js artifacts/evidence/chart-review-20260910T0215Z-heldout-ii-r2
node .local/cells/A/dist/diagnostics/qvac-spike/verify-chart-review-evaluations.js artifacts/evidence/chart-review-20260910T0204Z-heldout-iii-full
node .local/cells/A/dist/diagnostics/qvac-spike/verify-chart-review-evaluations.js artifacts/evidence/chart-review-20260910T0215Z-heldout-iv-r2
```

All four print `passed-evidence-bindings` (checked 2026-09-10 ~02:25 UTC, scorer fixed).
