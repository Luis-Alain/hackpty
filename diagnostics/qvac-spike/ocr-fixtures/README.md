# OCR fixtures (Cell B, Track 2)

Synthetic-only fixture registry for OCR/transcription evaluation of printed and
paper-photographed notes. Nothing here is a real patient record; every note text
carries `SYNTHETIC` and `NOT A REAL PATIENT`.

## Layout

- `manifest.json` — the registry. One entry per fixture: `id`, `noteId`, `medium`
  (`printed-bitmap` | `paper-photo` | `handwriting-style`), `file` + `sha256`,
  `status`, reference (`groundTruth` for authored printed bitmaps,
  `humanTranscription` for paper photos), `split` (`development` | `held-out`),
  and clinically important error `rules` reusing the `ClinicalRule` shape from
  `packages/runtime/transcription-scoring.ts` (numbers with units, dates,
  negations, medication names with dose, `[unclear]` markers).
- `generate-bitmaps.ts` — deterministic renderer for the printed bitmaps (same
  5x7 bitmap-font PNG approach as `../fixture.ts`, extended with digits 2-9 and
  `/`). Regenerate with
  `node .local/cells/B/dist/diagnostics/qvac-spike/ocr-fixtures/generate-bitmaps.js`
  after a cell-local compile. Rendering is asserted deterministic (double-render
  hash match); the recorded `sha256` in `manifest.json` is the integrity anchor.
- `bitmaps/` — generated printed-bitmap PNGs (`syn-ocr-stress-01.png`,
  `syn-ocr-mask-01.png`).
- `print/` — printable A4 HTML pages matching the bitmap notes
  (`print-synthetic-ocr-stress-01.html`, `print-synthetic-ocr-mask-01.html`).
  The chart-record print pages live at `../fixtures/print-synthetic-chart-A-*.html`.
- `photos/` — created when the user captures paper photos during the physical
  run; entries are pre-registered in the manifest with `status:
  awaiting-capture` and an empty `humanTranscription`.

## Split discipline

All media of the same note (bitmap + every photo of the same printing) share one
`noteId` and must stay in the same split. `syn-ocr-mask-01` is `held-out`; the
other notes are `development`. Held-out fixtures are excluded from prompt or
preprocessing tuning and are run only for final measured claims.

## Reference discipline

- Printed bitmaps: the authored text is ground truth; for `syn-ocr-mask-01` the
  masked line's reference is exactly `[unclear]` and the hidden text is excluded
  from every reference.
- Paper photos: the ONLY scoring reference is the user's blinded human
  transcription, entered BEFORE any model output is shown (method
  `human-transcription-from-paper`). Procedure: `docs/OCR-TRANSCRIPTION-FORM.md`.
  References written after seeing model output are not blinded evaluations.

## Running

Cell B does not run inference. The runner (`../ocr-evaluation.ts`) is executed
only by Cell A under the GPU lease; the scorer (`../ocr-score.ts`) scores
archived outputs without inference. See `tests/ocr-fixtures.test.ts` for
manifest integrity checks.
