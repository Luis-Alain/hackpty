import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

function setup() {
  const listeners: ((state: string) => void)[] = [];
  const app = { currentState: 'active', addEventListener: (_event: string, cb: (state: string) => void) => listeners.push(cb) };
  const calls: string[] = [];
  const worklets: FakeWorklet[] = [];
  let route = 0;
  let delayReady = false;
  class FakeWorklet {
    IPC: any = new EventEmitter();
    terminated = false;
    constructor() {
      worklets.push(this);
      this.IPC.write = () => { if (!delayReady) queueMicrotask(() => this.ready()); };
    }
    start() {}
    ready() { this.IPC.emit('data', Buffer.from(JSON.stringify({ ready: true, port: 40001 }) + '\n')); }
    terminate() { this.terminated = true; this.IPC.emit('close'); }
  }
  const exports: any = {};
  const source = ts.transpileModule(readFileSync('apps/mobile/src/hyperswarm-transfer.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
  }).outputText;
  runInNewContext(source, { exports, Uint8Array, setTimeout, clearTimeout, queueMicrotask,
    require(name: string) {
      if (name === 'react-native') return { AppState: app };
      if (name === 'react-native-bare-kit') return { Worklet: FakeWorklet };
      if (name === 'b4a') return { from: Buffer.from, toString: (b: Uint8Array) => Buffer.from(b).toString() };
      if (name.endsWith('worker.bundle.js')) return 'test-worker-control-only';
      throw new Error(name);
    }
  });
  let hold: Promise<string> | null = null;
  const native = {
    requireTunnel: () => { calls.push('require'); return ++route; },
    registerTunnel: () => calls.push('register'),
    clearTunnel: () => { calls.push('clear'); route++; },
    useLocalNetwork: () => calls.push('lan'),
    send: async () => { calls.push('send'); return hold ? await hold : 'receipt'; },
    historySync: async () => { calls.push('history'); return 'history'; }
  };
  const binding = { endpoint: 'https://192.168.1.2:9443', certificateFingerprint: 'a'.repeat(64), hyperswarmPublicKey: 'b'.repeat(64) };
  exports.configureHyperswarm(binding);
  const transfer = exports.withHyperswarm(native);
  return { api: exports, transfer, binding, calls, worklets, setHold(p: Promise<string>) { hold = p; },
    delay() { delayReady = true; }, state(state: string) { app.currentState = state; for (const cb of listeners) cb(state); } };
}
const tick = () => new Promise<void>(resolve => setImmediate(resolve));

test('selected P2P registers tunnel before native capture and reuses it for history', async () => {
  const s = setup();
  assert.equal(await s.transfer.send(s.binding.endpoint, s.binding.certificateFingerprint), 'receipt');
  assert.equal(await s.transfer.historySync(s.binding.endpoint, s.binding.certificateFingerprint), 'history');
  assert.equal(s.calls.filter(x => x === 'register').length, 1);
  assert.ok(s.calls.indexOf('require') < s.calls.indexOf('register'));
  assert.ok(s.calls.indexOf('register') < s.calls.indexOf('send'));
  assert.ok(!s.calls.includes('lan'));
  s.api.closeHyperswarm();
  assert.ok(s.worklets[0].terminated);
});

test('background and foreground cancel already queued native operations', async () => {
  const s = setup();
  let release!: (result: string) => void;
  s.setHold(new Promise(resolve => { release = resolve; }));
  const first = s.transfer.send(s.binding.endpoint, s.binding.certificateFingerprint);
  await tick();
  const queued = s.transfer.historySync(s.binding.endpoint, s.binding.certificateFingerprint);
  const rejected = assert.rejects(queued, /interrupted/);
  s.state('background'); s.state('active');
  release('receipt');
  await first; await rejected;
  assert.ok(!s.calls.includes('history'));
});

test('changing pairing cancels old queued credentials', async () => {
  const s = setup();
  let release!: (result: string) => void;
  s.setHold(new Promise(resolve => { release = resolve; }));
  const first = s.transfer.send(s.binding.endpoint, s.binding.certificateFingerprint);
  await tick();
  const queued = s.transfer.historySync(s.binding.endpoint, s.binding.certificateFingerprint);
  const rejected = assert.rejects(queued, /interrupted/);
  s.api.configureHyperswarm({ ...s.binding, hyperswarmPublicKey: 'c'.repeat(64) });
  release('receipt');
  await first; await rejected;
  assert.ok(!s.calls.includes('history'));
});

test('background during worker startup prevents native registration and has no LAN fallback', async () => {
  const s = setup(); s.delay();
  const pending = s.transfer.send(s.binding.endpoint, s.binding.certificateFingerprint);
  const rejected = assert.rejects(pending, /closed|interrupted/);
  await tick();
  s.state('background');
  s.worklets[0].ready();
  await rejected;
  assert.ok(!s.calls.includes('register'));
  assert.ok(!s.calls.includes('send'));
  assert.ok(!s.calls.includes('lan'));
});

test('explicit LAN pairing uses LAN and malformed peer keys are rejected', async () => {
  const s = setup();
  assert.throws(() => s.api.configureHyperswarm({ ...s.binding, hyperswarmPublicKey: 'invalid' }), /Invalid/);
  s.api.configureHyperswarm({ ...s.binding, hyperswarmPublicKey: undefined });
  await s.transfer.send(s.binding.endpoint, s.binding.certificateFingerprint);
  assert.ok(s.calls.includes('lan'));
  assert.equal(s.worklets.length, 0);
});

