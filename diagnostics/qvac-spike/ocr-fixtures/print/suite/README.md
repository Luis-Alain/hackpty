# Chart-review suite print pages — hygiene

Printable A4 sheets for every case of the frozen chart-review suite
(`draft-v1.json` held-out, `dev-v1.json` dev), for photographing with the Fold
and running through the real workflow (capture → VisionPsy extraction → source
correction → MedPsy chart review). Regenerate with:

```
npx tsc -p tsconfig.json --outDir .local/cells/B/dist
node .local/cells/B/dist/diagnostics/qvac-spike/ocr-fixtures/print/suite/generate-suite-pages.js
```

The generator verifies both frozen suite JSONs against the sha256 values in
`diagnostics/qvac-spike/chart-review/suite/REVIEW-LOG.md` section 4 and refuses
to run if either differs. `manifest.json` here records every emitted file with
its sha256, source case id, kind, source date and character count.

## Hygiene rules — read before printing

1. **Held-out cases become "seen" once photographed and run in the app.** The
   camera, lighting, correction and review interactions are not blinded: the
   person running the workflow reads the record text while printing and
   correcting it. A case that has been through the physical workflow can never
   again count as unseen.
2. **Physical runs are demonstration and human-benefit evidence, never
   held-out accuracy.** Accuracy claims for the suite come only from the frozen
   held-out evaluation runs over the JSON cases (see
   `diagnostics/qvac-spike/chart-review/suite/SUITE-SCHEMA.md` §5). A good
   physical result on CR-04 says the workflow helped a reviewer; it is not a
   suite metric.
3. **Do this only after the held-out evaluation runs are complete.** Printing
   and running held-out cases before the frozen evaluation contaminates the
   split for any later measured claim. If in doubt, photograph the dev cases
   (DEV-01..DEV-04) and the reviewer-recommended picks only after the held-out
   runs are archived.
4. Superseded pages (`kind: superseded`) are entered as the original record and
   then superseded in the app; wrong-patient pages (`kind: wrong-patient`) are
   records of another synthetic patient — planted traps. Both are labelled in
   the page footer.
5. Everything is synthetic: every record text begins with
   `SYNTHETIC OUTPATIENT NOTE - NOT A REAL PATIENT`.
