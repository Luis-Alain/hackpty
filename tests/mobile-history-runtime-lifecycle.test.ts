import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInThisContext } from 'node:vm';
import { performance } from 'node:perf_hooks';
import ts from 'typescript';

// Runs the actual controller source against explicit SDK/native/filesystem test doubles.
// No worker, model, native crypto, filesystem model copy or device operation occurs.
function loadModule(file: string, requireMock: (name: string) => any, timers = setTimeout) {
  const code = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} as Record<string, any> };
  runInThisContext(`(function(exports,require,module,setTimeout,clearTimeout,performance){${code}\n})`, { filename: file })
    (module.exports, requireMock, module, timers, clearTimeout, performance);
  return module.exports;
}
const policy = loadModule('apps/mobile/src/history-runtime-policy.ts', name => { throw new Error(`Unexpected policy dependency ${name}`); });
function deferred<T>() { let resolve!: (value: T) => void, reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const runId = '55555555-5555-4555-8555-555555555555';
const snapshot = { version: 1, snapshotId: '11111111-1111-4111-8111-111111111111', syncedAt: '2026-09-09T00:00:00Z',
  binding: { deviceId: '22222222-2222-4222-8222-222222222222', encounterId: '33333333-3333-4333-8333-333333333333' },
  patient: { id: '44444444-4444-4444-8444-444444444444', alias: 'SYNTHETIC TEST' },
  records: [{ id: '66666666-6666-4666-8666-666666666666', patientId: '44444444-4444-4444-8444-444444444444', encounterId: '33333333-3333-4333-8333-333333333333', sourceRevision: 1,
    approvedAt: '2026-09-09T00:00:00Z', text: 'Sleep improved.', sourceText: 'Sleep improved.' }],
  coverage: { totalRecords: 1, includedRecords: 1, partial: false } };
const credentials = { version: 1, endpoint: 'https://synthetic.invalid:9443', certificateFingerprint: 'a'.repeat(64), ...snapshot.binding, token: 'synthetic-unused-token' };
function fixture(options: { output?: string; stats?: unknown; eventError?: boolean; closeReject?: boolean; closePending?: boolean; loadPending?: boolean; failedSavePending?: boolean } = {}) {
  const calls: string[] = [], journals: any[] = [], timerDelays: number[] = [];
  const pendingLoad = deferred<string>(), pendingClose = deferred<void>(), pendingFinal = deferred<any>();
  const sdk = {
    loadModel() { calls.push('load'); return Object.assign(options.loadPending ? pendingLoad.promise : Promise.resolve('native-test-model'), { requestId: 'load-request' }); },
    getLoadedModelInfo: async () => ({ isDelegated: false, modelType: 'llamacpp-completion', handlers: ['completionStream'] }),
    completion() {
      calls.push('completion');
      const content = options.output ?? '{"sourceIds":["S1"]}';
      const stats = options.stats === undefined ? { promptTokens: 50, emittedTokens: 10, timeToFirstToken: 20, tokensPerSecond: 30 } : options.stats;
      return { requestId: 'completion-request', final: options.eventError ? pendingFinal.promise : Promise.resolve({ contentText: content, raw: { fullText: content }, stats, stopReason: 'stop' }),
        events: (async function* () {
          yield { type: 'contentDelta', text: content };
          if (options.eventError) throw new Error('Synthetic event failure.');
          yield { type: 'completionStats', stats }; yield { type: 'completionDone' };
        })() };
    },
    async cancel({ requestId }: { requestId: string }) { calls.push(`cancel:${requestId}`); },
    close() {
      calls.push('close');
      if (options.eventError) pendingFinal.reject(new Error('Synthetic closed worker.'));
      if (options.closeReject) return Promise.reject(new Error('Synthetic shutdown failure.'));
      return options.closePending ? pendingClose.promise : Promise.resolve();
    },
  };
  class Directory { uri = 'file:///app/files/models'; create() {} }
  class File { exists = true; size = 382156480; uri = 'file:///app/files/models/Qwen3-0.6B-Q4_0.gguf'; write() { calls.push('config'); } }
  const transfer = {
    async verifyHistoryModel() { calls.push('verify'); return JSON.stringify({ path: '/app/files/models/Qwen3-0.6B-Q4_0.gguf', modelId: 'QWEN3_600M_INST_Q4', bytes: 382156480,
      sha256: '33bcc57074ec7b6eada5a90651ee546ec0c2b271002c22baf9f1b2dd1e8f75cb' }); },
    async historyNewRunId() { return runId; },
    historySaveRun(_endpoint: string, _pin: string, _device: string, _encounter: string, _run: string, body: string) {
      const run = JSON.parse(body); journals.push(run); calls.push(`save:${run.status}`);
      return options.failedSavePending && run.status === 'failed' ? new Promise<void>(() => {}) : Promise.resolve();
    },
  };
  const mocks: Record<string, unknown> = {
    'react-native': { Platform: { OS: 'android' } }, 'expo-asset': { Asset: { fromModule() { throw new Error('No asset operation expected.'); } } },
    'expo-file-system': { Directory, File, Paths: { document: 'file:///app/files/' } },
    'expo-device': { manufacturer: 'synthetic', modelName: 'synthetic', osVersion: 'test' },
    './transfer': { Transfer: transfer }, './history-runtime-policy': policy,
    '@qvac/sdk/logging': { setGlobalLogLevel() {}, setGlobalConsoleOutput() {} }, '@qvac/sdk': sdk, '@qvac/sdk/package': { version: '0.18.2' },
  };
  // Exercise production timeout branches without waiting twelve real seconds.
  const shortTimers = ((fn: (...args: any[]) => void, delay: number, ...args: any[]) => {
    timerDelays.push(delay); return setTimeout(fn, Math.min(delay, 15), ...args);
  }) as typeof setTimeout;
  const { historyRuntime } = loadModule('apps/mobile/src/history-runtime.ts', name => {
    assert.ok(Object.hasOwn(mocks, name), `Unexpected runtime dependency ${name}`); return mocks[name];
  }, shortTimers);
  return { api: historyRuntime, calls, journals, pendingLoad, pendingClose, timerDelays };
}

test('phone controller persists exact pending request before inference and terminal evidence before answer', async () => {
  const f = fixture(); await f.api.prepare(); assert.equal(f.api.ready, true);
  const answer = await f.api.ask(snapshot, 'sleep', credentials);
  assert.ok(f.calls.indexOf('save:started') < f.calls.indexOf('completion'));
  assert.equal(f.journals.at(-1).status, 'succeeded'); assert.equal(answer.passages[0].recordId, snapshot.records[0].id);
  assert.equal(f.journals[1].metrics.inputTokens, 50); assert.equal(f.journals[1].request.kvCache, false);
  assert.ok(!JSON.stringify(f.journals).includes(credentials.token)); await f.api.lock();
});
test('phone controller cancels and closes after invalid selection or missing native measurements', async () => {
  for (const options of [{ output: '{"sourceIds":["foreign"]}' }, { stats: { promptTokens: 50, emittedTokens: 10 } }]) {
    const f = fixture(options); await f.api.prepare(); await assert.rejects(f.api.ask(snapshot, 'sleep', credentials));
    assert.ok(f.calls.includes('cancel:completion-request')); assert.ok(f.calls.includes('close'));
    assert.equal(f.api.ready, false); assert.equal(f.journals.at(-1).status, 'failed');
  }
});
test('phone controller closes active generation even when failed evidence write never resolves', async () => {
  const f = fixture({ eventError: true, failedSavePending: true }); await f.api.prepare();
  await assert.rejects(f.api.ask(snapshot, 'sleep', credentials));
  assert.ok(f.calls.includes('cancel:completion-request')); assert.ok(f.calls.includes('close')); assert.equal(f.api.ready, false);
  assert.equal(f.journals.at(-1).partialOutput, '{"sourceIds":["S1"]}'); assert.ok(f.timerDelays.includes(2000));
});
test('phone controller refuses a fresh worker after rejected shutdown', async () => {
  const f = fixture({ closeReject: true }); await f.api.prepare(); await assert.rejects(f.api.lock());
  await assert.rejects(f.api.prepare(), /unconfirmed/); assert.equal(f.calls.filter(c => c === 'load').length, 1); assert.equal(f.api.ready, false);
});
test('phone controller timeout fails closed until actual delayed shutdown is confirmed', async () => {
  const f = fixture({ closePending: true }); await f.api.prepare(); await assert.rejects(f.api.lock());
  assert.ok(f.timerDelays.includes(12000)); await assert.rejects(f.api.prepare(), /unconfirmed/);
  f.pendingClose.resolve(); await Promise.resolve(); await Promise.resolve();
  await f.api.prepare(); assert.equal(f.api.ready, true); await f.api.lock();
});
test('phone controller discards a load that resolves after lock and cancels its request ID', async () => {
  const f = fixture({ loadPending: true }); const preparing = f.api.prepare();
  for (let turn = 0; turn < 20 && !f.calls.includes('load'); turn++) await Promise.resolve();
  assert.ok(f.calls.includes('load')); await f.api.lock(); f.pendingLoad.resolve('late-model');
  await assert.rejects(preparing); assert.equal(f.api.ready, false); assert.ok(f.calls.includes('cancel:load-request'));
});
