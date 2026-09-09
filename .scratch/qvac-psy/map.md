# QVAC Psy — Wayfinder map

## Destination
A self-contained PsyRec submission: native Fold capture, local VisionPsy extraction, clinician-reviewed documentation, encrypted records and patient-scoped approved-note history. RAG implementation belongs to a teammate; this branch exposes its future integration boundary.

## Notes
- Jeff approved implementation of the proposed plan and slice sequence in this conversation, September 9, 2026. Implementation continues under that authorization; unresolved evidence is not marked passed.
- Work on `QVAC-Psy`; submit one repository per challenge per Jeff's organizer guidance. Keep links relative and preserve MIT attribution.
- PC inference; Fold capture; synthetic English notes; Spanish video. No Pi5 or cloud inference.
- Latest clarification: the doctor browses previous approved notes for the selected patient; later RAG retrieves only authorized, current approved records. Do not create a vector database now.
- Software Factory state: [status](../../docs/plans/qvac-psy/00-status.md).

## Decisions so far
- [Shared component contract](issues/04-shared-contract.md): use an optional retrieval port and validate patient/revision ownership in the application.
- [Approval and recovery rules](issues/05-approval-recovery.md): immutable approvals, source-change invalidation, encrypted atomic saves and idempotent transfers.

## Not yet specified
Final demonstrated performance and device-specific findings will be filled from runtime and Fold evidence. Do not manufacture these facts.

## Out of scope
RAG backend/vector storage, external reference documents, cross-patient retrieval, diagnosis, therapy, full-session/background audio, handwriting guarantees, cloud inference, automatic patient sharing and other challenge applications.
