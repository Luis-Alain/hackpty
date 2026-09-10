import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as tcp from 'node:net';
import { connect as connectTls } from 'node:tls';
import { request } from 'node:https';
import { createHash, randomUUID } from 'node:crypto';
import { createSocket } from 'node:dgram';
import { once } from 'node:events';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import DHT from 'hyperdht';
import { CaptureServer } from '../packages/transport/server.js';
import { PsyRecService } from '../packages/core/service.js';
import { Vault } from '../packages/core/vault.js';

const { createTunnelClient } = createRequire(import.meta.url)(resolve('apps/mobile/p2p/tunnel-client.cjs'));
const password = 'synthetic-hyperswarm-test-password';
const bytes = Buffer.from('89504e470d0a1a0a00000000', 'hex');
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate: () => boolean) {
  const deadline = Date.now() + 3000;
  while (!predicate()) { if (Date.now() > deadline) throw new Error('Synthetic transport state timed out'); await pause(10); }
}
async function setup(t: any) {
  const directory = await mkdtemp(join(tmpdir(), 'psyrec-synthetic-hyperswarm-'));
  const vault = new Vault(join(directory, 'vault.enc')); await vault.unlock(password, true);
  const service = new PsyRecService(vault, {} as any);
  const server = new CaptureServer(service, directory); const address = await server.start('127.0.0.1', 0);
  const cleanups: Array<() => Promise<unknown> | void> = [];
  t.after(async () => {
    for (const cleanup of cleanups.reverse()) await cleanup();
    await server.stop(); await service.lock();
    // Delete only the unique synthetic directory created by this test.
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    assert.ok(directory.split(/[\\/]/).at(-1)!.startsWith('psyrec-synthetic-hyperswarm-'));
    await rm(directory, { recursive: true, force: true });
  });
  return { directory, vault, service, server, address, cleanups };
}
async function localDht(cleanups: Array<() => Promise<unknown> | void>) {
  const reservation = createSocket('udp4');
  await new Promise<void>(resolve => reservation.bind(0, '127.0.0.1', resolve));
  const port = reservation.address().port;
  await new Promise<void>(resolve => reservation.close(() => resolve()));
  const bootstrapNode = DHT.bootstrapper(port, '127.0.0.1'); await bootstrapNode.ready();
  const bootstrap = [`127.0.0.1:${port}`];
  const nodes: any[] = [];
  cleanups.push(async () => { await Promise.all(nodes.map(node => node.destroy({ force: true }))); await bootstrapNode.destroy({ force: true }); });
  return { bootstrap, makeNode: () => { const node = new DHT({ bootstrap }); nodes.push(node); return node; } };
}
function post(port: number, cert: string, pin: string, path: string, body: any, token?: string): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = request({ host: '127.0.0.1', port, path, method: 'POST', agent: false, ca: cert,
      checkServerIdentity: (_host, peer) => createHash('sha256').update(peer.raw).digest('hex') === pin ? undefined : new Error('Paired certificate mismatch'),
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), ...(token ? { Authorization: `Bearer ${token}` } : {}) }
    }, response => {
      let data = ''; response.on('data', chunk => { data += chunk; }); response.on('error', reject);
      response.on('end', () => { try { resolve({ status: response.statusCode!, body: JSON.parse(data) }); } catch (error) { reject(error); } });
    });
    req.on('error', reject); req.setTimeout(5000, () => req.destroy(new Error('Synthetic request timed out'))); req.end(data);
  });
}

