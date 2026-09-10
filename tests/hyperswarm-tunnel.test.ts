import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer as createTlsServer, connect as connectTls } from 'node:tls';
import { createServer as createTcpServer } from 'node:net';
import { randomBytes, X509Certificate } from 'node:crypto';
import * as tcp from 'node:net';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { createSocket } from 'node:dgram';
import { once } from 'node:events';
import selfsigned from 'selfsigned';
import DHT from 'hyperdht';
import { HyperswarmTunnel } from '../packages/transport/hyperswarm-tunnel.js';

const { createTunnelClient } = createRequire(import.meta.url)(resolve('apps/mobile/p2p/tunnel-client.cjs'));
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate: () => boolean, timeout = 3000) {
  const end = Date.now() + timeout;
  while (!predicate()) { if (Date.now() >= end) throw new Error('Condition timed out'); await pause(10); }
}
async function network(t: any) {
  const reservation = createSocket('udp4');
  await new Promise<void>(resolve => reservation.bind(0, '127.0.0.1', resolve));
  const bootstrapPort = reservation.address().port;
  await new Promise<void>(resolve => reservation.close(() => resolve()));
  const bootstrapNode = DHT.bootstrapper(bootstrapPort, '127.0.0.1');
  await bootstrapNode.ready();
  const bootstrap = [`127.0.0.1:${bootstrapNode.address().port}`];
  const nodes: any[] = [];
  const makeNode = () => { const node = new DHT({ bootstrap }); nodes.push(node); return node; };
  t.after(async () => { await Promise.all(nodes.map(node => node.destroy({ force: true }))); await bootstrapNode.destroy({ force: true }); });
  return { bootstrap, makeNode };
}
function peer(node: any, publicKey: string) {
  const socket = node.connect(Buffer.from(publicKey, 'hex'));
  socket.on('error', () => {});
  return socket;
}
async function receiver(t: any) {
  const pems = selfsigned.generate([{ name: 'commonName', value: 'Synthetic tunnel test' }], { keySize: 2048, days: 1, algorithm: 'sha256' });
  let received = 0;
  const connections = new Set<any>();
  const server = createTlsServer({ key: pems.private, cert: pems.cert }, socket => {
    socket.on('error', () => {});
    socket.on('data', chunk => { received += chunk.length; socket.write(chunk); });
  });
  server.on('connection', socket => { connections.add(socket); socket.on('error', () => {}); socket.once('close', () => connections.delete(socket)); });
  server.on('tlsClientError', () => {});
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { for (const socket of connections) socket.destroy(); await new Promise<void>(resolve => server.close(() => resolve())); });
  return { port: (server.address() as any).port, cert: pems.cert, connections, received: () => received };
}
async function tunnel(t: any, net: any, targetPort: number, options: any = {}) {
  const tunnel = new HyperswarmTunnel();
  const result = await tunnel.start({ targetHost: '127.0.0.1', targetPort, seed: randomBytes(32), bootstrap: net.bootstrap, dht: net.makeNode(), ...options });
  t.after(() => tunnel.stop());
  return { tunnel, ...result };
}

test('real isolated Hyperswarm carries pinned TLS bytes with backpressure and closes both sockets', { timeout: 20000 }, async t => {
  const net = await network(t); const tls = await receiver(t);
  const { tunnel: transport, publicKey } = await tunnel(t, net, tls.port);
  const client = await createTunnelClient(tcp, publicKey, { bootstrap: net.bootstrap, timeoutMs: 5000 });
  t.after(() => client.stop());
  const expectedPin = new X509Certificate(tls.cert).fingerprint256;
  const secure = connectTls({ host: '127.0.0.1', port: client.port, ca: tls.cert, checkServerIdentity: (_host, cert) => {
    if (cert.fingerprint256 !== expectedPin) return new Error('Pin mismatch');
  } });
  secure.on('error', () => {});
  t.after(() => secure.destroy());
  await once(secure, 'secureConnect');
  const payload = randomBytes(512 * 1024); const parts: Buffer[] = []; let size = 0;
  const echoed = new Promise<Buffer>((resolve, reject) => {
    secure.on('data', chunk => { parts.push(chunk); size += chunk.length; if (size === payload.length) resolve(Buffer.concat(parts)); });
    secure.once('error', reject);
  });
  secure.write(payload);
  assert.deepEqual(await echoed, payload);
  assert.equal(tls.received(), payload.length);
  assert.equal(transport.activeConnections, 1);
  const closed = once(secure, 'close');
  await transport.stop(); await closed;
  await until(() => tls.connections.size === 0);
  assert.equal(transport.activeConnections, 0);
  await transport.stop();
});

test('wrong Noise public key gets no receiver connection and wrong TLS pin sends no application bytes', { timeout: 20000 }, async t => {
  const net = await network(t); const tls = await receiver(t);
  const { publicKey } = await tunnel(t, net, tls.port);
  const wrong = peer(net.makeNode(), randomBytes(32).toString('hex'));
  let opened = false; wrong.once('open', () => { opened = true; });
  await pause(250); wrong.destroy();
  assert.equal(opened, false); assert.equal(tls.connections.size, 0);
  const client = await createTunnelClient(tcp, publicKey, { bootstrap: net.bootstrap, timeoutMs: 5000 });
  t.after(() => client.stop());
  const secure = connectTls({ host: '127.0.0.1', port: client.port, ca: tls.cert, checkServerIdentity: () => new Error('Paired certificate mismatch') });
  t.after(() => secure.destroy());
  const failure = await new Promise<Error>(resolve => secure.once('error', resolve));
  assert.match(failure.message, /certificate mismatch/);
  assert.equal(tls.received(), 0);
});

