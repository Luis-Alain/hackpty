import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

/** Policy test only: simulated trusted events are not evidence of human action. */
test('isolated bridge binds one-use gold grants and derives physical trust without a renderer observe API', async () => {
  const listeners: Record<string, Function[]> = {}, ipcListeners: Record<string, Function> = {};
  const fields = { goldText: { value: 'Synthetic reference.' }, goldSynthetic: { checked: true }, editor: { dataset: { encounterId: 'encounter-a' } }, sourceText: { value: 'Synthetic source.' }, draftText: { value: 'Synthetic draft.' }, confirmApproval: { checked: true }, patient: { value: 'patient-a' } };
  const invoked: unknown[][] = [], sent: unknown[][] = []; let bridge: any, time = 1000, enablePhysical = false;
  const electron = {
    contextBridge: { exposeInMainWorld: (_name: string, value: unknown) => { bridge = value; } },
    ipcRenderer: { invoke: async (...args: unknown[]) => { invoked.push(args); return args[1] === 'status' ? { physicalObserverEnabled: enablePhysical } : { saved: true }; }, send: (...args: unknown[]) => { sent.push(args); }, on: (name: string, callback: Function) => { ipcListeners[name] = callback; } },
  };
  runInNewContext(await readFile(new URL('../apps/desktop/preload.cjs', import.meta.url), 'utf8'), {
    require: (name: string) => { assert.equal(name, 'electron'); return electron; }, exports: {},
    document: { addEventListener: (type: string, callback: Function) => { (listeners[type] ??= []).push(callback); }, getElementById: (id: string) => fields[id] },
    Date: { now: () => time },
  });
  const input = (trusted: boolean, control = 'saveGold', type = 'click') => listeners[type].forEach(listener => listener({ isTrusted: trusted, target: { closest: (selector: string) => selector === '#saveGold' ? (control === 'saveGold' ? { id: control } : null) : { id: control } } }));
  const save = (text = fields.goldText.value, encounter = 'encounter-a', suppliedTrust = true) => bridge.call('recordHumanGoldTranscription', encounter, text, true, suppliedTrust);
  assert.equal(bridge.observe, undefined, 'Renderer must not manufacture observation payloads.');
  assert.throws(() => save(), /actual Save reference button/);
  input(false); assert.throws(() => save(), /actual Save reference button/);
  input(true); assert.throws(() => save('Modified after click.'), /actual Save reference button/);
  assert.throws(() => save(), /actual Save reference button/, 'A failed attempt consumes the grant.');
  input(true); assert.throws(() => save(fields.goldText.value, 'encounter-b'), /actual Save reference button/);
  input(true); time += 5001; assert.throws(() => save(), /actual Save reference button/);
  fields.goldSynthetic.checked = false; input(true); assert.throws(() => save(), /actual Save reference button/);
  fields.goldSynthetic.checked = true; input(true); await save(fields.goldText.value, 'encounter-a', false);
  assert.equal(invoked.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(invoked[0])), ['psyrec', 'recordHumanGoldTranscription', ['encounter-a', 'Synthetic reference.', true, true]]);
  assert.throws(() => save(), /actual Save reference button/, 'Replay cannot reuse the consumed grant.');
  let locked = false; bridge.onLock(() => { locked = true; }); input(true); ipcListeners.locked();
  assert.equal(locked, true); assert.throws(() => save(), /actual Save reference button/);
  input(true, 'reviewSource'); assert.equal(sent.length, 0, 'Normal mode does not collect physical observations.');
  enablePhysical = true; await bridge.call('status');
  input(false, 'reviewSource');
  assert.deepEqual(JSON.parse(JSON.stringify(sent[0])), ['psyrec-observation', { control: 'reviewSource', eventType: 'click', trusted: false, sourceText: 'Synthetic source.', draftText: 'Synthetic draft.', approvalChecked: true, patientId: 'patient-a', encounterId: 'encounter-a' }]);
  fields.patient.value = 'patient-b'; input(true, 'patient', 'change');
  assert.equal((sent[1][1] as any).patientId, 'patient-b');
  assert.equal((sent[1][1] as any).trusted, true);
  enablePhysical = false; await bridge.call('status'); input(true, 'approve'); assert.equal(sent.length, 2);
});