test('actual mobile P2P client preserves one-use pairing, authorization, interrupted retry and encrypted durable receipts across restart', { timeout: 30000 }, async t => {
  const s = await setup(t); const net = await localDht(s.cleanups);
  assert.equal((s.server as any).p2p, null, 'Local HTTPS start must not join a DHT');
  const patient = await s.service.addPatient('SYNTHETIC-P2P-A'); const encounter = await s.service.addEncounter(patient.id);
  const otherPatient = await s.service.addPatient('SYNTHETIC-P2P-B'); const otherEncounter = await s.service.addEncounter(otherPatient.id);
  const publicKey = await s.server.startHyperswarm({ bootstrap: net.bootstrap, dht: net.makeNode() });
  const client = await createTunnelClient(tcp, publicKey, { bootstrap: net.bootstrap, timeoutMs: 5000 });
  s.cleanups.push(() => client.stop());
  const identity = s.service.getTransportIdentity()!; const pin = s.address.certificateFingerprint;
  const send = async (path: string, body: any, token?: string) => {
    const result = await post(client.port, identity.cert, pin, path, body, token);
    await until(() => client.activeConnections === 0); return result;
  };
  const invitation = s.service.startPairing(encounter.id, s.address.endpoint, pin, true);
  const paired = await send('/pair', { secret: invitation.secret, deviceName: 'Synthetic P2P phone' });
  assert.equal(paired.status, 200); const credentials = paired.body;
  assert.equal((await send('/pair', { secret: invitation.secret, deviceName: 'Synthetic duplicate' })).status, 400);
  const payload = { deviceId: credentials.deviceId, encounterId: encounter.id, transferId: 'synthetic-p2p-transfer-0001', image: bytes.toString('base64') };
  assert.equal((await send('/captures', payload)).status, 400);
  assert.equal((await send('/captures', payload, 'altered-token')).status, 400);
  assert.equal((await send('/captures', { ...payload, encounterId: otherEncounter.id }, credentials.token)).status, 400);
  assert.equal(s.vault.state!.transfers.length, 0);

  const partial = connectTls({ host: '127.0.0.1', port: client.port, ca: identity.cert, checkServerIdentity: (_host, peer) =>
    createHash('sha256').update(peer.raw).digest('hex') === pin ? undefined : new Error('Pin mismatch') });
  partial.on('error', () => {}); s.cleanups.push(() => { partial.destroy(); });
  await once(partial, 'secureConnect');
  const prefix = JSON.stringify(payload).slice(0, -5);
  await new Promise<void>((resolve, reject) => partial.write(`POST /captures HTTP/1.1\r\nHost: 127.0.0.1\r\nAuthorization: Bearer ${credentials.token}\r\nContent-Type: application/json\r\nContent-Length: 9999\r\n\r\n${prefix}`, error => error ? reject(error) : resolve()));
  await pause(50); partial.destroy(); await until(() => client.activeConnections === 0);
  assert.equal(s.vault.state!.transfers.length, 0, 'An incomplete upload must produce no receipt');
  assert.equal(s.vault.state!.encounters.find(value => value.id === encounter.id)!.capture, null);
  const first = await send('/captures', payload, credentials.token);
  assert.equal(first.status, 200); assert.equal(first.body.duplicate, false);
  assert.equal(first.body.sha256, createHash('sha256').update(bytes).digest('hex'));
  assert.equal(s.vault.state!.transfers.length, 1);
  assert.equal((await send('/captures', { ...payload, image: Buffer.concat([bytes, Buffer.from('changed')]).toString('base64') }, credentials.token)).status, 400);
  const disk = await readFile(s.vault.path, 'utf8');
  for (const forbidden of [credentials.token, invitation.secret, 'PRIVATE KEY', payload.image, patient.alias]) assert.ok(!disk.includes(forbidden));
  assert.deepEqual(await readdir(s.directory), ['vault.enc']);

  await client.stop(); await s.server.stop(); await s.service.lock();
  const restoredVault = new Vault(s.vault.path); await restoredVault.unlock(password);
  const restoredService = new PsyRecService(restoredVault, {} as any);
  const restoredServer = new CaptureServer(restoredService, s.directory);
  s.cleanups.push(async () => { await restoredServer.stop(); await restoredService.lock(); });
  const restoredAddress = await restoredServer.start('127.0.0.1', 0);
  assert.equal(restoredAddress.certificateFingerprint, pin);
  const restoredKey = await restoredServer.startHyperswarm({ bootstrap: net.bootstrap, dht: net.makeNode() });
  assert.equal(restoredKey, publicKey, 'Noise identity must derive from the same encrypted TLS identity');
  const restoredClient = await createTunnelClient(tcp, restoredKey, { bootstrap: net.bootstrap, timeoutMs: 5000 });
  s.cleanups.push(() => restoredClient.stop());
  const retry = await post(restoredClient.port, identity.cert, pin, '/captures', payload, credentials.token);
  assert.equal(retry.status, 200); assert.equal(retry.body.duplicate, true);
  assert.equal(retry.body.captureId, first.body.captureId); assert.equal(retry.body.receivedAt, first.body.receivedAt);
  assert.equal(restoredVault.state!.transfers.length, 1);

  // Explicit synthetic approved-record fixtures; no model or human approval is claimed.
  const recordIds: string[] = [];
  for (const [patientId, text] of [[patient.id, 'SYNTHETIC approved scoped note'], [otherPatient.id, 'SYNTHETIC other patient note']]) {
    const sourceEncounter = await restoredService.addEncounter(patientId);
    const fixture = restoredVault.state!.encounters.find(value => value.id === sourceEncounter.id)!;
    fixture.source = { revision: 1, text, reviewed: true }; fixture.status = 'approved';
    const id = randomUUID(); recordIds.push(id);
    restoredVault.state!.records.push({ id, patientId, encounterId: sourceEncounter.id, sourceRevision: 1, sourceText: text, text,
      draftId: randomUUID(), modelDraftText: 'synthetic fixture', clinicianEdited: false, approvedAt: new Date().toISOString(), supersededAt: null, context: [], draftingMetrics: { testDouble: true } });
    await restoredVault.save(restoredVault.state!);
  }
  const history = await post(restoredClient.port, identity.cert, pin, '/history', { deviceId: credentials.deviceId, encounterId: encounter.id }, credentials.token);
  assert.equal(history.status, 200); assert.equal(history.body.patient.id, patient.id);
  assert.deepEqual(history.body.records.map(value => value.id), [recordIds[0]]);
  assert.ok(!JSON.stringify(history.body).includes('other patient'));
  const cross = await post(restoredClient.port, identity.cert, pin, '/history', { deviceId: credentials.deviceId, encounterId: otherEncounter.id }, credentials.token);
  assert.equal(cross.status, 403);
});

