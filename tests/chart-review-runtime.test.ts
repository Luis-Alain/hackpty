import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  CHART_REVIEW_PROMPT_VERSION, CHART_REVIEW_MAX_EVIDENCE_CHARS, CHART_REVIEW_MAX_FINDINGS,
  CHART_REVIEW_MAX_CLARIFICATIONS, CHART_REVIEW_MAX_STATEMENT_CHARS, CHART_REVIEW_MAX_HISTORICAL_EXCERPT_CHARS,
  chartReviewHistory, chartReviewResponseFormat, chartReviewEvidenceIds, validateChartReviewPacket
} from '../packages/runtime/chart-review-prompts.js';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const SYNTHETIC = 'SYNTHETIC OUTPATIENT NOTE - NOT A REAL PATIENT\n';
function evidence(evidenceId: string, kind: 'current' | 'historical', text: string, overrides: Record<string, unknown> = {}) {
  return {
    evidenceId, kind, patientId: 'SYN-CHART-T', encounterId: `ENC-T-${evidenceId}`,
    recordId: kind === 'historical' ? `REC-T-${evidenceId}` : null,
    sourceRevision: 1, sourceDate: '2026-09-09',
    approvedAt: kind === 'historical' ? '2026-09-09T12:00:00.000Z' : null,
    start: 0, end: text.length, text, textSha256: sha256(text), ...overrides
  };
}
function packet(historicalCount = 1, text = `${SYNTHETIC}Visit date: 2026-09-09\nAnkle pain 2 out of 10.`) {
  const historical = Array.from({length: historicalCount}, (_, index) =>
    evidence(`H${index + 1}`, 'historical', `${SYNTHETIC}Visit date: 2026-08-0${index + 1}\nAnkle pain 6 out of 10.`, {sourceDate: `2026-08-0${index + 1}`}));
  return {
    schemaVersion: 1 as const, task: 'what-changed-and-unclear' as const,
    patientId: 'SYN-CHART-T', currentEncounterId: 'ENC-T-C1',
    current: evidence('C1', 'current', text),
    historical,
    coverage: {
      method: 'application-bound-approved-history-v1' as const,
      historicalRecordsAvailable: historicalCount, historicalRecordsSupplied: historicalCount,
      dateRange: {from: historicalCount ? '2026-08-01' : null, to: '2026-09-09'},
      charactersSupplied: text.length + historical.reduce((sum, item) => sum + item.text.length, 0),
      omitted: []
    }
  };
}

test('chart review prompt module: valid packet builds bound prompts and schema', () => {
  const value = packet(2);
  assert.doesNotThrow(() => validateChartReviewPacket(value));
  assert.deepEqual(chartReviewEvidenceIds(value), ['C1', 'H1', 'H2']);
  const history = chartReviewHistory(value);
  assert.equal(history.length, 2);
  assert.equal(history[0].role, 'system');
  assert.match(history[0].content, /untrusted data/);
  assert.equal(history[1].role, 'user');
  const payload = JSON.parse(history[1].content.slice(history[1].content.indexOf('\n') + 1));
  assert.equal(payload.task, 'what-changed-and-unclear');
  assert.deepEqual(payload.evidence.map((item: any) => item.evidenceId), ['C1', 'H1', 'H2']);
  assert.equal(typeof payload.evidence[0].text, 'string');
  assert.ok(!('textSha256' in payload.evidence[0]), 'model payload must not rely on provider bindings');
  const format: any = chartReviewResponseFormat(value);
  assert.equal(format.type, 'json_schema');
  assert.equal(format.json_schema.strict, true);
  assert.deepEqual(format.json_schema.schema.required, ['schemaVersion', 'findings', 'clarifications'], 'contract ChartReviewOutput requires schemaVersion 1');
  assert.deepEqual(format.json_schema.schema.properties.schemaVersion, {type: 'integer', enum: [1]});
  const idEnum = format.json_schema.schema.properties.findings.items.properties.evidenceIds.items.enum;
  assert.deepEqual(idEnum, ['C1', 'H1', 'H2'], 'evidenceIds enum is limited to the packet IDs');
  assert.equal(format.json_schema.schema.properties.findings.maxItems, CHART_REVIEW_MAX_FINDINGS);
  assert.equal(format.json_schema.schema.properties.clarifications.maxItems, CHART_REVIEW_MAX_CLARIFICATIONS);
  assert.equal(format.json_schema.schema.properties.findings.items.properties.statement.maxLength, CHART_REVIEW_MAX_STATEMENT_CHARS);
});

