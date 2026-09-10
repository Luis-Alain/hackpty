import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { scoreChartReviewCase, scoreChartReviewSuite, isGuardedOccurrence, questionTerms } from '../diagnostics/qvac-spike/chart-review-scoring.js';

const suite = JSON.parse(readFileSync(path.resolve('diagnostics/qvac-spike/chart-review/suite/dev-v1.json'), 'utf8'));
const dev = (id: string) => suite.cases.find((entry: any) => entry.id === id);
const ids = (historical: number) => ['C1', ...Array.from({length: historical}, (_, index) => `H${index + 1}`)];
const output = (findings: any[], clarifications: any[] = []) => JSON.stringify({schemaVersion: 1, findings, clarifications});
const finding = (kind: string, statement: string, evidenceIds = ['C1', 'H1']) => ({kind, statement, evidenceIds});

test('dev-01 fully covered output passes with aggregate recall 1', () => {
  const entry = dev('DEV-01');
  const raw = output([
    finding('changed', 'Reported ankle pain with walking changed from 6 out of 10 on 2026-08-05 to 2 out of 10 at the current visit.'),
    finding('changed', 'The ankle brace is no longer used; the patient walks without the brace since 2026-08-20.')
  ]);
  const score = scoreChartReviewCase(entry, ids(1), raw, 'eos');
  assert.equal(score.schemaValid, true);
  assert.equal(score.citationsAuthorized, true);
  assert.equal(score.casePassed, true);
  assert.deepEqual(score.gold.map(gold => gold.strictCovered), [true, true]);
  const aggregate = scoreChartReviewSuite([score]);
  assert.equal(aggregate.goldRecallStrict, 1);
  assert.equal(aggregate.casePassRate, 1);
});

test('kind mismatch keeps term coverage but loses strict coverage and the case', () => {
  const entry = dev('DEV-01');
  const raw = output([
    finding('new', 'Ankle pain was 6 out of 10 and is now 2 out of 10.'),
    finding('changed', 'The brace is unused since 2026-08-20.')
  ]);
  const score = scoreChartReviewCase(entry, ids(1), raw, 'eos');
  assert.equal(score.gold[0].termCovered, true);
  assert.equal(score.gold[0].strictCovered, false);
  assert.equal(score.casePassed, false);
});

test('one output finding covers at most one gold finding', () => {
  const entry = dev('DEV-01');
  const raw = output([
    finding('changed', 'Ankle pain changed from 6 out of 10 to 2 out of 10 and the brace is unused since 2026-08-20.')
  ]);
  const score = scoreChartReviewCase(entry, ids(1), raw, 'eos');
  assert.equal(score.gold.filter(gold => gold.strictCovered).length, 1);
});

test('unauthorized and unsupplied evidence ids fail the citation gate', () => {
  const entry = dev('DEV-01');
  const raw = output([
    finding('changed', 'Ankle pain changed from 6 out of 10 to 2 out of 10.', ['C1', 'H7']),
    finding('changed', 'The brace is unused since 2026-08-20.')
  ]);
  const score = scoreChartReviewCase(entry, ids(1), raw, 'eos');
  assert.equal(score.citationsAuthorized, false);
  assert.deepEqual(score.unauthorizedIds, ['H7']);
  assert.equal(score.casePassed, false);
});

test('forbidden terms violate unless negation-guarded in the same sentence', () => {
  const entry = dev('DEV-02');
  const violating = scoreChartReviewCase(entry, ids(1), output([
    finding('unchanged', 'The patient denies fever at both visits.'),
    finding('unchanged', 'The ankle x-ray was performed and was not performed later.')
  ]), 'eos');
  assert.ok(violating.violations.some(violation => violation.term === 'x-ray was performed' && !violation.guarded));
  assert.equal(violating.casePassed, false);
  const guarded = scoreChartReviewCase(entry, ids(1), output([
    finding('unchanged', 'The patient denies fever at both visits.'),
    finding('unchanged', 'The ankle x-ray was not performed at either visit, so no imaging result exists.')
  ]), 'eos');
  assert.equal(guarded.violations.filter(violation => !violation.guarded).length, 0);
  assert.equal(guarded.casePassed, true);
  assert.equal(isGuardedOccurrence('sleep apnea has not been ruled out', 'sleep apnea has not been ruled out'.indexOf('ruled out')), true);
  assert.equal(isGuardedOccurrence('sleep apnea ruled out', 'sleep apnea ruled out'.indexOf('ruled out')), false);
});

