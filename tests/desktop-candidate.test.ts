import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildPhysicalCandidate } from '../apps/desktop/physical-candidate.js';

// Invented schema state using already-public synthetic metrics, never a physical receipt.
function example() {
  const desktop = JSON.parse(readFileSync('artifacts/evidence/desktop-workflow.json', 'utf8'));
  const extraction = { ...desktop.runs[0], outputText: desktop.source.extracted };
  const draft = { ...desktop.runs[1], outputText: desktop.steps.find(s => s.operation === 'real-bounded-draft').evidence.text };
  const encounterId = extraction.encounterId;
  const sessionId = 'physical-printed-20260909T200000Z-test123';
  const receipt = { deviceId: 'synthetic-test-device', transferId: 'synthetic-test-transfer', encounterId, captureId: 'synthetic-test-capture', sha256: extraction.metrics.request.attachment.sha256, receivedAt: '2026-09-09T20:00:00.000Z' };
  const record = { id: 'synthetic-test-record', patientId: 'synthetic-test-patient', encounterId, sourceRevision: draft.sourceRevision, sourceText: desktop.source.corrected, text: desktop.approval.exactText, draftId: 'synthetic-test-draft', modelDraftText: draft.outputText, clinicianEdited: true, approvedAt: '2026-09-09T20:00:02.000Z', supersededAt: null, context: [], extractionMetrics: extraction.metrics, draftingMetrics: draft.metrics };
  const state: any = {
    version: 1, patients: [{ id: record.patientId, alias: 'SYNTHETIC PRINTED DEMO-001', createdAt: receipt.receivedAt }], records: [record], devices: [{ tokenHash: 'NEVER-EXPORT-TOKEN', token: 'NEVER-EXPORT-CREDENTIAL' }],
    encounters: [{ id: encounterId, patientId: record.patientId, capture: { id: receipt.captureId, sha256: receipt.sha256, data: 'NEVER-EXPORT-PHOTO' }, source: { text: record.sourceText, revision: record.sourceRevision, reviewed: true }, draft: null, status: 'approved' }],
    transfers: [receipt], runs: [extraction, draft], transportIdentity: { key: 'NEVER-EXPORT-KEY', cert: 'NEVER-EXPORT-CERT' },
    physicalObservations: [
      { at: receipt.receivedAt, event: 'session-prepared', details: { sessionId, fixtureId: 'DEMO-001', observerEnabled: true, endpoint: 'NEVER-EXPORT-LAN' } },
      { at: receipt.receivedAt, event: 'printed-source-attestation', details: { actor: 'human', method: 'physical-paper-observation', fixtureId: 'DEMO-001', sourceMedium: 'paper', observedAt: receipt.receivedAt, patientId: record.patientId, encounterId, captureId: receipt.captureId, sha256: receipt.sha256 } },
      { at: record.approvedAt, event: 'operation-completed', details: { method: 'unlock', result: { records: [record], encounters: [{ capture: { data: 'NEVER-EXPORT-PHOTO' } }], devices: [{ tokenHash: 'NEVER-EXPORT-TOKEN' }] } } },
    ],
  };
  const options = { encounterId, sessionId, observerFailed: false, vaultEnvelope: JSON.stringify({ version: 1, kdf: 'scrypt', cipher: 'aes-256-gcm', salt: 'opaque', iv: 'opaque', tag: 'opaque', data: 'opaque' }), reviewedSynthetic: true as const };
  return { state, options, extraction, draft };
}

test('candidate export retains exact public synthetic run evidence, excludes private storage fields, and cannot claim incomplete acceptance', () => {
  const { state, options, extraction, draft } = example();
  const before = structuredClone(state);
  const result = buildPhysicalCandidate(state, options);
  assert.equal(result.physicalFoldAcceptance, false);
  assert.equal(result.clinicianHumanAcceptance, false);
  assert.equal(result.completedAt, null);
  assert.equal(result.reviewPreview.gatePassedWithReviewedFlags, false);
  assert.ok(result.reviewPreview.failures.length >= 2);
  assert.deepEqual(result.runs, [extraction, draft]);
  assert.equal(result.source.extracted, extraction.outputText);
  assert.equal(result.steps.find(s => s.operation === 'real-bounded-draft').evidence.text, draft.outputText);
  assert.equal(result.steps.find(s => s.operation === 'exact-approval-encrypted-save').evidence.actor, 'unconfirmed');
  assert.equal(JSON.stringify(result).includes('NEVER-EXPORT-'), false);
  assert.deepEqual(state, before);
  assert.equal(buildPhysicalCandidate(state, { ...options, observerFailed: true }).physicalObservationFailed, true);
});

test('candidate export refuses unrelated clinical state, unmatched sessions, and missing canonical raw output', () => {
  const noSession = example(); noSession.state.physicalObservations.shift();
  assert.throws(() => buildPhysicalCandidate(noSession.state, noSession.options), /session preparation/);
  const extra = example(); extra.state.encounters.push({ id: 'unrelated', capture: null, source: { text: 'Unrelated source' } });
  assert.throws(() => buildPhysicalCandidate(extra.state, extra.options), /one synthetic clinical encounter/);
  const noRaw = example(); delete noRaw.state.runs[0].outputText;
  assert.throws(() => buildPhysicalCandidate(noRaw.state, noRaw.options), /never reconstructed/);
  const noPaper = example(); noPaper.state.physicalObservations = noPaper.state.physicalObservations.filter(e => e.event !== 'printed-source-attestation');
  assert.throws(() => buildPhysicalCandidate(noPaper.state, noPaper.options), /printed synthetic/);
});
