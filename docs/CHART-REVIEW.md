# Review a chart: what changed, what still needs clarification

The chart review is available after restarting the updated PC app and unlocking the existing encrypted session. It answers one bounded question over the current reviewed source plus the selected patient's current approved history: **what changed since the previous visit, and what still needs clarification?**

## Run a chart review

1. Select the patient and the encounter whose source you already checked.
2. Confirm the reviewed source first; the **Chart review (MedPsy, read-only, unapproved)** panel appears only after that confirmation.
3. Select **What changed since the previous visit?** Inference runs locally on this PC.
4. Read the coverage line first: how many of the patient's current approved records were supplied, the documented date range, and every omission imposed by the evidence limits.
5. Findings are grouped as New, Changed, Unchanged, Resolved, Conflict and Unknown/not documented. Clarification questions carry their reasons. Every statement shows evidence chips (C1 for the current source, H1–H6 for approved history); a chip opens the exact supporting passage with its documented date and record.

A permanent notice applies at all times: **Read-only assistance. Nothing here enters the record until you approve a document.** Chart review results never appear in approved history, are never used as draft text and cannot approve anything. Source-only drafting stays the default. The history-informed draft mode is **not implemented** in this release.

## What the model sees — and what it cannot do

The application builds the evidence packet and validates before and after inference. The model cannot select patients, run queries, grant access or approve records; it receives only the bound packet and may cite only the evidence IDs inside it. Output is validated strictly (schema, authorized evidence IDs, bounded counts and lengths) and rejected in full on any violation. After inference the app re-checks that the reviewed source and every cited approved record are unchanged; otherwise the result is rejected. Raw output, packets and measurements are retained only inside the encrypted vault.

Evidence limits, always disclosed in the coverage line:

- The current reviewed source is supplied in full. If it alone exceeds the **6000-character total evidence budget**, the review is refused with a clear message and recorded as rejected — the current source is never silently truncated.
- Up to **6 approved records** are candidates, the most recent ones, added oldest to newest; older records are listed as omitted.
- Each historical record contributes a sentence-bounded excerpt of at most **2000 characters** from the start of the note. Sentences are never clipped; a truncated excerpt and a first sentence that alone exceeds the limit are both listed as omissions.
- Historical excerpts are added only while the **6000-character total** (current source plus excerpts) holds; records that no longer fit are listed as omitted with their record id, date and the reason "evidence budget".
- The documented visit date is an ISO date (YYYY-MM-DD) on one of the first three lines of a note, otherwise the approval date.

When no approved history exists, the panel says so explicitly; findings are then bound to the current source only, and "unknown / not documented" is the honest result for anything the evidence does not cover.

## Honest limitations

- **Unapproved assistance, not a record.** Approving a document remains a separate clinician action over the reviewed source.
- **Coverage is bounded.** Content beyond the 2000-character excerpts, in records past the 6-record limit or the 6000-character total budget, or never approved is invisible to the model. Read omissions before trusting a "changed" or "resolved" statement.
- **Small local model.** MedPsy-class small models can miss changes, misread negations or propose irrelevant clarifications. Evaluation with the real runtime is **pending Cell A's measured results**; this document describes the workflow and its safeguards, not measured accuracy. Claims of correctness require the evaluation evidence, and the full workflow acceptance target remains separate.
- **No diagnosis.** Findings and questions are documentation comparisons, not clinical advice.

Locking the vault purges the visible review and discards any in-flight result. Switching patients clears the panel. Changing the reviewed source or superseding a cited approved record invalidates the bound result; the panel asks for a new review against the current chart.

## Automated checks

`node .local/cells/C/dist/apps/desktop/chart-review-ui-check.js` exercises the panel in a separate synthetic test vault under `.local/cells/C/ui-check/` using explicit test doubles; it does not open any existing vault, load a model or use the GPU, and it writes labelled test-double screenshots plus a summary.json. Unit-level evidence lives in `tests/chart-review-core.test.ts` and `tests/human-review-cases.test.ts`.

See the [accuracy and query plan](plans/qvac-psy/09-accuracy-and-queries.md) and current [Factory status](plans/qvac-psy/00-status.md) for measured results and remaining gates.