test('connection limit, idle deadline, and refused local target release resources', { timeout: 20000 }, async t => {
  const net = await network(t); const tls = await receiver(t);
  const { tunnel: transport, publicKey } = await tunnel(t, net, tls.port, { maxConnections: 1, idleTimeoutMs: 500 });
  const first = peer(net.makeNode(), publicKey); await once(first, 'open');
  await until(() => transport.activeConnections === 1);
  const second = peer(net.makeNode(), publicKey); let secondOpened = false;
  second.once('open', () => { secondOpened = true; });
  await pause(100);
  assert.equal(transport.activeConnections, 1); assert.equal(secondOpened, false);
  second.destroy();
  await until(() => transport.activeConnections === 0);
  await until(() => first.destroyed && tls.connections.size === 0);
  const unused = createTcpServer(); await new Promise<void>(resolve => unused.listen(0, '127.0.0.1', resolve));
  const port = (unused.address() as any).port; await new Promise<void>(resolve => unused.close(() => resolve()));
  const refused = await tunnel(t, net, port);
  const third = peer(net.makeNode(), refused.publicKey); await once(third, 'open');
  await until(() => third.destroyed && refused.tunnel.activeConnections === 0);
});

test('validates local target and limits, preserves caller seed, and can restart with the same public identity', { timeout: 20000 }, async t => {
  const transport = new HyperswarmTunnel();
  const seed = randomBytes(32); const originalSeed = Buffer.from(seed);
  const base = { targetHost: '127.0.0.1', targetPort: 9443, seed };
  for (const invalid of [{ targetHost: '192.0.2.1' }, { targetPort: 0 }, { seed: randomBytes(31) }, { maxConnections: 0 }, { idleTimeoutMs: -1 }, { connectionTimeoutMs: Infinity }, { maxConnectionLifetimeMs: 0 }]) {
    await assert.rejects(transport.start({ ...base, ...invalid }));
  }
  const net = await network(t); t.after(() => transport.stop());
  const one = await transport.start({ ...base, bootstrap: net.bootstrap, dht: net.makeNode() });
  await assert.rejects(transport.start(base), /Stop the current/);
  await Promise.all([transport.stop(), transport.stop()]);
  const two = await transport.start({ ...base, bootstrap: net.bootstrap, dht: net.makeNode() });
  assert.equal(one.publicKey, two.publicKey); assert.deepEqual(seed, originalSeed);
});




test('actual mobile client supports four concurrent TLS requests, repeat requests, and stop cleanup', { timeout: 20000 }, async t => {
  const net = await network(t); const tls = await receiver(t);
  const { tunnel: transport, publicKey } = await tunnel(t, net, tls.port);
  const client = await createTunnelClient(tcp, publicKey, { bootstrap: net.bootstrap, timeoutMs: 5000 });
  t.after(() => client.stop());
  const requests: any[] = [];
  async function roundtrip(index: number) {
    const secure = connectTls({ host: '127.0.0.1', port: client.port, ca: tls.cert, checkServerIdentity: (_host, cert) => {
      if (cert.fingerprint256 !== new X509Certificate(tls.cert).fingerprint256) return new Error('Pin mismatch');
    } });
    secure.on('error', () => {}); requests.push(secure); t.after(() => secure.destroy());
    await once(secure, 'secureConnect');
    const payload = Buffer.alloc(64 * 1024, index); const chunks: Buffer[] = []; let size = 0;
    const echo = new Promise<Buffer>((resolve, reject) => {
      secure.on('data', chunk => { chunks.push(chunk); size += chunk.length; if (size === payload.length) resolve(Buffer.concat(chunks)); });
      secure.once('error', reject);
    });
    secure.write(payload); assert.deepEqual(await echo, payload);
    return secure;
  }
  await Promise.all([1, 2, 3, 4].map(roundtrip));
  assert.equal(client.activeConnections, 4); assert.equal(transport.activeConnections, 4);
  const overflow = tcp.connect({ host: '127.0.0.1', port: client.port });
  overflow.on('error', () => {});
  await once(overflow, 'close');
  assert.equal(client.activeConnections, 4); assert.equal(transport.activeConnections, 4);
  requests[0].destroy();
  await until(() => client.activeConnections === 3 && transport.activeConnections === 3);
  await roundtrip(5);
  assert.equal(client.activeConnections, 4); assert.equal(transport.activeConnections, 4);
  await client.stop();
  await until(() => transport.activeConnections === 0 && tls.connections.size === 0);
  assert.equal(client.activeConnections, 0);
  assert.ok(requests.every(socket => socket.destroyed));
  await client.stop();
});

test('maximum connection lifetime closes a non-idle connection', { timeout: 20000 }, async t => {
  const net = await network(t);
  const sockets = new Set<tcp.Socket>();
  const sink = createTcpServer(socket => { sockets.add(socket); socket.on('data', () => {}); socket.on('error', () => {}); socket.on('close', () => sockets.delete(socket)); });
  await new Promise<void>(resolve => sink.listen(0, '127.0.0.1', resolve));
  t.after(async () => { for (const socket of sockets) socket.destroy(); await new Promise<void>(resolve => sink.close(() => resolve())); });
  const { tunnel: transport, publicKey } = await tunnel(t, net, (sink.address() as any).port, { idleTimeoutMs: 1000, maxConnectionLifetimeMs: 150 });
  const remote = peer(net.makeNode(), publicKey); await once(remote, 'open');
  const trickle = setInterval(() => { if (!remote.destroyed) remote.write(Buffer.from('synthetic')); }, 20);
  t.after(() => clearInterval(trickle));
  await until(() => remote.destroyed && transport.activeConnections === 0);
  clearInterval(trickle);
  await until(() => sockets.size === 0);
});