test('chart review prompt module: schema enum shrinks with the packet', () => {
  const format: any = chartReviewResponseFormat(packet(0));
  assert.deepEqual(format.json_schema.schema.properties.findings.items.properties.evidenceIds.items.enum, ['C1']);
});

test('chart review prompt module: prompt version constant is frozen', () => {
  assert.equal(CHART_REVIEW_PROMPT_VERSION, 'psyrec-chart-review-v4');
});

test('chart review validation: rejection cases', () => {
  const good = packet(1);
  const expectReject = (mutate: (value: any) => void, pattern: RegExp) => {
    const value = structuredClone(good);
    mutate(value);
    assert.throws(() => validateChartReviewPacket(value), pattern);
  };
  expectReject(value => { value.task = 'other'; }, /task/);
  expectReject(value => { value.historical = Array.from({length: 7}, (_, index) => value.historical[0]); }, /0\.\.6/);
  expectReject(value => { value.historical[0].evidenceId = 'C1'; }, /evidenceId is invalid|unique/);
  expectReject(value => { value.current.text = `${value.current.text}x`.padEnd(CHART_REVIEW_MAX_EVIDENCE_CHARS + 1, 'x'); value.current.textSha256 = sha256(value.current.text); value.current.end = value.current.text.length; }, /character boundary|charactersSupplied/);
  expectReject(value => { value.current.textSha256 = '0'.repeat(64); }, /textSha256/);
  expectReject(value => { value.current.recordId = 'REC-X'; }, /current evidence/);
  expectReject(value => { value.historical[0].recordId = null; }, /approved record id/);
  expectReject(value => { value.historical[0].approvedAt = null; }, /approved record id|approval timestamp/);
  expectReject(value => { value.historical[0].patientId = 'SYN-OTHER'; }, /patientId/);
  expectReject(value => { value.coverage.charactersSupplied = 1; }, /charactersSupplied/);
  expectReject(value => { value.coverage.method = 'other'; }, /coverage method/);
  expectReject(value => { value.current.sourceDate = '09/09/2026'; }, /sourceDate/);
  // D1: per-historical excerpt boundary (2000 chars).
  expectReject(value => {
    value.historical[0].text = value.historical[0].text.padEnd(CHART_REVIEW_MAX_HISTORICAL_EXCERPT_CHARS + 1, 'x');
    value.historical[0].textSha256 = sha256(value.historical[0].text);
    value.historical[0].end = value.historical[0].text.length;
    value.coverage.charactersSupplied = value.current.text.length + value.historical[0].text.length;
  }, /historical excerpt exceeds/);
  // D1: total budget can be exceeded by several in-bound excerpts.
  expectReject(value => {
    value.historical = Array.from({length: 6}, (_, index) => {
      const text = `${SYNTHETIC}Visit date: 2026-08-0${index + 1}`.padEnd(1100, 'x');
      return evidence(`H${index + 1}`, 'historical', text, {sourceDate: `2026-08-0${index + 1}`});
    });
    value.coverage.historicalRecordsAvailable = 6;
    value.coverage.historicalRecordsSupplied = 6;
    value.coverage.charactersSupplied = value.current.text.length + 6 * 1100;
  }, /character boundary/);
});

test('chart review validation: packet exactly at the D1 boundaries is accepted', () => {
  const value = packet(0);
  const historicalText = `${SYNTHETIC}Visit date: 2026-08-01`.padEnd(CHART_REVIEW_MAX_HISTORICAL_EXCERPT_CHARS, 'x');
  value.historical = [evidence('H1', 'historical', historicalText, {sourceDate: '2026-08-01'})];
  const filler = CHART_REVIEW_MAX_EVIDENCE_CHARS - value.current.text.length - historicalText.length;
  value.current.text = value.current.text.padEnd(value.current.text.length + filler, 'x');
  value.current.textSha256 = sha256(value.current.text);
  value.current.end = value.current.text.length;
  value.coverage.historicalRecordsAvailable = 1;
  value.coverage.historicalRecordsSupplied = 1;
  value.coverage.charactersSupplied = CHART_REVIEW_MAX_EVIDENCE_CHARS;
  assert.doesNotThrow(() => validateChartReviewPacket(value));
  assert.equal(CHART_REVIEW_MAX_EVIDENCE_CHARS, 6000);
  assert.equal(CHART_REVIEW_MAX_HISTORICAL_EXCERPT_CHARS, 2000);
});

