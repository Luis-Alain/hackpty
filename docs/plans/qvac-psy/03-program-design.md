# Program design

Core service owns patient/encounter binding, source revisions, draft approval, supersession and retrieval validation. Vault owns encryption and durable writes. Capture gateway owns pairing, authentication, bounds and idempotency. Runtime owns QVAC model lifecycle and measured results. Renderer owns no filesystem or network authority.

Public interfaces: `extractImage(input) -> ExtractionResult`, `draftFromSource(input) -> DraftResult`; optional `retrieveApprovedNotes({ patientId, query, signal }) -> RetrievalHit[]`. Hits contain note/revision identifiers and excerpt positions. The service checks ownership, approval, active revision and exact canonical text boundaries before using context.

UI methods: unlock/create vault, create/select patient, import capture, extract/correct source, generate/edit/approve draft, browse approved history/audit, pair/revoke phone. Return serializable data; never expose Electron IPC or arbitrary paths to the renderer.

Tests cover authentication/encryption, atomic reload, wrong passphrases, current-vs-historical separation, stale approvals, cross-patient/revision/malicious retrieval, duplicate transfer conflicts, malformed input and real QVAC fixture execution. Physical capture remains an explicit external-device acceptance test.
