import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Vault } from '../packages/core/vault.js';
import { PsyRecService } from '../packages/core/service.js';
import { PhysicalObserver } from '../apps/desktop/physical-observer.js';

const image = Buffer.from('89504e470d0a1a0a00000000', 'hex');
const password = 'synthetic-only-test-passphrase';

test('observer drains input before lock and discards delayed views from the prior unlocked session', async t => {
  const { service, vault } = await setup(t);
  let finishView: (value: unknown) => void;
  let calls = 0;
  const fakeWindow = { isDestroyed: () => false, webContents: { executeJavaScript: () => {
    calls++;
    return calls === 1 ? new Promise(resolve => { finishView = resolve; }) : Promise.resolve({ workspaceHidden: true, fields: true, content: true, images: true });
  } } };
  const observer = new PhysicalObserver(service, fakeWindow as any);
  const pendingView = observer.view();
  const input = observer.input({ control: 'lock', eventType: 'click', trusted: false, approvalChecked: false, sourceText: '', draftText: '', patientId: '', encounterId: '' });
  observer.beginLock();
  finishView({ patientId: 'stale', historyText: 'stale private text' });
  await Promise.all([input, pendingView]);
  await observer.lockPurge();
  await service.lock();
  await vault.unlock(password);
  assert.deepEqual(vault.state.physicalObservations.map(e => e.event), ['renderer-input', 'lock-renderer-purge']);
  assert.equal(observer.failed, false);
  assert.equal(calls, 2);
  assert.ok(!(await readFile(vault.path, 'utf8')).includes('stale private text'));
});
// Unit-test double only. These records cannot qualify as real QVAC evidence.
const runtime = {
  extractImage: async () => ({ text: 'Synthetic patient reports improved sleep.', metrics: { testDouble: true as const } }),
  draftFromSource: async ({ text }) => ({ text: `Reviewed source: ${text}`, metrics: { testDouble: true as const } }),
};
async function setup(t, options = {}, replacementRuntime = runtime) {
  const dir = await mkdtemp(join(tmpdir(), 'psyrec-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const vault = new Vault(join(dir, 'vault.enc'));
  await vault.unlock(password, true);
  const service = new PsyRecService(vault, replacementRuntime, options);
  const patient = await service.addPatient('SYNTHETIC-001');
  const encounter = await service.addEncounter(patient.id);
  return { vault, service, patient, encounter };
}
async function record(service, encounter) {
  await service.importImage(encounter.id, image);
  const source = await service.extract(encounter.id);
  await service.reviewSource(encounter.id, source.text);
  const draft = await service.generateDraft(encounter.id);
  return service.approve(encounter.id, draft.id, draft.sourceRevision, draft.text);
}

test('approved record and performance records survive encrypted reload; wrong key changes nothing', async t => {
  const { vault, service, patient, encounter } = await setup(t);
  const saved = await record(service, encounter);
  const disk = await readFile(vault.path, 'utf8');
  assert.ok(!disk.includes('improved sleep'));
  await service.lock();
  await assert.rejects(vault.unlock('incorrect-passphrase'), /Incorrect passphrase/);
  assert.equal(await readFile(vault.path, 'utf8'), disk);
  await vault.unlock(password);
  assert.deepEqual(service.approvedNotes(patient.id), [saved]);
  assert.equal(vault.state.runs.length, 2);
  assert.deepEqual(saved.draftingMetrics, { testDouble: true as const });
});
test('source correction supersedes approval, preserves original, rejects stale approval', async t => {
  const { service, patient, encounter } = await setup(t);
  const old = await record(service, encounter);
  const preview = service.previewSourceChange(encounter.id, 'Sleep unchanged.');
  assert.equal(preview.approvalsToSupersede[0].id, old.id);
  await service.reviewSource(encounter.id, 'Sleep unchanged.');
  assert.equal(service.approvedNotes(patient.id).length, 0);
  assert.equal(service.approvedNotes(patient.id, true)[0].text, old.text);
  assert.ok(service.approvedNotes(patient.id, true)[0].supersededAt);
  await assert.rejects(service.approve(encounter.id, old.draftId, old.sourceRevision, old.text), /stale/);
  const fresh = await service.generateDraft(encounter.id);
  await service.approve(encounter.id, fresh.id, fresh.sourceRevision, fresh.text);
  assert.equal(service.approvedNotes(patient.id).length, 1);
  assert.equal(service.approvedNotes(patient.id, true).length, 2);
});
test('pairing is one-use; wrong peer fails; lost receipt retry deduplicates across restart', async t => {
  const { vault, service, encounter } = await setup(t);
  const invite = service.startPairing(encounter.id, 'https://192.168.1.2:9443', 'test');
  await assert.rejects(service.pair('wrong', 'Fold'), /invalid/);
  const paired = await service.pair(invite.secret, 'Fold');
  await assert.rejects(service.pair(invite.secret, 'Fold'), /invalid/);
  const request = { deviceId: paired.deviceId, token: paired.token, transferId: 'transfer-123', encounterId: encounter.id, bytes: image };
  await assert.rejects(service.receiveCapture({ ...request, token: 'wrong' }), /authorized|Unauthorized|device|Device/i);
  const first = await service.receiveCapture(request);
  await service.lock(); await vault.unlock(password);
  const retry = await service.receiveCapture(request);
  assert.equal(retry.duplicate, true);
  assert.equal(retry.captureId, first.captureId);
  await assert.rejects(service.receiveCapture({ ...request, bytes: Buffer.concat([image, Buffer.from('changed')]) }), /conflict|different/i);
  assert.equal(vault.state.transfers.length, 1);
  await service.revokeDevice(paired.deviceId);
  await assert.rejects(service.receiveCapture(request), /authorized|Unauthorized|device|Device/i);
});
test('historical retrieval validates patient/revision and ignores provider-authored text', async t => {
  let hits: any[] = [];
  const retriever = { retrieveApprovedNotes: async () => hits };
  const { service, patient, encounter } = await setup(t, { retriever });
  const prior = await record(service, encounter);
  const next = await service.addEncounter(patient.id);
  const valid = { patientId: patient.id, recordId: prior.id, sourceRevision: prior.sourceRevision, start: 0, end: 8, text: 'Provider fabrication' };
  hits = [valid];
  const accepted = await service.retrieveContext(patient.id, 'sleep', next.id);
  assert.equal(accepted.excerpts[0].text, prior.text.slice(0, 8));
  for (const invalid of [{ ...valid, patientId: 'someone-else' }, { ...valid, sourceRevision: 999 }, { ...valid, end: 99999 }]) {
    hits = [invalid];
    assert.deepEqual(await service.retrieveContext(patient.id, 'sleep', next.id), { status: 'unavailable', excerpts: [] });
  }
  hits = [valid];
  await service.reviewSource(encounter.id, 'Changed original source');
  assert.equal((await service.retrieveContext(patient.id, 'sleep', next.id)).status, 'unavailable');
});
test('retrieval timeout permits current-source workflow with unavailable history', async t => {
  const retriever = { retrieveApprovedNotes: () => new Promise<any[]>(() => {}) };
  const { service, encounter } = await setup(t, { retriever, retrievalTimeoutMs: 5 });
  await service.reviewSource(encounter.id, 'Synthetic current source');
  const draft = await service.generateDraft(encounter.id);
  assert.equal(draft.context.status, 'unavailable');
});
test('late inference after vault lock cannot persist output', async t => {
  let finish;
  const slowRuntime = { ...runtime, extractImage: () => new Promise<any>(resolve => { finish = resolve; }) };
  const { service, vault, encounter } = await setup(t, {}, slowRuntime);
  await service.importImage(encounter.id, image);
  const pending = service.extract(encounter.id);
  await service.lock();
  finish({ text: 'Late output', metrics: {} });
  await assert.rejects(pending, /session changed/);
  await vault.unlock(password);
  assert.equal(service.encounter(vault.state, encounter.id).source.revision, 0);
});
import { RuntimeEvidenceError } from '../packages/runtime/types.js';
import { validateRequest, isTrustedUiUrl } from '../apps/desktop/ipc.js';

test('failed inference evidence persists encrypted without changing source or draft', async t => {
  const failure = { schemaVersion: 1 as const, status: 'failed' as const, runId: 'failure-synthetic', operation: 'draft' as const, stage: 'completion', error: { name: 'RuntimeTimeoutError', message: 'Synthetic timeout' }, startedAt: new Date().toISOString(), endedAt: new Date().toISOString(), partialEvidence: { exactPrompt: 'SYNTHETIC PRIVATE PROMPT', generatedTokens: 3 } };
  const failedRuntime = { ...runtime, draftFromSource: async () => { throw new RuntimeEvidenceError('Timed out', failure); } };
  const { service, vault, encounter } = await setup(t, {}, failedRuntime);
  await service.reviewSource(encounter.id, 'Synthetic reviewed source');
  await assert.rejects(service.generateDraft(encounter.id), /Timed out/);
  assert.equal(service.encounter(vault.state, encounter.id).draft, null);
  assert.ok(!(await readFile(vault.path, 'utf8')).includes('SYNTHETIC PRIVATE PROMPT'));
  await service.lock(); await vault.unlock(password);
  assert.deepEqual(vault.state.runs[0], { encounterId: encounter.id, sourceRevision: 1, operation: 'draft', status: 'failed', evidence: failure });
});

test('exact approval preserves whitespace and selected-patient history excludes others', async t => {
  const { service, encounter, patient } = await setup(t);
  await service.reviewSource(encounter.id, 'Synthetic source');
  const draft = await service.generateDraft(encounter.id);
  const exact = '  Clinician edited synthetic note.\n';
  const saved = await service.approve(encounter.id, draft.id, draft.sourceRevision, exact);
  assert.equal(saved.text, exact);
  const other = await service.addPatient('SYNTHETIC-OTHER');
  assert.deepEqual(service.approvedNotes(other.id), []);
  assert.equal(service.approvedNotes(patient.id)[0].text, exact);
  await service.reviewSource(encounter.id, 'Synthetic source');
  assert.equal(service.encounter(service.state(), encounter.id).status, 'approved');
  await assert.rejects(service.approve(encounter.id, draft.id, draft.sourceRevision, exact), /stale/);
});

test('source preview rejects changed revisions and extraction cannot silently supersede reviewed source', async t => {
  const { service, encounter } = await setup(t);
  await service.importImage(encounter.id, image);
  await service.extract(encounter.id);
  const preview = service.previewSourceChange(encounter.id, 'First correction');
  await service.reviewSource(encounter.id, 'Second correction', preview.sourceRevision);
  await assert.rejects(service.reviewSource(encounter.id, 'First correction', preview.sourceRevision), /since preview/);
  await assert.rejects(service.extract(encounter.id), /Extraction already exists/);
});

test('TLS private identity is encrypted and absent from snapshots', async t => {
  const { service, vault } = await setup(t);
  const identity = { key: 'SYNTHETIC PRIVATE KEY', cert: 'SYNTHETIC CERT' };
  await service.saveTransportIdentity(identity);
  assert.equal(JSON.stringify(service.snapshot()).includes(identity.key), false);
  assert.equal((await readFile(vault.path, 'utf8')).includes(identity.key), false);
  await service.lock(); await vault.unlock(password);
  assert.deepEqual(service.getTransportIdentity(), identity);
});

test('IPC rejects unknown operations, wrong types and missing approval fields', () => {
  for (const [method, args] of [['constructor', []], ['approve', ['enc', 'draft', 1]], ['reviewSource', ['enc', 'text', '1']], ['approvedNotes', ['patient', 'false']], ['unlock', [{ password }, true]]]) {
    assert.throws(() => validateRequest(method, args), /Invalid request/);
  }
  validateRequest('approve', ['enc', 'draft', 1, 'Exact note']);
});

test('raw model output remains byte-exact for performance output hashes', async t => {
  const raw = '  Synthetic model output.\n';
  const rawRuntime = { extractImage: async () => ({ text: raw, metrics: { testDouble: true as const } }), draftFromSource: async () => ({ text: raw, metrics: { testDouble: true as const } }) };
  const { service, encounter } = await setup(t, {}, rawRuntime);
  await service.importImage(encounter.id, image);
  assert.equal((await service.extract(encounter.id)).text, raw);
  await service.reviewSource(encounter.id, raw);
  assert.equal((await service.generateDraft(encounter.id)).text, raw);
});

test('raw output and physical observation survive correction and encrypted reload without snapshot exposure', async t => {
  const { service, vault, encounter } = await setup(t);
  await service.importImage(encounter.id, image);
  const extraction = await service.extract(encounter.id);
  await service.recordPhysicalObservation('renderer-input', { trusted: true, control: 'reviewSource', sourceText: 'SYNTHETIC OBSERVED CORRECTION' });
  await service.reviewSource(encounter.id, 'SYNTHETIC OBSERVED CORRECTION');
  const draft = await service.generateDraft(encounter.id);
  assert.equal(JSON.stringify(service.snapshot()).includes('renderer-input'), false);
  await service.lock(); await vault.unlock(password);
  assert.ok(vault.state.runs[0].status !== 'failed');
  assert.ok(vault.state.runs[1].status !== 'failed');
  assert.equal(vault.state.runs[0].outputText, extraction.text);
  assert.equal(vault.state.runs[1].outputText, draft.text);
  assert.equal(vault.state.physicalObservations[0].details.control, 'reviewSource');
  assert.equal((await readFile(vault.path, 'utf8')).includes('SYNTHETIC OBSERVED CORRECTION'), false);
});


test('same-document fragments retain trusted IPC while other documents and query URLs do not', () => {
  const expected = 'file:///C:/workspace/apps/desktop/ui/index.html';
  assert.equal(isTrustedUiUrl(expected + '#', expected), true);
  assert.equal(isTrustedUiUrl(expected + '#history', expected), true);
  for (const url of [expected + '?other=1', expected + '.evil', 'https://example.test/index.html', 'not a URL']) assert.equal(isTrustedUiUrl(url, expected), false);
});

test('phone evidence authenticates durable binding, appends without rewriting, and stays encrypted across reload', async t => {
  const { service, vault, encounter } = await setup(t);
  const invite = service.startPairing(encounter.id, 'https://192.168.1.2:9443', 'test');
  const paired = await service.pair(invite.secret, 'Synthetic Fold evidence');
  const transferId = 'synthetic-lifecycle-001';
  const receipt = await service.receiveCapture({ ...paired, transferId, bytes: image });
  const report: import('../packages/contracts/index.js').PhoneLifecycleEvidence = {
    schemaVersion: 1, kind: 'native-android-transfer-lifecycle', platform: 'android', provenance: 'synthetic-instrumentation',
    binding: { transferId, encounterId: encounter.id, imageSha256: receipt.sha256, deviceId: paired.deviceId, captureId: receipt.captureId },
    build: { packageName: 'test.synthetic.psyrec', versionName: 'synthetic-test-only', versionCode: 1, apkSha256: 'a'.repeat(64) },
    events: [{ sequence: 1, type: 'capture_encrypted', observedAt: '2026-09-09T20:00:00.000Z', processSessionId: 'test-only-process', apkSha256: 'a'.repeat(64), queueCiphertextSha256: 'b'.repeat(64), photoPresent: true }],
  };
  const request = { ...paired, transferId, evidence: report };
  await assert.rejects(service.receivePhoneEvidence({ ...request, token: 'wrong' }), /authorized/);
  await assert.rejects(service.receivePhoneEvidence({ ...request, transferId: 'missing-transfer' }), /durable/);
  await assert.rejects(service.receivePhoneEvidence({ ...request, evidence: { ...report, binding: { ...report.binding, imageSha256: 'c'.repeat(64) } } }), /binding/);
  assert.deepEqual(await service.receivePhoneEvidence(request), { stored: true, transferId, encounterId: encounter.id, eventCount: 1, duplicate: false });
  assert.equal((await service.receivePhoneEvidence(request)).duplicate, true);
  assert.equal(service.state().phoneEvidence.length, 1);
  const extended = structuredClone(report);
  extended.events.push({ sequence: 2, type: 'matching_receipt_received', observedAt: '2026-09-09T20:00:01.000Z', processSessionId: 'test-only-process', apkSha256: 'a'.repeat(64), receipt });
  assert.equal((await service.receivePhoneEvidence({ ...request, evidence: extended })).duplicate, false);
  assert.equal(service.state().phoneEvidence.length, 2);
  assert.equal(service.state().phoneEvidence[0].evidence.events.length, 1);
  await assert.rejects(service.receivePhoneEvidence(request), /rewrite/);
  const changed = structuredClone(extended); changed.events[0].photoPresent = false;
  await assert.rejects(service.receivePhoneEvidence({ ...request, evidence: changed }), /rewrite/);
  const changedBuild = structuredClone(extended); changedBuild.build.apkSha256 = 'c'.repeat(64);
  await assert.rejects(service.receivePhoneEvidence({ ...request, evidence: changedBuild }), /rewrite/);
  const malformed = structuredClone(extended) as any; malformed.events[0].unexpectedText = 'do not accept arbitrary fields';
  await assert.rejects(service.receivePhoneEvidence({ ...request, evidence: malformed }), /schema/);
  assert.equal(JSON.stringify(service.snapshot()).includes('native-android-transfer-lifecycle'), false);
  assert.equal((await readFile(vault.path, 'utf8')).includes('synthetic-test-only'), false);
  await service.lock(); await vault.unlock(password);
  assert.deepEqual(vault.state.phoneEvidence.at(-1).evidence, extended);
  await service.revokeDevice(paired.deviceId);
  await assert.rejects(service.receivePhoneEvidence({ ...request, evidence: extended }), /authorized/);
});

test('printed source attestation requires trusted input and binds the current canonical capture', async t => {
  const { service, vault, patient, encounter } = await setup(t);
  await service.importImage(encounter.id, image);
  const fakeWindow = { isDestroyed: () => false, webContents: { executeJavaScript: async () => ({}) } };
  const observer = new PhysicalObserver(service, fakeWindow as any);
  const input = { control: 'attestPrintedSource', eventType: 'click', trusted: false, approvalChecked: false, sourceText: '', draftText: '', patientId: patient.id, encounterId: encounter.id, captureId: 'forged-capture', sha256: 'forged-hash' };
  await observer.input(input);
  assert.deepEqual(service.state().physicalObservations.map(e => e.event), ['renderer-input']);
  await observer.input({ ...input, trusted: true });
  observer.beginLock();
  const events = service.state().physicalObservations;
  assert.deepEqual(events.map(e => e.event), ['renderer-input', 'renderer-input', 'printed-source-attestation']);
  const capture = service.encounter(service.state(), encounter.id).capture;
  assert.equal(events[1].details.captureId, capture.id);
  assert.equal(events[1].details.sha256, capture.sha256);
  assert.equal(events[2].details.captureId, capture.id);
  assert.equal(events[2].details.actor, 'human');
  assert.equal(events[2].details.fixtureId, 'DEMO-001');
  assert.equal(events[2].details.sourceMedium, 'paper');
  assert.equal(events[2].details.method, 'physical-paper-observation');
  assert.ok(Number.isFinite(Date.parse(String(events[2].details.observedAt))));
  await service.lock(); await vault.unlock(password);
  assert.equal(vault.state.physicalObservations.at(-1).event, 'printed-source-attestation');
});

test('observer checkpoint drains an in-flight view and records failure before export can inspect status', async t => {
  const { service } = await setup(t);
  let release: (value: unknown) => void;
  let calls = 0;
  const fakeWindow = { isDestroyed: () => false, webContents: { executeJavaScript: () => ++calls === 1 ? new Promise(resolve => { release = resolve; }) : Promise.resolve({ patientId: 'synthetic', historyText: '', canonicalApprovedRecords: [] }) } };
  const observer = new PhysicalObserver(service, fakeWindow as any);
  const view = observer.view();
  let settled = false;
  const checkpoint = observer.checkpoint().then(result => { settled = true; return result; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(settled, false);
  release({ patientId: 'synthetic', historyText: '', canonicalApprovedRecords: [] });
  await view;
  assert.equal((await checkpoint).failed, false);
  assert.equal(service.state().physicalObservations.filter(e => e.event === 'renderer-view').length, 2);
  observer.beginLock();
  const failureWindow = { isDestroyed: () => false, webContents: { executeJavaScript: async () => { throw new Error('synthetic observation failure'); } } };
  const failedObserver = new PhysicalObserver(service, failureWindow as any);
  assert.equal((await failedObserver.checkpoint()).failed, true);
  assert.equal(failedObserver.failed, true);
});
