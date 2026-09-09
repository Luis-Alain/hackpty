import { test } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:https';
import { connect } from 'node:tls';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CaptureServer } from '../packages/transport/server.js';
import { PsyRecService } from '../packages/core/service.js';
import { Vault } from '../packages/core/vault.js';

const bytes = Buffer.from('89504e470d0a1a0a00000000', 'hex');
async function setup(t) {
  const directory = await mkdtemp(join(tmpdir(), 'psyrec-synthetic-tls-'));
  const vault = new Vault(join(directory, 'vault.enc')); await vault.unlock('synthetic-transfer-password', true);
  const service = new PsyRecService(vault, {} as any);
  const patient = await service.addPatient('SYNTHETIC-TLS'); const encounter = await service.addEncounter(patient.id);
  const server = new CaptureServer(service, directory); const address = await server.start('127.0.0.1', 0);
  t.after(async () => { await server.stop(); vault.lock(); await rm(directory, { recursive: true, force: true }); });
  return { directory, vault, service, server, address, encounter };
}
function post(address, cert: string, path: string, value: unknown, token?: string, pin = address.certificateFingerprint): Promise<any> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(value);
    const req = request(address.endpoint + path, {
      method: 'POST', ca: cert, checkServerIdentity: (_host, peer) => {
        if (createHash('sha256').update(peer.raw).digest('hex') !== pin) return new Error('Paired certificate mismatch');
      }, headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), ...(token ? { Authorization: `Bearer ${token}` } : {}) }
    }, response => {
      let text = ''; response.on('data', data => text += data); response.on('end', () => resolve({ status: response.statusCode, body: JSON.parse(text) }));
    });
    req.on('error', reject); req.end(data);
  });
}
test('real HTTPS rejects wrong certificate pin; pairing is one-use and identity stays encrypted across restart', async t => {
  const { directory, vault, service, server, address, encounter } = await setup(t);
  const identity = service.getTransportIdentity()!;
  const invite = service.startPairing(encounter.id, address.endpoint, address.certificateFingerprint);
  await assert.rejects(post(address, identity.cert, '/pair', { secret: invite.secret, deviceName: 'Synthetic phone' }, undefined, '0'.repeat(64)), /certificate mismatch/);
  const paired = await post(address, identity.cert, '/pair', { secret: invite.secret, deviceName: 'Synthetic phone' });
  assert.equal(paired.status, 200);
  assert.equal((await post(address, identity.cert, '/pair', { secret: invite.secret, deviceName: 'Synthetic phone' })).status, 400);
  assert.ok(!(await readFile(vault.path, 'utf8')).includes('PRIVATE KEY'));
  assert.deepEqual(await readdir(directory), ['vault.enc']);
  await server.stop(); await service.lock(); await vault.unlock('synthetic-transfer-password');
  assert.equal((await server.start('127.0.0.1', 0)).certificateFingerprint, address.certificateFingerprint);
});

test('partial TLS upload cannot create receipt; durable retry deduplicates after vault reload and rejects altered payload', async t => {
  const { vault, service, server, address, encounter } = await setup(t);
  const identity = service.getTransportIdentity()!;
  const invitation = service.startPairing(encounter.id, address.endpoint, address.certificateFingerprint);
  const { body: credentials } = await post(address, identity.cert, '/pair', { secret: invitation.secret, deviceName: 'Synthetic phone' });
  await new Promise<void>((resolve, reject) => {
    const socket = connect({ host: '127.0.0.1', port: Number(new URL(address.endpoint).port), ca: identity.cert,
      checkServerIdentity: () => undefined }, () => {
      socket.write('POST /captures HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: 1000\r\n\r\n{"partial":');
      setTimeout(() => { socket.destroy(); resolve(); }, 30);
    }); socket.on('error', reject);
  });
  assert.equal(vault.state.transfers.length, 0);
  const payload = { deviceId: credentials.deviceId, encounterId: encounter.id, transferId: 'synthetic-transfer-0001', image: bytes.toString('base64') };
  const first = await post(address, identity.cert, '/captures', payload, credentials.token);
  assert.equal(first.status, 200); assert.equal(first.body.sha256, createHash('sha256').update(bytes).digest('hex'));
  await server.stop(); await service.lock(); await vault.unlock('synthetic-transfer-password');
  const restarted = await server.start('127.0.0.1', 0);
  const retry = await post(restarted, identity.cert, '/captures', payload, credentials.token);
  assert.equal(retry.status, 200); assert.equal(retry.body.duplicate, true); assert.equal(retry.body.captureId, first.body.captureId);
  assert.equal(vault.state.transfers.length, 1);
  assert.equal((await post(restarted, identity.cert, '/captures', { ...payload, image: Buffer.concat([bytes, Buffer.from('altered')]).toString('base64') }, credentials.token)).status, 400);
  assert.equal((await post(restarted, identity.cert, '/captures', { ...payload, encounterId: 'different-encounter' }, credentials.token)).status, 400);
});
