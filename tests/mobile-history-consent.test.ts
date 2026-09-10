import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, rmdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { PsyRecService } from '../packages/core/service.js';
import { Vault } from '../packages/core/vault.js';
import { validateRequest } from '../apps/desktop/ipc.js';
import type { InferencePort } from '../packages/core/types.js';

// Execute the production consent handlers and pairing branch with synthetic DOM/transport
// adapters. These tests do not launch Electron, join a network, invoke a model, or attest
// a human consent event. Every vault below is newly created synthetic test data.
const address = '192.168.50.10';
const endpoint = `https://${address}:9443`;
const pin = 'a'.repeat(64);
const peerKey = 'b'.repeat(64);
const password = 'synthetic-consent-test-password';
const rendererText = await readFile(resolve('apps/desktop/renderer.ts'), 'utf8');
const mainText = await readFile(resolve('apps/desktop/main.ts'), 'utf8');
const rendererAst = ts.createSourceFile('renderer.ts', rendererText, ts.ScriptTarget.Latest, true);
const mainAst = ts.createSourceFile('main.ts', mainText, ts.ScriptTarget.Latest, true);

function findNode<T extends ts.Node>(source: ts.Node, predicate: (node: ts.Node) => boolean): T {
  let found: ts.Node | undefined;
  function visit(node: ts.Node) {
    if (found) return;
    if (predicate(node)) { found = node; return; }
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(found, 'Expected production consent code must be present');
  return found as T;
}
function handler(id: string): string {
  const node = findNode<ts.ExpressionStatement>(rendererAst, node => {
    if (!ts.isExpressionStatement(node) || !ts.isBinaryExpression(node.expression)) return false;
    const left = node.expression.left;
    return ts.isPropertyAccessExpression(left) && left.name.text === 'onclick'
      && ts.isCallExpression(left.expression) && left.expression.expression.getText(rendererAst) === '$'
      && left.expression.arguments.length === 1 && ts.isStringLiteral(left.expression.arguments[0])
      && left.expression.arguments[0].text === id;
  });
  return node.getText(rendererAst);
}
const invalidatePairing = findNode<ts.FunctionDeclaration>(rendererAst,
  node => ts.isFunctionDeclaration(node) && node.name?.text === 'invalidatePhonePairing').getText(rendererAst);
const openPairing = findNode<ts.FunctionDeclaration>(rendererAst,
  node => ts.isFunctionDeclaration(node) && node.name?.text === 'openPhonePairing').getText(rendererAst);
const pairCase = findNode<ts.CaseClause>(mainAst,
  node => ts.isCaseClause(node) && ts.isStringLiteral(node.expression) && node.expression.text === 'pair');
assert.equal(pairCase.statements.length, 1);
assert.ok(ts.isBlock(pairCase.statements[0]));
const pairingBody = pairCase.statements[0].getText(mainAst);
function javascript(source: string) {
  return ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => { resolve = yes; });
  return { promise, resolve };
}

async function syntheticVault(t: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), 'psyrec-synthetic-history-consent-'));
  const vaultPath = join(directory, 'vault.enc');
  const vault = new Vault(vaultPath);
  await vault.unlock(password, true);
  const noInference = new Proxy({} as InferencePort, { get() { throw new Error('Inference is forbidden in consent tests.'); } });
  const service = new PsyRecService(vault, noInference);
  const services = [service];
  t.after(async () => {
    for (const item of services) await item.lock();
    // Only this test's exact synthetic file and now-empty unique directory may be removed.
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    assert.ok(directory.split(/[\\/]/).at(-1)!.startsWith('psyrec-synthetic-history-consent-'));
    assert.equal(dirname(resolve(vaultPath)), resolve(directory));
    await rm(vaultPath, { force: true });
    await rmdir(directory);
  });
  const patient = await service.addPatient('SYNTHETIC CONSENT PATIENT');
  const encounter = await service.addEncounter(patient.id);
  const sourceEncounter = await service.addEncounter(patient.id);
  const sourceText = 'SYNTHETIC approved source for consent persistence.';
  const recordId = randomUUID();
  // Explicit fixture injection does not claim extraction, clinical review, or approval.
  const fixture = vault.state!.encounters.find(value => value.id === sourceEncounter.id)!;
  fixture.source = { revision: 2, text: sourceText, reviewed: true }; fixture.status = 'approved';
  vault.state!.records.push({ id: recordId, patientId: patient.id, encounterId: sourceEncounter.id,
    sourceRevision: 2, sourceText, text: 'SYNTHETIC approved history record.', draftId: randomUUID(),
    modelDraftText: 'Synthetic fixture only', clinicianEdited: false, approvedAt: '2026-09-09T00:00:00Z',
    supersededAt: null, context: [], draftingMetrics: { testDouble: true } });
  await vault.save(vault.state!);
  return { vault, service, patient, encounter, recordId, services, noInference, vaultPath };
}

