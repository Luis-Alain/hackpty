import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validatePaperSource } from '../scripts/validate-human-review.js';

// Invented schema data for adversarial checks, never a physical observation.
const fixture = () => {
  const binding = { patientId: 'test-patient', encounterId: 'test-encounter', captureId: 'test-photo', sha256: 'a'.repeat(64) };
  const sourceAttestation = { ...binding, actor: 'human', method: 'physical-paper-observation', fixtureId: 'DEMO-001', sourceMedium: 'paper', observedAt: new Date(1000).toISOString() };
  const capture: any = { printedSyntheticEnglishNote: true, sourceMedium: 'paper', sourceAttestation, receipt: binding };
  const receipt: any = { approval: { patientId: binding.patientId }, physicalObservations: [
    { event: 'renderer-input', details: { ...binding, control: 'attestPrintedSource', trusted: true } },
    { event: 'printed-source-attestation', details: { ...sourceAttestation } },
    { event: 'renderer-input', details: { ...binding, control: 'reviewSource', trusted: true } },
  ] };
  return { capture, receipt };
};
test('primary paper source gate binds a human observation to the captured photo before review', () => {
  const { capture, receipt } = fixture();
  assert.doesNotThrow(() => validatePaperSource(receipt, capture));
});
test('primary paper source gate rejects screen capture, inferred provenance and automated confirmation', () => {
  const mutations: Record<string, (value: ReturnType<typeof fixture>) => void> = {
    'screen': v => { v.capture.sourceMedium = 'screen'; },
    'no attestation': v => { delete v.capture.sourceAttestation; },
    'handwriting fixture': v => { v.capture.sourceAttestation.fixtureId = 'SYN-HW-002'; },
    'different photo': v => { v.capture.sourceAttestation.captureId = 'other'; },
    'different patient': v => { v.capture.sourceAttestation.patientId = 'other'; },
    'programmatic attestation': v => { v.receipt.physicalObservations[0].details.trusted = false; },
    'unrecorded attestation': v => { v.receipt.physicalObservations.splice(1, 1); },
    'changed observation': v => { v.receipt.physicalObservations[1].details.observedAt = new Date(2000).toISOString(); },
    'review before attestation': v => { v.receipt.physicalObservations.unshift(v.receipt.physicalObservations.pop()); },
    'programmatic review': v => { v.receipt.physicalObservations[2].details.trusted = false; },
  };
  for (const [label, mutate] of Object.entries(mutations)) {
    const value = fixture(); mutate(value);
    assert.throws(() => validatePaperSource(value.receipt, value.capture), /Paper source evidence:/, label);
  }
});
