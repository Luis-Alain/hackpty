import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateHumanReview } from '../scripts/validate-human-review.js';

// Invented schema fixture only. Never exported as physical acceptance evidence.
function observations() {
  const source = 'Synthetic corrected source';
  const approved = '  Synthetic exact approval  ';
  const target = { patientId: 'test-patient', encounterId: 'test-encounter' };
  const draft = { ...target, sourceRevision: 2, outputText: 'Synthetic model draft', metrics: { runId: 'test-run' } };
  const record = { ...target, id: 'test-record', draftId: 'test-draft', sourceRevision: 2, sourceText: source, text: approved };
  const events: any[] = [];
  const add = (event: string, details: any) => events.push({ at: new Date(1000 + events.length).toISOString(), event, details });
  const input = (control: string, extra = {}) => add('renderer-input', { ...target, eventType: 'click', trusted: true, control, sourceText: source, draftText: approved, approvalChecked: true, ...extra });
  const op = (method: string, result: any) => add('operation-completed', { method, result });
  input('confirmCorrection');
  op('reviewSource', { reviewed: true, revision: 2, text: source });
  op('generateDraft', { id: 'test-draft', sourceRevision: 2, metrics: draft.metrics });
  input('approve');
  op('approve', record);
  input('historyToggle');
  add('renderer-view', { patientId: target.patientId, historyVisible: true, historyText: approved, canonicalApprovedRecords: [record] });
  input('patient', { eventType: 'change' });
  add('renderer-view', { patientId: 'other-test-patient', historyVisible: true, historyText: 'No approved notes for this patient.', canonicalApprovedRecords: [] });
  input('lock');
  add('lock-renderer-purge', { workspaceHidden: true, fields: true, content: true, images: true });
  op('unlock', { records: [record] });
  add('renderer-view', { patientId: target.patientId, approvedReadOnly: true, approvedText: approved });
  return {
    receipt: { physicalObservationFailed: false, source: { extracted: 'Synthetic raw source', corrected: source }, steps: [{ operation: 'real-bounded-draft', evidence: { text: draft.outputText } }], approval: { ...target, recordId: record.id, exactText: approved }, physicalObservations: events },
    extraction: { outputText: 'Synthetic raw source' }, draft,
  };
}
test('human review gate links ordered trusted inputs to canonical encrypted records', () => {
  const { receipt, extraction, draft } = observations();
  assert.doesNotThrow(() => validateHumanReview(receipt, extraction, draft));
});
test('human review gate rejects fabricated flags, missing raw output, automation and disconnected approvals', () => {
  const mutations: Record<string, (r: ReturnType<typeof observations>) => void> = {
    'missing observer status': r => { delete r.receipt.physicalObservationFailed; },
    'observer failure': r => { r.receipt.physicalObservationFailed = true; },
    'missing raw output': r => { delete r.extraction.outputText; },
    'programmatic approval': r => { r.receipt.physicalObservations[3].details.trusted = false; },
    'unchecked exact approval': r => { r.receipt.physicalObservations[3].details.approvalChecked = false; },
    'other source': r => { r.receipt.physicalObservations[0].details.sourceText = 'another source'; },
    'different draft': r => { r.receipt.physicalObservations[2].details.id = 'other-draft'; r.receipt.physicalObservations[2].details.result.id = 'other-draft'; },
    'wrong history record': r => { r.receipt.physicalObservations[6].details.canonicalApprovedRecords = []; },
    'patient leak': r => { r.receipt.physicalObservations[8].details.canonicalApprovedRecords = [{ id: 'leak' }]; },
    'missing purge': r => { r.receipt.physicalObservations[10].details.images = false; },
    'changed reload': r => { r.receipt.physicalObservations[11].details.result = { records: [] }; },
    'editable reload': r => { r.receipt.physicalObservations[12].details.approvedReadOnly = false; },
    'out of order': r => { r.receipt.physicalObservations.reverse(); },
  };
  for (const [name, mutate] of Object.entries(mutations)) {
    const r = observations(); mutate(r);
    assert.throws(() => validateHumanReview(r.receipt, r.extraction, r.draft), /Human review evidence:/, name);
  }
});

test('assistant navigation is explicitly attributed and cannot replace human clinical approval', () => {
  const { receipt, extraction, draft } = observations();
  receipt.physicalObservations[7].details.trusted = false;
  receipt.physicalObservations[9].details.trusted = false;
  assert.throws(() => validateHumanReview(receipt, extraction, draft));
  const annotated = { ...receipt, navigationVerification: { actor: 'assistant', method: 'PsyRec diagnostic interface', startedAt: receipt.physicalObservations[7].at } };
  assert.doesNotThrow(() => validateHumanReview(annotated, extraction, draft));
  receipt.physicalObservations[3].details.trusted = false;
  assert.throws(() => validateHumanReview(annotated, extraction, draft), /trusted exact approval/);
});