test('expected clarification coverage uses question plus reason', () => {
  const entry = dev('DEV-03');
  const raw = output([
    finding('changed', 'Ibuprofen 400 mg was stopped on 2026-08-20 because of stomach upset.'),
    finding('unchanged', 'The vitamin D dose is not documented at either visit.')
  ], [{question: 'What vitamin D dose is the patient taking?', reason: 'No vitamin D dose is documented in either record.', evidenceIds: ['C1']}]);
  const score = scoreChartReviewCase(entry, ids(1), raw, 'eos');
  assert.deepEqual(score.clarifications, [{id: 'Q1', covered: true}]);
  assert.equal(score.casePassed, true);
});

test('abstention expected: unknown finding or clarification required, invented answers fail', () => {
  const entry = dev('DEV-04');
  const good = scoreChartReviewCase(entry, ids(1), output([
    finding('unknown', 'No thyroid function result is documented; the test was discussed but not ordered.')
  ], [{question: 'Should a thyroid test be ordered?', reason: 'No thyroid result is on record.', evidenceIds: ['C1']}]), 'eos');
  assert.equal(good.abstentionCorrect, true);
  assert.equal(good.casePassed, true);
  const invented = scoreChartReviewCase(entry, ids(1), output([
    finding('new', 'The thyroid function test showed a normal result.')
  ]), 'eos');
  assert.equal(invented.abstentionCorrect, false);
  assert.equal(invented.casePassed, false);
  assert.ok(invented.violations.some(violation => violation.term === 'thyroid was normal' || violation.term === 'tsh') || invented.violations.length === 0);
});

test('truncated outputs fail even when the fragment parses', () => {
  const entry = dev('DEV-01');
  const raw = output([finding('changed', 'Ankle pain changed from 6 out of 10 to 2 out of 10.'), finding('changed', 'The brace is unused since 2026-08-20.')]);
  const score = scoreChartReviewCase(entry, ids(1), raw, 'length');
  assert.equal(score.truncated, true);
  assert.equal(score.casePassed, false);
});

test('invalid JSON and schema violations score zero and are still recorded', () => {
  const entry = dev('DEV-01');
  const unparsable = scoreChartReviewCase(entry, ids(1), '{"findings": [', 'length');
  assert.equal(unparsable.schemaValid, false);
  assert.equal(unparsable.casePassed, false);
  const badKind = scoreChartReviewCase(entry, ids(1), output([finding('speculative', 'Ankle pain changed.')]), 'eos');
  assert.equal(badKind.schemaValid, false);
  const noCitations = scoreChartReviewCase(entry, ids(1), output([finding('changed', 'Ankle pain changed.', [])]), 'eos');
  assert.equal(noCitations.schemaValid, false);
});

test('suite aggregation keeps denominators and never rounds up', () => {
  const entry = dev('DEV-01');
  const pass = scoreChartReviewCase(entry, ids(1), output([
    finding('changed', 'Ankle pain changed from 6 out of 10 to 2 out of 10.'),
    finding('changed', 'The brace is unused since 2026-08-20.')
  ]), 'eos');
  const fail = scoreChartReviewCase(entry, ids(1), output([finding('changed', 'Ankle pain changed from 6 out of 10 to 2 out of 10.')]), 'eos');
  const aggregate = scoreChartReviewSuite([pass, fail]);
  assert.equal(aggregate.totalCases, 2);
  assert.equal(aggregate.passedCases, 1);
  assert.equal(aggregate.casePassRate, 0.5);
  assert.equal(aggregate.goldTotal, 4);
  assert.equal(aggregate.goldStrictCovered, 3);
  assert.equal(aggregate.goldRecallStrict, 0.75);
  assert.equal(aggregate.schemaValidRate, 1);
  assert.equal(aggregate.abstentionAccuracy, null);
});

test('question term extraction drops stopwords and short tokens', () => {
  assert.deepEqual(questionTerms('What was the result of the most recent thyroid function test?'), ['thyroid', 'function', 'test']);
});

test('gate-failed cases keep their gold in the denominator (zero coverage, still counted)', () => {
  const entry = dev('DEV-01');
  const invalid = scoreChartReviewCase(entry, ids(1), '{"findings": [');
  assert.equal(invalid.gold.length, entry.goldFindings.length, 'gold items are retained as uncovered');
  assert.ok(invalid.gold.every(gold => !gold.strictCovered && !gold.termCovered));
  assert.equal(invalid.clarifications.length, entry.expectedClarifications.length);
  const aggregate = scoreChartReviewSuite([invalid]);
  assert.equal(aggregate.goldTotal, entry.goldFindings.length);
  assert.equal(aggregate.goldRecallStrict, 0);
});