for (const rejectShutdown of [false, true]) {
  test(`receiver detaches and closes TLS before delayed P2P shutdown ${rejectShutdown ? 'rejects' : 'resolves'}`, { timeout: 15000 }, async t => {
    const s = await setup(t); const identity = s.service.getTransportIdentity()!;
    const socket = connectTls({ host: '127.0.0.1', port: Number(new URL(s.address.endpoint).port), ca: identity.cert, checkServerIdentity: () => undefined });
    socket.on('error', () => {}); s.cleanups.push(() => { socket.destroy(); });
    await once(socket, 'secureConnect');
    // Keep an actual HTTP request open so the server must actively close an application socket.
    socket.write('POST /captures HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: 9999\r\n\r\n{"partial":');
    await pause(20);
    let complete: (value?: unknown) => void; let fail: (error: Error) => void;
    const delayed = new Promise((resolve, reject) => { complete = resolve; fail = reject; });
    (s.server as any).p2p = { stop: () => delayed };
    (s.server as any).p2pKey = 'a'.repeat(64);
    let finished = false;
    const stopping = s.server.stop(); stopping.then(() => { finished = true; }, () => { finished = true; });
    assert.equal(s.server.server, null); assert.equal((s.server as any).p2p, null); assert.equal((s.server as any).p2pKey, null);
    await until(() => socket.destroyed);
    assert.equal(finished, false, 'TLS close must not wait for unresolved P2P shutdown');
    const probe = tcp.connect({ host: '127.0.0.1', port: Number(new URL(s.address.endpoint).port) });
    const error = await new Promise<Error>(resolve => probe.once('error', resolve));
    assert.equal((error as any).code, 'ECONNREFUSED'); probe.destroy();
    if (rejectShutdown) { fail!(new Error('Synthetic P2P shutdown failure')); await assert.rejects(stopping, /Synthetic P2P shutdown failure/); }
    else { complete!(); await stopping; }
    assert.equal(s.vault.state!.transfers.length, 0);
  });
}