type Element = { checked?: boolean; value?: string; hidden?: boolean; open?: boolean; src?: string;
  textContent?: string; onclick?: () => void; showModal?: () => void; close?: () => void; removeAttribute?: (name: string) => void };
function consentUi(encounterId: string, call: (method: string, ...args: any[]) => Promise<any>, status = async () => {}) {
  const elements: Record<string, Element> = {
    pairPhone: {}, pairHistoryPhone: {}, createInvite: {},
    allowPhoneHistory: { checked: false }, phoneTransport: { value: 'hyperswarm' }, lanAddress: { value: address },
    pairQr: { hidden: true }, pairStatus: { textContent: '' }, pairDialog: { open: false },
  };
  elements.pairQr.removeAttribute = name => { if (name === 'src') delete elements.pairQr.src; };
  elements.pairDialog.showModal = () => { elements.pairDialog.open = true; };
  elements.pairDialog.close = () => { elements.pairDialog.open = false; };
  let currentAction = Promise.resolve<unknown>(undefined);
  const context = { $: (id: string) => { assert.ok(elements[id], `Unknown synthetic DOM element ${id}`); return elements[id]; },
    encounterId, sessionGeneration: 0, phonePairingSelectionGeneration: 0, state: {}, current: () => ({ id: encounterId }), status, call, Date,
    action: (fn: () => Promise<unknown>) => { currentAction = fn(); return currentAction; } };
  runInNewContext(javascript([invalidatePairing, openPairing, handler('pairPhone'), handler('pairHistoryPhone'), handler('createInvite')].join('\n')), context);
  return { elements, context, click: async (id: string) => { elements[id].onclick!(); await currentAction; } };
}
function pairingDispatcher(service: PsyRecService, pauseP2p?: () => Promise<void>) {
  let p2pStarts = 0;
  const context = { service, locking: false, receiverInfo: null, addresses: () => [address], Error,
    receiver: { start: async () => ({endpoint, certificateFingerprint: pin}), startHyperswarm: async () => {
      p2pStarts++; await pauseP2p?.(); return peerKey;
    } }, QRCode: { toDataURL: async () => 'data:image/png;base64,SYNTHETIC-QR-STUB' } };
  const dispatch = runInNewContext(javascript(`(async function(method, args) ${pairingBody})`), context) as (method: string, args: any[]) => Promise<any>;
  return { call: async (method: string, ...args: any[]) => { validateRequest(method, args); return dispatch(method, args); },
    get p2pStarts() { return p2pStarts; } };
}

test('capture entry resets prior history consent; dedicated history entry selects it explicitly', async () => {
  const html = await readFile(resolve('apps/desktop/ui/index.html'), 'utf8');
  const input = html.match(/<input\b[^>]*\bid="allowPhoneHistory"[^>]*>/)?.[0];
  assert.ok(input, 'Consent checkbox exists in the actual desktop document');
  assert.ok(!/\bchecked(?:\s|=|>)/i.test(input), 'Consent must not be selected by default in HTML');
  const ui = consentUi(randomUUID(), async () => ({}));
  await ui.click('pairHistoryPhone'); assert.equal(ui.elements.allowPhoneHistory.checked, true);
  ui.elements.pairDialog.close!();
  await ui.click('pairPhone'); assert.equal(ui.elements.allowPhoneHistory.checked, false);
  assert.equal(ui.elements.pairDialog.open, true);
  assert.equal(ui.elements.pairQr.hidden, true);
});

