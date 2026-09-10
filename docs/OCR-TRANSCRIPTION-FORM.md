# Blinded human transcription form — paper photos (OCR evaluation)

A paper photo is scored only against a human reference transcription that you
(the user) write **before any model output for that photo is shown to you**.
A reference written after seeing model output is not a blinded evaluation and
must not be used for scoring. Method identifier: `human-transcription-from-paper`.

Everything you transcribe here is synthetic and not a real patient.

## Before you start

1. Print the fixture page (one A4 sheet):
   - `diagnostics/qvac-spike/ocr-fixtures/print/print-synthetic-ocr-stress-01.html`
   - `diagnostics/qvac-spike/ocr-fixtures/print/print-synthetic-ocr-mask-01.html`
   - `diagnostics/qvac-spike/fixtures/print-synthetic-chart-A-2026-09-09.html`
2. Photograph the printed page with the Fold app as usual.
3. Do **not** run extraction, and do **not** open any screen that shows model
   output for this capture, until your transcription is saved.

## Transcribe, line by line

Work from the printed paper (not the screen), top to bottom:

1. Copy each visible line **exactly**: same words, numbers, units, punctuation
   and capitalization. Do not correct, normalize, expand abbreviations or
   paraphrase. If the paper wraps a long line, join it back into one line.
2. For any line you cannot read — including the deliberately masked black bar
   in `syn-ocr-mask-01` — write exactly `[unclear]` for that line. Never guess
   or reconstruct hidden text.
3. Preserve negations (`Denies ...`, `No ...`) and numbers with units exactly
   as printed (e.g. `142/88 mmHg`, `79.5 kg`, `5 mg`).
4. When finished, record: date/time, lighting conditions, and anything unusual
   about the print or photo.

## Enter the transcription

Two equivalent routes; use one per capture:

- **In the app (preferred during the physical run):** select the patient and
  encounter, open **Check the source → Evaluate extraction with a human
  reference**, paste your transcription into **Human reference transcription**,
  confirm you transcribed the image and that the capture is entirely synthetic,
  then **Save reference & score extraction** (see `docs/ACCURACY.md`). The
  reference is stored separately and never alters the reviewed source.
- **In the manifest (for offline scoring with `ocr-score.ts`):** open
  `diagnostics/qvac-spike/ocr-fixtures/manifest.json`, find the fixture entry
  whose `file` matches your photo (e.g. `syn-ocr-stress-01-paper-photo-01`),
  paste the transcription into its empty `humanTranscription` field, set
  `status` to `ready`, and fill in the photo's `sha256`
  (`sha256sum <photo>`). Do not edit any other field. Keep photos of the same
  note in the split already registered for that `noteId`.

## After the reference is saved

Only then run or view the extraction. Cell A runs the OCR evaluation runner;
scoring reports WER, CER, edit counts and the clinically important rule checks
listed in the manifest. Missing mandatory metrics fail the run; failures are
retained as records, not deleted.
