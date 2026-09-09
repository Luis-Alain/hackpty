import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Vault } from '../packages/core/vault.js';
import { PsyRecService } from '../packages/core/service.js';
import { selectApprovedQueryExcerpts, validateApprovedQueryOutput } from '../packages/core/approved-query.js';
import { queryHistory, QUERY_PROMPT_VERSION, queryResponseFormat } from '../packages/runtime/prompts.js';
import { assertCompleteMetrics } from '../packages/runtime/metrics.js';

const password = 'synthetic-query-test-passphrase';
const runtimeDouble = {
  extractImage: async () => ({ text: 'Synthetic raw source', metrics: { testDouble: true as const } }),
  draftFromSource: async ({ text }) => ({ text, metrics: { testDouble: true as const } }),
  answerApprovedNotes: async ({ sources }) => ({ text: JSON.stringify({ sourceIds: [sources[0].sourceId] }), metrics: { testDouble: true as const } }),
};
async function setup(t, runtime: import('../packages/core/types.js').InferencePort = runtimeDouble) {
  const directory = await mkdtemp(join(tmpdir(), 'psyrec-query-unit-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const vault = new Vault(join(directory, 'test.vault')); await vault.unlock(password, true);
  const service = new PsyRecService(vault, runtime);
  const patient = await service.addPatient('SYNTHETIC QUERY A');
  return { service, vault, patient };
}
async function approveSynthetic(service, patientId, text) {
  const encounter = await service.addEncounter(patientId);
  await service.reviewSource(encounter.id, text);
  const draft = await service.generateDraft(encounter.id);
  const record = await service.approve(encounter.id, draft.id, draft.sourceRevision, text);
  return { encounter, record };
}

test('query passes only current selected-patient text, displays complete context, and retains raw output only encrypted', async t => {
  let supplied: any;
  const { service, vault, patient } = await setup(t, { ...runtimeDouble, answerApprovedNotes: async input => { supplied = input; return { text: JSON.stringify({ sourceIds: ['N1'] }), metrics: { testDouble: true as const } }; } });
  const target = await approveSynthetic(service, patient.id, 'Denies suicidal ideation. Sleep improved.');
  const superseded = await approveSynthetic(service, patient.id, 'Superseded confidential phrase.');
  await service.reviewSource(superseded.encounter.id, 'Updated source awaiting approval.');
  const other = await service.addPatient('SYNTHETIC QUERY B');
  await approveSynthetic(service, other.id, 'Other patient confidential phrase.');
  const before = structuredClone(service.state().records);
  const answer = await service.queryApprovedNotes(patient.id, 'What is documented about ideation?');
  assert.equal(supplied.sources.length, 1);
  assert.equal(supplied.sources[0].text, target.record.text);
  assert.equal(JSON.stringify(supplied).includes('confidential phrase'), false);
  assert.equal(answer.answer, 'Denies suicidal ideation. Sleep improved.');
  assert.equal(answer.answer.includes('UNSUPPORTED'), false);
  assert.equal(answer.citations[0].start, 0);
  assert.equal(answer.citations[0].end, target.record.text.length);
  assert.deepEqual(service.state().records, before);
  assert.equal(service.resolveQueryCitation(patient.id, answer.queryId, 0).recordId, target.record.id);
  assert.throws(() => service.resolveQueryCitation(other.id, answer.queryId, 0), /unavailable/);
  assert.equal(JSON.stringify(service.snapshot()).includes('queryRuns'), false);
  assert.equal((await readFile(vault.path, 'utf8')).includes('sourceIds'), false);
  await service.lock(); await vault.unlock(password);
  assert.equal(vault.state.queryRuns[0].rawOutput, JSON.stringify({ sourceIds: ['N1'] }));
  assert.equal(vault.state.queryRuns[0].status, 'answered');
  await service.reviewSource(target.encounter.id, 'A correction supersedes the previous approved record.');
  assert.throws(() => service.resolveQueryCitation(patient.id, answer.queryId, 0), /changed/);
});

test('query rejects invalid or fabricated citations while preserving rejected raw output and metrics', async t => {
  let output = '';
  const { service, patient } = await setup(t, { ...runtimeDouble, answerApprovedNotes: async () => ({ text: output, metrics: { testDouble: true as const } }) });
  await approveSynthetic(service, patient.id, 'No diagnosis is recorded.');
  for (const raw of ['not JSON', JSON.stringify({ sourceIds: ['OTHER-PATIENT'] }), JSON.stringify({ sourceIds: ['N1', 'N1'] }), JSON.stringify({ sourceIds: ['N1'], answer: 'Diabetes is diagnosed.' }), JSON.stringify({ status: 'not-found', answer: '', citations: [] })]) {
    output = raw;
    await assert.rejects(service.queryApprovedNotes(patient.id, 'What is the diagnosis?'));
    assert.equal(service.state().queryRuns.at(-1).rawOutput, raw);
    assert.equal(service.state().queryRuns.at(-1).status, 'rejected');
    assert.deepEqual(service.state().queryRuns.at(-1).metrics, { testDouble: true });
  }
});

test('query refuses stale approved sources and late output after locking', async t => {
  let finish: (result: any) => void;
  const delayed = { ...runtimeDouble, answerApprovedNotes: async () => new Promise<any>(resolve => { finish = resolve; }) };
  const { service, vault, patient } = await setup(t, delayed);
  const { encounter } = await approveSynthetic(service, patient.id, 'Sleep improved.');
  const pending = service.queryApprovedNotes(patient.id, 'Sleep?');
  await service.reviewSource(encounter.id, 'Sleep unchanged.');
  finish({ text: JSON.stringify({ sourceIds: ['N1'] }), metrics: { testDouble: true } });
  await assert.rejects(pending, /changed/);
  assert.equal(service.state().queryRuns.at(-1).status, 'rejected');
  const draft = await service.generateDraft(encounter.id); await service.approve(encounter.id, draft.id, draft.sourceRevision, draft.text);
  const late = service.queryApprovedNotes(patient.id, 'Sleep?');
  await service.lock();
  finish({ text: JSON.stringify({ sourceIds: [] }), metrics: { testDouble: true } });
  await assert.rejects(late, /session changed/);
  await vault.unlock(password);
  assert.equal(vault.state.queryRuns.length, 1);
});

test('query bounds sources and reports partial coverage; empty approved history never invokes a model', async t => {
  let invoked = 0;
  const { service, patient } = await setup(t, { ...runtimeDouble, answerApprovedNotes: async input => { invoked++; return runtimeDouble.answerApprovedNotes(input); } });
  const empty = await service.queryApprovedNotes(patient.id, 'What is documented?');
  assert.equal(empty.modelInvoked, false); assert.equal(invoked, 0);
  await assert.rejects(service.queryApprovedNotes(patient.id, 'x'.repeat(1001)), /at most/);
  const long = ('Synthetic sleep note with complete source context. ').repeat(180);
  await approveSynthetic(service, patient.id, long);
  const selection = selectApprovedQueryExcerpts(service.approvedNotes(patient.id), 'sleep', new Date().toISOString());
  assert.ok(selection.sources.length <= 6);
  assert.ok(selection.coverage.charactersSearched <= 4800);
  assert.equal(selection.coverage.partial, true);
  const raw = JSON.stringify({ sourceIds: ['N1'] });
  const selected = validateApprovedQueryOutput(raw, selection.sources);
  assert.equal(selected.citations.length, 1);
  assert.equal(selected.citations[0].quote, selection.sources[0].text);
});

test('query rejects internally valid native evidence bound to a different question', async t => {
  // Copied schema fixture only: no GPU run or published measurement is fabricated here.
  const desktop = JSON.parse(await readFile('artifacts/evidence/desktop-workflow.json', 'utf8'));
  const { service, patient } = await setup(t, { ...runtimeDouble, answerApprovedNotes: async ({ sources }) => {
    const text = JSON.stringify({ sourceIds: ['N1'] });
    const metrics = structuredClone(desktop.runs.find(run => run.operation === 'draft').metrics);
    metrics.operation = 'query'; metrics.request.promptTemplateVersion = QUERY_PROMPT_VERSION;
    delete metrics.request.sourceId;
    metrics.request.context = sources; metrics.request.responseFormat = queryResponseFormat(sources);
    metrics.request.history = queryHistory('A different synthetic question', sources);
    for (const row of metrics.sharedRuntime.performanceRows) if (row.stage === 'completion') { row.history = structuredClone(metrics.request.history); row.response_format = queryResponseFormat(sources); }
    metrics.output.sha256 = createHash('sha256').update(text).digest('hex');
    metrics.output.characters = text.length;
    assertCompleteMetrics(metrics);
    return { text, metrics };
  } });
  await approveSynthetic(service, patient.id, 'Sleep improved.');
  await assert.rejects(service.queryApprovedNotes(patient.id, 'What is documented about sleep?'), /different question/);
  assert.equal(service.state().queryRuns.at(-1).status, 'rejected');
});

test('human gold is append-only, capture-bound, exact, encrypted and scores only original retained extraction', async t => {
  const desktop = JSON.parse(await readFile('artifacts/evidence/desktop-workflow.json', 'utf8'));
  const { service, vault, patient } = await setup(t);
  const encounter = await service.addEncounter(patient.id);
  await service.importImage(encounter.id, await readFile('diagnostics/qvac-spike/fixtures/synthetic-note.png'));
  const original = { ...structuredClone(desktop.runs.find(run => run.operation === 'extract')), encounterId: encounter.id, outputText: desktop.source.extracted };
  await service.change(state => { state.runs.push(original); });
  await service.reviewSource(encounter.id, 'Different corrected source must never replace the original scoring output.');
  const reference = '  ' + desktop.source.extracted + '\nAdditional synthetic words.\n';
  await assert.rejects(service.recordHumanGoldTranscription(encounter.id, reference, true, false), /human/);
  await assert.rejects(service.recordHumanGoldTranscription(encounter.id, reference, false, true), /human/);
  const saved = await service.recordHumanGoldTranscription(encounter.id, reference, true, true);
  assert.equal(saved.accuracy.status, 'available');
  if (saved.accuracy.status === 'available') {
    assert.equal(saved.accuracy.extractionRunId, original.metrics.runId);
    assert.equal(saved.accuracy.extractionOutputSha256, original.metrics.output.sha256);
    assert.ok(saved.accuracy.scores.wer.rate > 0);
    assert.equal(saved.accuracy.scores.categories.negation.failureRate, null);
  }
  assert.equal(vault.state.goldTranscriptions[0].text, reference);
  assert.equal(vault.state.goldTranscriptions[0].captureSha256, service.encounter(service.state(), encounter.id).capture.sha256);
  assert.equal((await readFile(vault.path, 'utf8')).includes('Additional synthetic words'), false);
  assert.equal(JSON.stringify(service.snapshot().goldTranscriptions).includes('Additional synthetic words'), false);
  await service.change(state => { if (state.runs[0].status !== 'failed') delete state.runs[0].outputText; });
  const unavailable = await service.recordHumanGoldTranscription(encounter.id, 'New manually transcribed synthetic reference.', true, true);
  assert.equal(unavailable.accuracy.status, 'unavailable');
  assert.equal(vault.state.goldTranscriptions.length, 2);
  assert.equal(vault.state.goldTranscriptions[0].text, reference);
  await service.lock(); await vault.unlock(password);
  assert.equal(vault.state.goldTranscriptions[0].text, reference);
  assert.equal(vault.state.goldTranscriptions[1].accuracy.status, 'unavailable');
});

test('query never clips a long sentence that carries an earlier denial', async t => {
  let invoked = 0;
  const { service, patient } = await setup(t, { ...runtimeDouble, answerApprovedNotes: async input => { invoked++; return runtimeDouble.answerApprovedNotes(input); } });
  const text = 'The patient denies ' + ('headache, dizziness, '.repeat(46)) + 'and suicidal ideation.';
  await approveSynthetic(service, patient.id, text);
  const question = 'What is documented about suicidal ideation?';
  const selection = selectApprovedQueryExcerpts(service.approvedNotes(patient.id), question, new Date().toISOString());
  assert.equal(selection.sources.length, 0);
  assert.equal(selection.coverage.omittedLongPassages, 1);
  assert.equal(selection.coverage.partial, true);
  const answer = await service.queryApprovedNotes(patient.id, question);
  assert.equal(invoked, 0);
  assert.equal(answer.modelInvoked, false);
  assert.equal(answer.answer, 'No answer found in the searched notes.');
  assert.equal(answer.coverage.omittedLongPassages, 1);
  assert.deepEqual(answer.citations, []);
});