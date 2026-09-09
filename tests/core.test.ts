import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Vault } from '../packages/core/vault.js';
import { PsyRecService } from '../packages/core/service.js';

const image = Buffer.from('89504e470d0a1a0a00000000', 'hex');
const password = 'synthetic-only-test-passphrase';
// Unit-test double only. These records cannot qualify as real QVAC evidence.
const runtime = {
  extractImage: async () => ({ text: 'Synthetic patient reports improved sleep.', metrics: { testDouble: true } }),
  draftFromSource: async ({ text }) => ({ text: `Reviewed source: ${text}`, metrics: { testDouble: true } }),
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
  assert.deepEqual(saved.draftingMetrics, { testDouble: true });
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
