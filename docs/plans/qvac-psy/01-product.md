# Product: PsyRec

## Design decision — September 9, 2026
Make MedPsy central to a private clinician chart-review and documentation assistant. This is the approved product direction; implementation and acceptance remain separately tracked in [status](00-status.md). Existing Qwen results are not MedPsy evidence. The Track 2 emphasis comes from the user's brief; this document does not establish competition eligibility.

## Problem and core question
Clinicians need to turn their notes into a reviewable record and distinguish this session from patient history: **What changed since the previous visit, and what still needs clarification?**

QVAC VisionPsy extracts text from a captured note. The clinician verifies and corrects that text. MedPsy then structures documented facts, compares dated evidence, identifies unresolved questions and produces a concise source-linked brief or documentation draft. Medical interpretation must preserve negation, uncertainty, medication status and who reported each fact. It cannot supply a missing dose, invent a reason for a change or resolve contradictory records by guessing.

Natural-language questions operate on the selected patient's approved, current record revisions with explicit coverage. A response can say that the supplied records do not document an answer. A question or chart brief never writes to the clinical record automatically.

## Smallest demonstration
Use two dated, entirely synthetic English outpatient records and a fresh physical photograph of a printed synthetic note. Show encrypted phone transfer, source correction, a MedPsy comparison with supporting passages, an unanswered question, a bounded draft, exact clinician approval, encrypted save/reload and selected-patient approved history. Current-source drafting remains source-only by default; any history-informed document explicitly identifies the historical evidence used.

The handwritten-note accuracy problem has a separate OCR evaluation. MedPsy is a text model and cannot verify handwriting it has not seen. Handwriting fixtures are exploratory evaluation inputs, not trained models or general handwriting acceptance.

## Success measures
Compare supported factual coverage, critical errors, citation accuracy, appropriate abstention, clinician corrections and review time against the current generic-model workflow. Record complete native performance evidence. Published model benchmarks motivate evaluation; they do not establish PsyRec accuracy or clinical validation. The [program design](03-program-design.md) defines comparisons and acceptance gates.

## Screens
Pair/unlock; selected-patient workspace with capture and source correction; dated chart changes and clarification questions with source links; read-only history questions; draft review and exact approval; previous approved notes and audit revisions. Show the actual model identity, evidence coverage and unapproved state. Keep the synthetic research-prototype scope visible.

## Scope
General outpatient English documentation with clinician review. No autonomous diagnosis, treatment recommendations, therapy, crisis support or patient chatbot. External-corpus RAG, Philips voice and phone-local inference remain future work.
