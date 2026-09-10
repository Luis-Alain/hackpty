# Architecture

## Existing foundation and approved target
Electron uses a sandboxed renderer, isolated preload API and private Node application service. QVAC runs in a separate worker process on Windows. Expo Android uses the existing native bridge for capture and an encrypted local pending queue. A paired TLS endpoint accepts authorized capture envelopes only. Keep TypeScript, SDK 0.18.2 and team ancestry intact.

The September 9 target adds MedPsy as the medical text-review model after QVAC VisionPsy extraction and human source correction. This is a design amendment, not a claim that MedPsy integration or performance has passed. See [program design](03-program-design.md) and [implementation status](00-status.md).

## Authority and persistence
The authoritative vault is one authenticated encrypted file with atomic replacement, holding patient metadata, captures, sources, drafts, approved records and device authorization. Unlocked data lives in process memory. QVAC image inputs require bounded temporary files; cleanup limitations remain documented. Runtime model cache is distinct from clinical content.

The application service constructs the model's evidence packet. It binds the selected patient, reviewed current-source revision and explicitly identified approved historical record revisions. It validates ownership, approval, current revision and canonical excerpt boundaries before use and revalidates after inference. Model output never authorizes access, chooses another patient, executes SQL or approves a record.

Existing source-only drafting remains the default. Proposed chart comparison and natural-language history answers use separately identified evidence and disclose the supplied date range and omissions. Any history-informed draft requires an explicit evidence-bound mode. Schema and citation checks verify structure and canonical references; they cannot prove medical entailment.

## Local runtime and retrieval
Evaluate MedPsy-1.7B first and MedPsy-4B as a quality challenger, with exact artifact and load settings recorded. Unload OCR before loading the text model; only one real GPU job runs at a time under the performance evidence owner. Validate reasoning/template behavior against the installed SDK 0.18.2 rather than assuming current online examples match it.

Bounded canonical source selection can support the minimum chart-review demo without adding a vector database. A future retrieval provider supplies identifiers and ranges for service validation; it does not grant patient access or introduce unchecked text. History browsing continues without RAG.

No externally hosted inference or required sibling repository. Models download during provisioning. Private run records remain encrypted; only reviewed synthetic evidence is publishable. Preserve repository portability and the existing phone durability, approval, cancellation, lock and reload guarantees.