// Metrics-gate doubles below adapt retained draft metadata for gate-unit testing
// only (same pattern as the query gate tests). They are not review inference evidence.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { assertCompleteMetrics, IncompleteEvidenceError } from '../packages/runtime/metrics.js';
import { CHART_REVIEW_GENERATION } from '../packages/runtime/chart-review-prompts.js';

const reviewEvidenceAvailable = existsSync(path.resolve('artifacts', 'evidence', 'synthetic-draft.json'));
const needsDraftEvidence = {skip: !reviewEvidenceAvailable ? 'Real synthetic draft evidence not yet generated.' : false} as const;

test('review operation gate: exact thinking capture, packet-bound schema and review generation configuration', needsDraftEvidence, () => {
  const value = packet(1);
  const history = chartReviewHistory(value);
  const responseFormat = chartReviewResponseFormat(value);
  const make = () => {
    const m = JSON.parse(readFileSync(path.resolve('artifacts', 'evidence', 'synthetic-draft.json'), 'utf8')).result.metrics;
    m.operation = 'review';
    delete m.request.sourceId;
    m.request.promptTemplateVersion = CHART_REVIEW_PROMPT_VERSION;
    m.request.history = structuredClone(history);
    m.request.responseFormat = structuredClone(responseFormat);
    m.request.captureThinking = true;
    m.request.generationParams = {...CHART_REVIEW_GENERATION};
    delete m.modelDetails.loadConfig.reasoning_budget;
    m.modelDetails.assets[0].role = 'review';
    m.model = m.modelDetails.assets[0].constant;
    m.output.thinking = {captured: true, textLength: 128, deltaCount: 9};
    const row = m.sharedRuntime.performanceRows.find((entry: any) => entry.stage === 'completion');
    row.history = structuredClone(m.request.history);
    row.response_format = structuredClone(m.request.responseFormat);
    row.generation_params = {...CHART_REVIEW_GENERATION};
    row.capture_thinking = true;
    row.thinking_text_length = 128;
    row.thinking_delta_count = 9;
    const loadRow = m.sharedRuntime.performanceRows.find((entry: any) => entry.stage === 'load');
    delete loadRow.model_config.reasoning_budget;
    return m;
  };
  assertCompleteMetrics(make());
  const rejections: [string, (m: any) => void][] = [
    ['thinking capture missing', m => { delete m.output.thinking; }],
    ['captureThinking flag missing', m => { delete m.request.captureThinking; }],
    ['wrong responseFormat name', m => { m.request.responseFormat.json_schema.name = 'other'; m.sharedRuntime.performanceRows.find((r: any) => r.stage === 'completion').response_format = structuredClone(m.request.responseFormat); }],
    ['enum wider than packet', m => { m.request.responseFormat.json_schema.schema.properties.findings.items.properties.evidenceIds.items.enum = ['C1', 'H1', 'H2']; m.sharedRuntime.performanceRows.find((r: any) => r.stage === 'completion').response_format = structuredClone(m.request.responseFormat); }],
    ['reasoning_budget drift', m => { m.request.generationParams.reasoning_budget = 512; m.sharedRuntime.performanceRows.find((r: any) => r.stage === 'completion').generation_params = structuredClone(m.request.generationParams); }],
    ['predict drift', m => { m.request.generationParams.predict = 768; m.sharedRuntime.performanceRows.find((r: any) => r.stage === 'completion').generation_params = structuredClone(m.request.generationParams); }],
    ['prompt version drift', m => { m.request.promptTemplateVersion = 'psyrec-chart-review-v0'; }],
  ];
  for (const [name, mutate] of rejections) {
    const m = make();
    mutate(m);
    assert.throws(() => assertCompleteMetrics(m), IncompleteEvidenceError, name);
  }
});
