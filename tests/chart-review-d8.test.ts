import test from 'node:test';
import assert from 'node:assert/strict';
import { D8_CONFIGS, extractChartReviewJson } from '../diagnostics/qvac-spike/chart-review-evaluation.js';
import { scoreChartReviewCase } from '../diagnostics/qvac-spike/chart-review-scoring.js';

// Unit doubles only: no model load, no GPU.

test('D8 configuration table matches coordinator decision D8 exactly', () => {
  assert.deepEqual(Object.keys(D8_CONFIGS), ['i', 'ii', 'iii', 'iv']);
  const {i, ii, iii, iv} = D8_CONFIGS;
  // (i) production candidate: MedPsy, reasoning disabled, strict schema, ctx 4096, predict 1536.
  assert.deepEqual([i.modelConstant, i.reasoningBudget, i.predict, i.ctxSize, i.structured, i.captureThinking], ['HEALTHCARE_1_7B_MEDICAL_Q4_K_M', 0, 1536, 4096, true, true]);
  // (ii) MedPsy thinking without grammar: reasoning_budget 1024, predict 2560, ctx 8192.
  assert.deepEqual([ii.modelConstant, ii.reasoningBudget, ii.predict, ii.ctxSize, ii.structured, ii.captureThinking], ['HEALTHCARE_1_7B_MEDICAL_Q4_K_M', 1024, 2560, 8192, false, true]);
  // (iii) Qwen3-1.7B Q4_0 generic configuration, same prompt and budgets as (i).
  assert.deepEqual([iii.modelConstant, iii.reasoningBudget, iii.predict, iii.ctxSize, iii.structured], ['QWEN3_1_7B_INST_Q4', 0, 1536, 4096, true]);
  // (iv) Qwen thinking control, same settings as (ii); quantization difference disclosed.
  assert.deepEqual([iv.modelConstant, iv.reasoningBudget, iv.predict, iv.ctxSize, iv.structured], ['QWEN3_1_7B_INST_Q4', 1024, 2560, 8192, false]);
  assert.equal(iv.quantization, 'Q4_0');
  assert.equal(i.quantization, 'q4_k_m imatrix');
  assert.ok(iv.description.includes('Q4_0 vs q4_k_m'));
  // Structured configs use manifests whose roles the harness verifies; isolated dirs only.
  for (const config of Object.values(D8_CONFIGS)) assert.match(config.manifestDir, /^\.local\//);
});

test('extractChartReviewJson accepts exactly one JSON object', () => {
  const good = extractChartReviewJson('{"schemaVersion":1,"findings":[],"clarifications":[]}');
  assert.equal(good.ok, true);
  assert.equal((good.value as any).schemaVersion, 1);
  const padded = extractChartReviewJson('  \n{"schemaVersion":1,"findings":[],"clarifications":[]}\n');
  assert.equal(padded.ok, true, 'surrounding whitespace is fine (JSON.parse semantics)');
});

test('extractChartReviewJson strips nothing silently', () => {
  for (const bad of [
    'Here is the JSON: {"schemaVersion":1,"findings":[],"clarifications":[]}',
    '```json\n{"schemaVersion":1,"findings":[],"clarifications":[]}\n```',
    '{"schemaVersion":1,"findings":[],"clarifications":[]} trailing prose',
    '[{"schemaVersion":1}]',
    '{"schemaVersion":1,"findings":[],',
    '',
    'null'
  ]) {
    const result = extractChartReviewJson(bad);
    assert.equal(result.ok, false, JSON.stringify(bad.slice(0, 40)));
    assert.equal(typeof result.error, 'string');
  }
});

test('extracted free-form JSON flows into the same strict scorer rules', () => {
  const entry: any = {
    id: 'DEV-DOUBLE', question: null, abstentionExpected: false,
    goldFindings: [{id: 'F1', kind: 'changed', requiredTerms: ['6/10', '2/10'], permittedEvidenceIds: ['C1', 'H1']}],
    expectedClarifications: [], prohibited: []
  };
  const text = '{"schemaVersion":1,"findings":[{"kind":"changed","statement":"Pain decreased from 6/10 to 2/10 with walking.","evidenceIds":["H1","C1"]}],"clarifications":[]}';
  const extraction = extractChartReviewJson(text);
  assert.equal(extraction.ok, true);
  const score = scoreChartReviewCase(entry, ['C1', 'H1'], text);
  assert.equal(score.schemaValid, true);
  assert.equal(score.casePassed, true);
  // Missing schemaVersion is invalid under the same strict rules (contract ChartReviewOutput).
  const noVersion = '{"findings":[{"kind":"changed","statement":"Pain decreased from 6/10 to 2/10.","evidenceIds":["C1"]}],"clarifications":[]}';
  assert.equal(extractChartReviewJson(noVersion).ok, true, 'extraction only checks exactly-one-object');
  assert.equal(scoreChartReviewCase(entry, ['C1'], noVersion).schemaValid, false, 'scorer enforces schemaVersion 1');
});
