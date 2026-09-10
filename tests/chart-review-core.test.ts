import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Vault } from '../packages/core/vault.js';
import { PsyRecService } from '../packages/core/service.js';
import { buildChartReviewPacket, validateChartReviewOutput } from '../packages/core/chart-review.js';

const password = 'synthetic-chart-review-passphrase';
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const doubleOutput = packet => JSON.stringify({
  schemaVersion: 1,
  findings: [
    { kind: 'new', statement: 'SYNTHETIC finding about the current source. NOT A REAL PATIENT.', evidenceIds: ['C1'] },
    ...(packet.historical.length ? [{ kind: 'changed', statement: 'SYNTHETIC change since the previous visit. NOT A REAL PATIENT.', evidenceIds: ['C1', 'H1'] }] : []),
  ],
  clarifications: [{ question: 'SYNTHETIC clarification question?', reason: 'SYNTHETIC reason. NOT A REAL PATIENT.', evidenceIds: packet.historical.length ? ['H1'] : ['C1'] }],
});
const runtimeDouble = {
  extractImage: async () => ({ text: 'Synthetic raw source', metrics: { testDouble: true as const } }),
  draftFromSource: async ({ text }) => ({ text, metrics: { testDouble: true as const } }),
  reviewChart: async ({ packet }) => ({ text: doubleOutput(packet), metrics: { testDouble: true as const } }),
};
async function setup(t, runtime: import('../packages/core/types.js').InferencePort = runtimeDouble) {
  const directory = await mkdtemp(join(tmpdir(), 'psyrec-chart-review-unit-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const vault = new Vault(join(directory, 'test.vault')); await vault.unlock(password, true);
  const service = new PsyRecService(vault, runtime);
  const patient = await service.addPatient('SYNTHETIC CHART A — NOT A REAL PATIENT');
  return { service, vault, patient };
}
async function approveSynthetic(service, patientId, text) {
  const encounter = await service.addEncounter(patientId);
  await service.reviewSource(encounter.id, text);
  const draft = await service.generateDraft(encounter.id);
  const record = await service.approve(encounter.id, draft.id, draft.sourceRevision, text);
  return { encounter, record };
}
async function reviewedCurrentEncounter(service, patientId, text = 'SYNTHETIC current visit note. NOT A REAL PATIENT. Sleep stable.') {
  const encounter = await service.addEncounter(patientId);
  await service.reviewSource(encounter.id, text);
  return encounter;
}

test('packet binds only the reviewed current source and current approved history, oldest to newest, with hashes and documented dates', async t => {
  let supplied: any;
  const { service, patient } = await setup(t, { ...runtimeDouble, reviewChart: async input => { supplied = input; return runtimeDouble.reviewChart(input); } });
  const older = await approveSynthetic(service, patient.id, '2026-07-12\nSYNTHETIC intake note. NOT A REAL PATIENT. Sleep poor.');
  const newer = await approveSynthetic(service, patient.id, 'SYNTHETIC follow-up note. NOT A REAL PATIENT. Sleep improved.');
  const superseded = await approveSynthetic(service, patient.id, 'SYNTHETIC outdated note. NOT A REAL PATIENT.');
  await service.reviewSource(superseded.encounter.id, 'SYNTHETIC correction awaiting approval. NOT A REAL PATIENT.');
  const other = await service.addPatient('SYNTHETIC CHART B — NOT A REAL PATIENT');
  await approveSynthetic(service, other.id, 'SYNTHETIC other patient note. NOT A REAL PATIENT.');
  const current = await reviewedCurrentEncounter(service, patient.id);
  await approveSynthetic(service, patient.id, 'SYNTHETIC later encounter note. NOT A REAL PATIENT.');

  const result = await service.reviewChart(patient.id, current.id);
  const packet = supplied.packet;
  assert.equal(packet.schemaVersion, 1);
  assert.equal(packet.task, 'what-changed-and-unclear');
  assert.equal(packet.current.evidenceId, 'C1');
  assert.equal(packet.current.recordId, null);
  assert.equal(packet.current.text, 'SYNTHETIC current visit note. NOT A REAL PATIENT. Sleep stable.');
  assert.equal(packet.current.textSha256, sha(packet.current.text));
  assert.deepEqual(packet.historical.map(h => h.evidenceId), ['H1', 'H2', 'H3']);
  assert.deepEqual(packet.historical.map(h => h.recordId), [older.record.id, newer.record.id, packet.historical[2].recordId]);
  assert.ok(packet.historical[0].approvedAt <= packet.historical[1].approvedAt);
  assert.equal(packet.historical[0].sourceDate, '2026-07-12'); // ISO date on the first three lines wins.
  assert.equal(packet.historical[1].sourceDate, newer.record.approvedAt.slice(0, 10)); // otherwise the approval date.
  assert.equal(JSON.stringify(packet).includes('outdated note'), false); // superseded excluded
  assert.equal(JSON.stringify(packet).includes('other patient note'), false); // wrong patient excluded
  assert.equal(packet.coverage.historicalRecordsAvailable, 3);
  assert.equal(packet.coverage.historicalRecordsSupplied, 3);
  assert.deepEqual(packet.coverage.omitted, []);
  assert.equal(packet.coverage.dateRange.from, '2026-07-12');
  assert.equal(packet.coverage.dateRange.to, packet.historical[2].sourceDate);
  assert.equal(result.coverage.historicalRecordsSupplied, 3);
  assert.equal(result.evidence.length, 4);
  assert.equal(result.output.findings.length, 2);
  // Records of the current encounter are never part of its own history.
  const ownRecord = await approveSynthetic(service, patient.id, 'SYNTHETIC current visit note. NOT A REAL PATIENT. Sleep stable.');
  assert.equal(ownRecord.record.encounterId === current.id, false); // sanity: helper creates separate encounters
  const packetAgain = buildChartReviewPacket(service.state(), patient.id, current.id, new Date().toISOString());
  assert.equal(packetAgain.historical.some(h => h.encounterId === current.id), false);
});

test('unreviewed or empty current sources and cross-patient encounters cannot build a packet', async t => {
  const { service, patient } = await setup(t);
  const other = await service.addPatient('SYNTHETIC CHART B — NOT A REAL PATIENT');
  const encounter = await service.addEncounter(patient.id);
  await assert.rejects(service.reviewChart(patient.id, encounter.id), /Review and confirm/);
  await assert.rejects(service.reviewChart(other.id, encounter.id), /does not belong/);
  await assert.rejects(service.reviewChart('missing-patient', encounter.id), /Patient not found/);
  await assert.rejects(service.reviewChart(patient.id, 'missing-encounter'), /does not belong/);
});

test('answered reviews are stored only inside the encrypted vault, never approved, and evidence resolves canonically', async t => {
  const { service, vault, patient } = await setup(t);
  const history = await approveSynthetic(service, patient.id, 'SYNTHETIC prior note. NOT A REAL PATIENT. Sleep improved.');
  const current = await reviewedCurrentEncounter(service, patient.id);
  const before = structuredClone(service.state().records);
  const result = await service.reviewChart(patient.id, current.id);
  assert.equal(result.validation.schemaValid, true);
  assert.equal(result.validation.evidenceIdsAuthorized, true);
  assert.equal(result.modelIdentity, 'test double (no model)');
  assert.equal(service.state().chartReviews.length, 1);
  assert.equal(service.state().chartReviews[0].status, 'answered');
  assert.deepEqual(service.state().records, before); // review never alters approved history
  assert.equal(service.approvedNotes(patient.id).length, 1);
  assert.equal(JSON.stringify(service.snapshot()).includes('chartReviews'), false);
  const file = await readFile(vault.path, 'utf8');
  assert.equal(file.includes('SYNTHETIC finding'), false); // raw output stays encrypted
  const passage = service.resolveChartReviewEvidence(patient.id, result.reviewId, 'H1');
  assert.equal(passage.recordId, history.record.id);
  assert.equal(passage.text, history.record.text);
  assert.equal(passage.sourceDate, history.record.approvedAt.slice(0, 10));
  const currentPassage = service.resolveChartReviewEvidence(patient.id, result.reviewId, 'C1');
  assert.equal(currentPassage.recordId, null);
  assert.equal(currentPassage.text, 'SYNTHETIC current visit note. NOT A REAL PATIENT. Sleep stable.');
  const other = await service.addPatient('SYNTHETIC CHART B — NOT A REAL PATIENT');
  assert.throws(() => service.resolveChartReviewEvidence(other.id, result.reviewId, 'H1'), /unavailable/);
  assert.throws(() => service.resolveChartReviewEvidence(patient.id, result.reviewId, 'H9'), /unavailable/);
  await service.lock(); await vault.unlock(password);
  assert.equal(vault.state.chartReviews[0].raw, doubleOutput(vault.state.chartReviews[0].packet));
});

test('malformed, unauthorized or out-of-shape model output is rejected entirely and preserved with metrics', async t => {
  let output = '';
  const { service, patient } = await setup(t, { ...runtimeDouble, reviewChart: async () => ({ text: output, metrics: { testDouble: true as const } }) });
  await approveSynthetic(service, patient.id, 'SYNTHETIC prior note. NOT A REAL PATIENT.');
  const current = await reviewedCurrentEncounter(service, patient.id);
  const valid = JSON.parse(doubleOutput({ historical: [{}] }));
  const cases = [
    'not JSON',
    JSON.stringify({ ...valid, extra: true }),
    JSON.stringify({ ...valid, schemaVersion: 2 }),
    JSON.stringify({ ...valid, findings: [{ kind: 'diagnosis', statement: 'x', evidenceIds: ['C1'] }] }),
    JSON.stringify({ ...valid, findings: [{ kind: 'new', statement: 'x', evidenceIds: ['H7'] }] }),
    JSON.stringify({ ...valid, findings: [{ kind: 'new', statement: 'x', evidenceIds: [] }] }),
    JSON.stringify({ ...valid, findings: [{ kind: 'new', statement: 'x', evidenceIds: ['C1', 'C1'] }] }),
    JSON.stringify({ ...valid, findings: [{ kind: 'new', statement: 'x', evidenceIds: ['C1'], note: 'extra' }] }),
    JSON.stringify({ ...valid, findings: [{ kind: 'new', statement: ' '.repeat(3), evidenceIds: ['C1'] }] }),
    JSON.stringify({ ...valid, findings: [{ kind: 'new', statement: 'x'.repeat(601), evidenceIds: ['C1'] }] }),
    JSON.stringify({ ...valid, findings: Array.from({ length: 25 }, () => ({ kind: 'new', statement: 'x', evidenceIds: ['C1'] })) }),
    JSON.stringify({ ...valid, clarifications: Array.from({ length: 13 }, () => ({ question: 'q', reason: 'r', evidenceIds: ['C1'] })) }),
    JSON.stringify({ ...valid, clarifications: [{ question: 'q', reason: 'r', evidenceIds: ['C1'], severity: 'high' }] }),
  ];
  for (const raw of cases) {
    output = raw;
    await assert.rejects(service.reviewChart(patient.id, current.id));
    const run = service.state().chartReviews.at(-1);
    assert.equal(run.status, 'rejected');
    assert.equal(run.raw, raw);
    assert.deepEqual(run.metrics, { testDouble: true });
    assert.ok(run.rejection.length > 0);
  }
  assert.equal(service.state().chartReviews.length, cases.length);
  assert.equal(service.state().records.length, 1); // rejections never touch approved history
});

test('a source change mid-run rejects the output; a later source review invalidates the stored review', async t => {
  let finish: () => void;
  const delayed = { ...runtimeDouble, reviewChart: async ({ packet }) => new Promise<any>(resolve => { finish = () => resolve({ text: doubleOutput(packet), metrics: { testDouble: true } }); }) };
  const { service, patient } = await setup(t, delayed);
  await approveSynthetic(service, patient.id, 'SYNTHETIC prior note. NOT A REAL PATIENT.');
  const current = await reviewedCurrentEncounter(service, patient.id);
  const pending = service.reviewChart(patient.id, current.id);
  await service.reviewSource(current.id, 'SYNTHETIC corrected current note. NOT A REAL PATIENT.');
  finish();
  await assert.rejects(pending, /changed/);
  assert.equal(service.state().chartReviews.at(-1).status, 'rejected');

  service.runtime = runtimeDouble;
  const result = await service.reviewChart(patient.id, current.id);
  assert.equal(result.validation.schemaValid, true);
  await service.reviewSource(current.id, 'SYNTHETIC second correction. NOT A REAL PATIENT.');
  const stored = service.state().chartReviews.find(r => r.id === result.reviewId);
  assert.ok(stored.invalidatedAt);
  assert.match(stored.invalidationReason, /earlier revision/);
  assert.throws(() => service.resolveChartReviewEvidence(patient.id, result.reviewId, 'C1'), /unavailable/);
});

test('superseding a cited historical record invalidates the bound review', async t => {
  const { service, patient } = await setup(t);
  const history = await approveSynthetic(service, patient.id, 'SYNTHETIC prior note. NOT A REAL PATIENT. Sleep improved.');
  const current = await reviewedCurrentEncounter(service, patient.id);
  const result = await service.reviewChart(patient.id, current.id);
  assert.equal(service.resolveChartReviewEvidence(patient.id, result.reviewId, 'H1').recordId, history.record.id);
  await service.reviewSource(history.encounter.id, 'SYNTHETIC corrected prior note. NOT A REAL PATIENT.');
  const stored = service.state().chartReviews.find(r => r.id === result.reviewId);
  assert.ok(stored.invalidatedAt);
  assert.throws(() => service.resolveChartReviewEvidence(patient.id, result.reviewId, 'H1'), /unavailable/);
});

test('lock discards in-flight output; approval still binds exact text and revision across lock and reload', async t => {
  let finish: () => void;
  const delayed = { ...runtimeDouble, reviewChart: async ({ packet }) => new Promise<any>(resolve => { finish = () => resolve({ text: doubleOutput(packet), metrics: { testDouble: true } }); }) };
  const { service, vault, patient } = await setup(t, delayed);
  const current = await reviewedCurrentEncounter(service, patient.id);
  const pending = service.reviewChart(patient.id, current.id);
  await service.lock();
  finish();
  await assert.rejects(pending, /session changed/);
  await vault.unlock(password);
  assert.equal((vault.state.chartReviews ?? []).length, 0);
  service.runtime = runtimeDouble;

  const exactText = '  SYNTHETIC approved note with exact whitespace. \nNOT A REAL PATIENT.\n';
  const encounter = await service.addEncounter(patient.id);
  await service.reviewSource(encounter.id, 'SYNTHETIC source. NOT A REAL PATIENT.');
  const draft = await service.generateDraft(encounter.id);
  const record = await service.approve(encounter.id, draft.id, draft.sourceRevision, exactText);
  assert.equal(record.text, exactText);
  assert.equal(record.sourceRevision, 1);
  await service.reviewChart(patient.id, encounter.id);
  assert.equal(service.approvedNotes(patient.id).length, 1); // chart review never enters approved history
  await service.lock();
  assert.throws(() => service.snapshot(), /Unlock/);
  await vault.unlock(password);
  assert.equal(vault.state.records[0].text, exactText);
  assert.equal(vault.state.chartReviews.length, 1);
});

test('empty history is disclosed and the model is bound to the current source only', async t => {
  let supplied: any;
  const { service, patient } = await setup(t, { ...runtimeDouble, reviewChart: async input => { supplied = input; return { text: JSON.stringify({ schemaVersion: 1, findings: [{ kind: 'unknown', statement: 'SYNTHETIC: no history was supplied. NOT A REAL PATIENT.', evidenceIds: ['C1'] }], clarifications: [] }), metrics: { testDouble: true as const } }; } });
  const current = await reviewedCurrentEncounter(service, patient.id);
  const result = await service.reviewChart(patient.id, current.id);
  assert.equal(supplied.packet.historical.length, 0);
  assert.equal(result.coverage.historicalRecordsAvailable, 0);
  assert.equal(result.coverage.historicalRecordsSupplied, 0);
  assert.deepEqual(result.coverage.dateRange, { from: null, to: null });
  assert.equal(result.output.findings[0].kind, 'unknown');
  // An output that fabricates historical evidence is rejected when history is empty.
  const fabricating = { ...runtimeDouble, reviewChart: async () => ({ text: JSON.stringify({ schemaVersion: 1, findings: [{ kind: 'changed', statement: 'x', evidenceIds: ['H1'] }], clarifications: [] }), metrics: { testDouble: true as const } }) };
  const second = await setup(t, fabricating);
  const encounter = await reviewedCurrentEncounter(second.service, second.patient.id);
  await assert.rejects(second.service.reviewChart(second.patient.id, encounter.id), /not part of the authorized packet/);
});

test('excerpts are sentence-bounded at 2000 characters and every omission is disclosed', async t => {
  const { service, patient } = await setup(t);
  const sentence = 'SYNTHETIC note sentence. NOT A REAL PATIENT. ';
  const longText = sentence.repeat(60); // 2700 chars, whole sentences
  const long = await approveSynthetic(service, patient.id, longText);
  const giant = await approveSynthetic(service, patient.id, 'x'.repeat(2100) + '.'); // first sentence exceeds the limit
  for (let i = 0; i < 6; i++) await approveSynthetic(service, patient.id, `SYNTHETIC older note ${i}. NOT A REAL PATIENT.`);
  const current = await reviewedCurrentEncounter(service, patient.id);
  const packet = buildChartReviewPacket(service.state(), patient.id, current.id, new Date().toISOString());
  assert.equal(packet.historical.length, 6); // the 6 most recent of 8 approved records
  assert.equal(packet.historical.some(h => h.recordId === long.record.id), false); // older two omitted by the record limit
  assert.equal(packet.historical.some(h => h.recordId === giant.record.id), false);
  assert.equal(packet.coverage.historicalRecordsAvailable, 8);
  assert.equal(packet.coverage.historicalRecordsSupplied, 6);
  assert.match(packet.coverage.omitted[0], /2 older approved record\(s\) omitted by the 6-record limit/);

  const small = await setup(t);
  const excerpted = await approveSynthetic(small.service, small.patient.id, longText);
  const giantRecord = await approveSynthetic(small.service, small.patient.id, 'x'.repeat(2100) + '.');
  const smallCurrent = await reviewedCurrentEncounter(small.service, small.patient.id);
  const bounded = buildChartReviewPacket(small.service.state(), small.patient.id, smallCurrent.id, new Date().toISOString());
  const h1 = bounded.historical.find(h => h.recordId === excerpted.record.id);
  assert.ok(h1.text.length <= 2000);
  assert.equal(longText.startsWith(h1.text), true);
  assert.equal(h1.text.endsWith(' '), true); // ends on a sentence boundary, never clipped
  assert.equal(h1.textSha256, sha(h1.text));
  assert.ok(bounded.coverage.omitted.some(note => note.includes(h1.evidenceId) && note.includes('omitted to keep sentences whole')));
  const h2 = bounded.historical.find(h => h.recordId === giantRecord.record.id);
  assert.equal(h2.text, '');
  assert.ok(bounded.coverage.omitted.some(note => note.includes(h2.evidenceId) && note.includes('never clipped')));
  const empty = validateChartReviewOutput(JSON.stringify({ schemaVersion: 1, findings: [], clarifications: [] }), bounded); // valid empty output parses fine
  assert.deepEqual(empty, { schemaVersion: 1, findings: [], clarifications: [] });
});

test('evidence budget (D1): oversized current source is refused and recorded; budget omissions name the record, date and reason', async t => {
  let invoked = 0;
  const counting = { ...runtimeDouble, reviewChart: async input => { invoked++; return runtimeDouble.reviewChart(input); } };
  const { service, patient } = await setup(t, counting);

  // A current source over 6000 characters is refused before any inference and recorded as rejected.
  const oversized = await reviewedCurrentEncounter(service, patient.id, 'SYNTHETIC oversized source. NOT A REAL PATIENT. ' + 'x'.repeat(6000));
  await assert.rejects(service.reviewChart(patient.id, oversized.id), /6000-character chart review evidence budget/);
  assert.equal(invoked, 0);
  const refused = service.state().chartReviews.at(-1);
  assert.equal(refused.status, 'rejected');
  assert.match(refused.rejection, /never silently truncated/);
  assert.equal(refused.packet, undefined);
  assert.throws(() => buildChartReviewPacket(service.state(), patient.id, oversized.id, new Date().toISOString()), /6000/);

  // Budget: current (3939) + first excerpt (1974) fits at 5913; the next 1974 would exceed 6000.
  const sentence = 'SYNTHETIC budget sentence. NOT A REAL PATIENT. '; // 47 characters
  const recordText = sentence.repeat(42); // 1974 characters, whole sentences
  const first = await approveSynthetic(service, patient.id, recordText);
  const second = await approveSynthetic(service, patient.id, recordText);
  const currentText = 'SYNTHETIC current. NOT A REAL PATIENT. ' + 'y'.repeat(3900); // 3939 characters
  const current = await reviewedCurrentEncounter(service, patient.id, currentText);
  const packet = buildChartReviewPacket(service.state(), patient.id, current.id, new Date().toISOString());
  assert.equal(packet.coverage.historicalRecordsAvailable, 2);
  assert.equal(packet.coverage.historicalRecordsSupplied, 1);
  assert.equal(packet.historical.length, 1);
  assert.equal(packet.historical[0].recordId, first.record.id); // oldest first
  assert.equal(packet.coverage.charactersSupplied, currentText.length + packet.historical[0].text.length);
  assert.equal(packet.coverage.charactersSupplied, 5913);
  const note = packet.coverage.omitted.find(n => n.includes(second.record.id));
  assert.ok(note, 'the omitted record must be named');
  assert.ok(note.includes('evidence budget'), 'the omission reason must be the evidence budget');
  assert.ok(note.includes(second.record.approvedAt.slice(0, 10)), 'the omission must carry the record date');

  const result = await service.reviewChart(patient.id, current.id);
  assert.equal(result.coverage.historicalRecordsSupplied, 1);
  assert.equal(invoked, 1);
  assert.equal(result.evidence.some(e => e.recordId === second.record.id), false);
});
