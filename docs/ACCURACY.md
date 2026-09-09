# Evaluate transcription and ask approved notes

These controls are available after restarting the updated PC app and unlocking the existing encrypted session. Keep the current vault and passphrase; creating another vault will not recover the current capture.

## Score the capture you already tested

1. Select its patient and encounter. Compare against the displayed source photo.
2. Under **Check the source**, expand **Evaluate extraction with a human reference**.
3. Type the complete visible text into the blank **Human reference transcription** field yourself. Preserve words, numbers, negations and unreadable markers. Do not copy the model output as the reference.
4. Confirm that you transcribed the image and that the capture is entirely synthetic, then click **Save reference & score extraction**.
5. Read word error rate (WER), character error rate (CER) and edit counts. The reference is saved separately and does not alter the reviewed source or approved record. References written after seeing the model output are not blinded evaluations.

Scoring uses the retained original extraction and matching capture/output hashes. If the original output is missing, ambiguous or too large for the bounded alignment, the app says scoring is unavailable. It never substitutes the corrected source or reconstructs missing output. Complete performance evidence is a separate indicator; a score alone cannot pass release acceptance. The human-reference panel does not automatically score clinical meaning.

## Ask about approved notes

1. Open **Approved patient history** for the selected patient.
2. Under **Ask approved notes**, enter a question such as “What is documented about sleep?” and select **Find supporting passages**.
3. Read the quoted passages with their note dates and source revisions. Use the source button to open the approved record.

This lookup is experimental and can omit relevant notes. In the frozen 1.7B source-selection evaluation, only 6/10 questions returned the complete expected passage set, including one missed denial. Review the approved source history before drawing conclusions.

Local QVAC Qwen3 selects relevant approved passages by ID using native structured output. The app obtains their text from its authorized records and displays whole sentences to preserve nearby denials and qualifiers. It does not display uncited model prose, approve an answer or modify clinical records. The coverage line explains how much history was searched. The first implementation uses lexical passage ranking with a bounded recent-note fallback, not an embedding index; synonyms across a large history can be missed. Sentences longer than 800 characters are omitted instead of clipped; the coverage line reports these omissions so you can read the full approved note below. “No answer found” applies to the searched passages.

Questions, authorized context, raw model output and full performance records are retained only inside the encrypted vault. Locking clears the visible query and unfinished reference. Patient changes clear the previous patient's query result. Changing an approved source invalidates citations to that revision.

## Compare another phone capture

The updated Android capture candidate is installed on the Fold with a verified matching APK hash. It requests more image detail and records actual dimensions/settings in encrypted phone storage. It does not guarantee better handwriting recognition. Use the same synthetic physical note, lighting and framing for a controlled comparison, and create a fresh PC encounter/pairing for the new photo. Keep all photos of that note in the development split. A physical photo of handwriting remains separate from the primary printed-note release workflow.

## Reproduce the synthetic development evaluation

`npm run score:transcription -- artifacts/evidence/transcription-dev-baseline-<unique-id>.json` scores the six already-reviewed archived extraction outputs without new inference.

`npm run eval:transcription -- 20260909T-example` writes a frozen protocol and runs six experimental extractions plus four approved-excerpt query cases. Use a new dated ID each time and leave other GPU jobs idle. It runs only the fixed synthetic fixtures, requires native performance evidence and stops on detected competing inference. Existing files are never overwritten. Outputs must be reviewed before committing or sharing; the command does not establish physical or held-out handwriting acceptance.

`npm run check:query-ui` exercises the new controls in a separate synthetic test vault using explicit test doubles; it does not open your current vault or run inference.

See the [scope and promotion rules](plans/qvac-psy/09-accuracy-and-queries.md) and current [Factory status](plans/qvac-psy/00-status.md) for measured results and remaining gates.

The 4B Qwen challenger returned complete expected passages for 6/10 of the same questions, with no aggregate gain and slower native decoding. It was not promoted. A future query prompt version should remove the legacy user-message wording about selecting quotations, which remains in the frozen v3 protocol even though the system/schema require source IDs. No causal claim or retrospective score correction is made from that observation.
