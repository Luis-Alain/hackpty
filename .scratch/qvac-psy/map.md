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

## Current evidence and remaining acceptance
Connected desktop performance and clinical review are verified in the [desktop workflow receipt](../../artifacts/evidence/desktop-workflow.json). Runtime quality review records an unreadable-line omission; image/source correction stays mandatory. The native Android APK builds locally; physical Fold capture and full release acceptance remain open. Follow Factory status for current evidence rather than the historical handoff's unfinished code inventory.

The later [physical SYN-HW-002 workflow](../../artifacts/evidence/physical-fold-exploratory-provisional.json) has complete independently verified performance and human approval but remains provisional because of explicit observer/phone evidence gaps. The [recovery checkpoint](../../docs/handoffs/2026-09-09-recovery-checkpoint.md) records the desktop navigation fix, Expo project link, assisted reload and continuation boundaries.

The [current AIOS continuation](../../docs/handoffs/2026-09-09-aios-continuation.md) reconciles implementation `98ce270`, the latest built versus installed Android APK and the now-committed iPhone port. The iOS simulator build is FINISHED with four Swift tests and native compilation; [physical iPhone signing/testing](../../apps/mobile/docs/ios-xcode-handoff.md) remain open. Expo linking and Electron patching are already complete. Phone-local inference remains a separate unimplemented plan.

## Out of scope
RAG backend/vector storage, external reference documents, cross-patient retrieval, diagnosis, therapy, full-session/background audio, handwriting guarantees, cloud inference, automatic patient sharing and other challenge applications.