test('LAN and P2P checkbox choices reach the real core grant and survive encrypted reload', async t => {
  const f = await syntheticVault(t); const main = pairingDispatcher(f.service);
  const grants: Array<{ deviceId: string; token: string; encounterId: string; enabled: boolean }> = [];
  const calls: string[] = [];
  let invitation: any;
  const ui = consentUi(f.encounter.id, async (method, ...args) => {
    calls.push(method); invitation = await main.call(method, ...args); return invitation;
  });
  for (const transport of ['lan', 'hyperswarm']) {
    for (const enabled of [false, true]) {
      // Begin with the opposite entry-point selection to verify the final visible checkbox wins.
      await ui.click(enabled ? 'pairPhone' : 'pairHistoryPhone');
      ui.elements.allowPhoneHistory.checked = enabled;
      ui.elements.phoneTransport.value = transport;
      const previousStarts = main.p2pStarts;
      await ui.click('createInvite');
      const expected = transport === 'lan' ? (enabled ? 'pairLanWithHistory' : 'pairLan') : (enabled ? 'pairWithHistory' : 'pair');
      assert.equal(calls.at(-1), expected);
      assert.equal(main.p2pStarts - previousStarts, transport === 'hyperswarm' ? 1 : 0);
      assert.equal(Boolean(invitation.hyperswarmPublicKey), transport === 'hyperswarm');
      assert.equal(f.service.pairing!.historyEnabled, enabled);
      const paired = await f.service.pair(invitation.secret, `Synthetic ${transport} phone`);
      grants.push({ ...paired, enabled });
      if (enabled) assert.equal(f.service.mobileHistory(paired).records[0].id, f.recordId);
      else assert.throws(() => f.service.mobileHistory(paired), /Allow patient history/);
    }
  }
  const encrypted = await readFile(f.vaultPath, 'utf8');
  for (const clear of ['SYNTHETIC CONSENT PATIENT', 'historyEnabled', ...grants.map(grant => grant.token)]) assert.ok(!encrypted.includes(clear));
  await f.service.lock();
  for (const grant of grants) assert.throws(() => f.service.mobileHistory(grant), /Unlock the vault/);
  const reloadedVault = new Vault(f.vaultPath); await reloadedVault.unlock(password);
  const reloaded = new PsyRecService(reloadedVault, f.noInference); f.services.push(reloaded);
  for (const grant of grants) {
    assert.equal(reloadedVault.state!.devices.find(device => device.id === grant.deviceId)!.historyEnabled, grant.enabled);
    if (grant.enabled) assert.equal(reloaded.mobileHistory(grant).records[0].id, f.recordId);
    else assert.throws(() => reloaded.mobileHistory(grant), /Allow patient history/);
  }
});

test('core pairing without explicit true remains capture-only after vault reload', async t => {
  const f = await syntheticVault(t);
  const invite = f.service.startPairing(f.encounter.id, endpoint, pin);
  const paired = await f.service.pair(invite.secret, 'Synthetic default capture phone');
  assert.throws(() => f.service.mobileHistory(paired), /Allow patient history/);
  await f.service.lock(); await f.vault.unlock(password);
  assert.equal(f.vault.state!.devices.find(device => device.id === paired.deviceId)!.historyEnabled, false);
  assert.throws(() => f.service.mobileHistory(paired), /Allow patient history/);
  const truthyInvite = f.service.startPairing(f.encounter.id, endpoint, pin, 'true' as unknown as boolean);
  const truthyPair = await f.service.pair(truthyInvite.secret, 'Synthetic truthy input');
  assert.throws(() => f.service.mobileHistory(truthyPair), /Allow patient history/);
});

test('locking during P2P preparation prevents a history invitation and all locked grants reject', async t => {
  const f = await syntheticVault(t);
  const reached = deferred<void>(), release = deferred<void>();
  const main = pairingDispatcher(f.service, async () => { reached.resolve(); await release.promise; });
  const request = main.call('pairWithHistory', f.encounter.id, address);
  await reached.promise; await f.service.lock(); release.resolve();
  await assert.rejects(request, /Vault session changed during pairing/);
  assert.equal(f.service.pairing, null);
  await assert.rejects(main.call('pairLanWithHistory', f.encounter.id, address), /Vault session changed during pairing/);
  assert.throws(() => f.service.startPairing(f.encounter.id, endpoint, pin, true), /Unlock the vault/);
});

test('a pending desktop history action cannot reopen its dialog after session lock', async () => {
  const statusGate = deferred<void>();
  const ui = consentUi(randomUUID(), async () => ({}), () => statusGate.promise);
  const opening = ui.click('pairHistoryPhone');
  ui.context.sessionGeneration++; ui.context.state = null;
  statusGate.resolve(); await opening;
  assert.equal(ui.elements.pairDialog.open, false);
  assert.equal(ui.elements.allowPhoneHistory.checked, false);
});
