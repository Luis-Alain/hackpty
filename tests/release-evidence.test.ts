import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateWorkflow } from '../scripts/validate-release.js';

const actual = () => JSON.parse(readFileSync('artifacts/evidence/desktop-workflow.json', 'utf8'));
test('reviewed connected desktop evidence passes its scope and cannot establish physical Fold acceptance', () => {
  assert.equal(validateWorkflow(actual(), false).status, 'passed');
  assert.throws(() => validateWorkflow(actual()), /Physical Fold/);
});

test('workflow evidence rejects disconnected input, prompts, patient history, approval and reload', () => {
  const mutations: Record<string, (receipt: any) => void> = {
    'missing metrics': r => { delete r.runs[0].metrics.native.tokensPerSecond; },
    'failed run': r => { r.runs[0].status = 'failed'; },
    'duplicate run': r => { r.runs.push(structuredClone(r.runs[0])); },
    'different encounter': r => { r.runs[1].encounterId = 'other-encounter'; },
    'different input image': r => { r.steps.find(s => s.operation === 'imported-synthetic-image').evidence.sha256 = '0'.repeat(64); },
    'altered extraction': r => { r.source.extracted += ' invented'; },
    'altered correction': r => { r.steps.find(s => s.operation === 'source-correction-review').evidence.correctedText += ' invented'; },
    'extra source in prompt': r => { r.runs[1].metrics.request.history.find(m => m.role === 'user').content += '\nExtra source'; },
    'different reviewed revision': r => { r.steps.find(s => s.operation === 'source-correction-review').evidence.sourceRevision++; },
    'altered approval': r => { r.approval.exactText = r.approval.exactText.trim(); },
    'altered reload': r => { r.approval.reloadedSha256 = '0'.repeat(64); },
    'hidden patient history': r => { r.steps.find(s => s.operation === 'selected-patient-approved-history').evidence.selectedPatientRecordVisible = false; },
    'stale private image on lock': r => { r.lockPurge.images = false; },
  };
  for (const [name, mutate] of Object.entries(mutations)) {
    const receipt = actual(); mutate(receipt);
    assert.throws(() => validateWorkflow(receipt, false), undefined, name);
  }
});
