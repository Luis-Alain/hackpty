import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

// Execute the real renderer pairing block with synthetic DOM and IPC adapters.
// No Electron process, network, vault, model or physical phone is used.
const source = await readFile(resolve('apps/desktop/renderer.ts'), 'utf8');
const start = source.indexOf('let phonePairingSelectionGeneration =');
const end = source.indexOf("$('exportEvidence').onclick", start);
assert.ok(start >= 0 && end > start, 'Expected production pairing block must exist');
const pairingCode = ts.transpileModule(source.slice(start, end), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;

type Element = {
  checked: boolean; value: string; hidden: boolean; open: boolean; src?: string; textContent: string;
  onclick?: () => void; onchange?: () => void; onclose?: () => void; oncancel?: () => void;
  showModal(): void; close(): void; removeAttribute(name: string): void;
};
type Invitation = { qr: string; expiresAt: string; certificateFingerprint: string; hyperswarmPublicKey?: string };
const invitation = (method = 'pairWithHistory'): Invitation => ({
  qr: 'data:image/png;base64,SYNTHETIC-INVITATION',
  expiresAt: '2026-09-10T03:00:00Z', certificateFingerprint: 'a'.repeat(64),
  ...(method.startsWith('pairLan') ? {} : { hyperswarmPublicKey: 'b'.repeat(64) }),
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function fixture(call: (method: string, ...args: any[]) => Promise<Invitation> = async method => invitation(method)) {
  const elements: Record<string, Element> = {};
  for (const id of ['pairPhone', 'pairHistoryPhone', 'createInvite', 'closePair', 'pairDialog', 'pairQr',
    'pairStatus', 'allowPhoneHistory', 'phoneTransport', 'lanAddress']) {
    elements[id] = { checked: false, value: '', hidden: true, open: false, textContent: '',
      showModal() { this.open = true; },
      close() { this.open = false; this.onclose?.(); },
      removeAttribute(name) { if (name === 'src') delete this.src; } };
  }
  elements.phoneTransport.value = 'hyperswarm';
  elements.lanAddress.value = '192.168.50.10';
  let pending = Promise.resolve<unknown>(undefined);
  const context = { $: (id: string) => { assert.ok(elements[id], id); return elements[id]; },
    encounterId: 'synthetic-encounter', sessionGeneration: 0, state: {} as object | null,
    current: () => ({ id: 'synthetic-encounter' }), status: async () => {}, Date, call,
    action: (fn: () => Promise<unknown>) => { pending = fn(); return pending; } };
  runInNewContext(pairingCode, context);
  return { elements, context,
    click(id: string) { elements[id].onclick!(); return pending; },
    change(id: string) { elements[id].onchange!(); },
    assertHidden() {
      assert.equal(elements.pairQr.hidden, true);
      assert.equal(elements.pairQr.src, undefined);
      assert.equal(elements.pairStatus.textContent, '');
    },
  };
}
const changes: Array<[string, (element: Element) => void]> = [
  ['allowPhoneHistory', element => { element.checked = !element.checked; }],
  ['phoneTransport', element => { element.value = element.value === 'lan' ? 'hyperswarm' : 'lan'; }],
  ['lanAddress', element => { element.value = element.value === '192.168.50.10' ? '192.168.50.11' : '192.168.50.10'; }],
];

test('each consent, transport or address change removes the visible invitation', async () => {
  for (const [id, toggle] of changes) {
    const ui = fixture();
    await ui.click('pairHistoryPhone'); await ui.click('createInvite');
    assert.equal(ui.elements.pairQr.hidden, false);
    assert.match(ui.elements.pairStatus.textContent, /Patient history included\./);
    toggle(ui.elements[id]); ui.change(id); ui.assertHidden();
  }
});

test('changing a selection away and back rejects its delayed invitation', async () => {
  for (const [id, toggle] of changes) {
    const gate = deferred<Invitation>();
    const ui = fixture(() => gate.promise);
    await ui.click('pairHistoryPhone');
    const creating = ui.click('createInvite');
    toggle(ui.elements[id]); ui.change(id);
    toggle(ui.elements[id]); ui.change(id);
    gate.resolve(invitation()); await creating;
    ui.assertHidden();
  }
});

test('current values are checked even without a change event', async () => {
  for (const [id, toggle] of changes) {
    const gate = deferred<Invitation>();
    const ui = fixture(() => gate.promise);
    await ui.click('pairHistoryPhone');
    const creating = ui.click('createInvite');
    toggle(ui.elements[id]);
    gate.resolve(invitation()); await creating; ui.assertHidden();
  }
});

test('close button, dialog close and Escape invalidate delayed invitations across reopening', async () => {
  for (const close of ['button', 'dialog', 'escape']) {
    const gate = deferred<Invitation>();
    const ui = fixture(() => gate.promise);
    await ui.click('pairHistoryPhone');
    const creating = ui.click('createInvite');
    if (close === 'button') ui.elements.closePair.onclick!();
    else if (close === 'dialog') ui.elements.pairDialog.close();
    else { ui.elements.pairDialog.oncancel!(); ui.elements.pairDialog.open = false; }
    ui.elements.pairDialog.showModal();
    gate.resolve(invitation()); await creating; ui.assertHidden();
  }
});

test('a replacement request immediately hides the old QR and failure cannot restore it', async () => {
  const gate = deferred<Invitation>(); let calls = 0;
  const ui = fixture(async method => ++calls === 1 ? invitation(method) : gate.promise);
  await ui.click('pairHistoryPhone'); await ui.click('createInvite');
  assert.equal(ui.elements.pairQr.hidden, false);
  const replacing = ui.click('createInvite'); ui.assertHidden();
  gate.reject(new Error('Synthetic invitation failure'));
  await assert.rejects(replacing, /Synthetic invitation failure/);
  ui.assertHidden();
});

test('LAN and P2P invitation status explicitly matches the captured history grant', async () => {
  for (const transport of ['lan', 'hyperswarm']) {
    for (const history of [false, true]) {
      const calls: Array<[string, ...any[]]> = [];
      const ui = fixture(async (method, ...args) => { calls.push([method, ...args]); return invitation(method); });
      await ui.click(history ? 'pairHistoryPhone' : 'pairPhone');
      ui.elements.phoneTransport.value = transport; ui.change('phoneTransport');
      await ui.click('createInvite');
      const method = transport === 'lan' ? (history ? 'pairLanWithHistory' : 'pairLan') : (history ? 'pairWithHistory' : 'pair');
      assert.deepEqual(calls, [[method, 'synthetic-encounter', '192.168.50.10']]);
      assert.equal(ui.elements.pairQr.hidden, false);
      assert.match(ui.elements.pairStatus.textContent, history ? /Patient history included\./ : /Capture only; patient history not included\./);
      assert.match(ui.elements.pairStatus.textContent, transport === 'lan' ? /Local Wi-Fi selected/ : /Hyperswarm P2P selected/);
    }
  }
});

test('session lock, cleared state and encounter changes retain their stale-result guards', async () => {
  for (const change of ['session', 'state', 'encounter']) {
    const gate = deferred<Invitation>();
    const ui = fixture(() => gate.promise);
    await ui.click('pairHistoryPhone');
    const creating = ui.click('createInvite');
    if (change === 'session') ui.context.sessionGeneration++;
    else if (change === 'state') ui.context.state = null;
    else ui.context.encounterId = 'another-synthetic-encounter';
    gate.resolve(invitation()); await creating; ui.assertHidden();
  }
});
