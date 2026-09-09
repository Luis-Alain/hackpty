import assert from 'node:assert/strict';
import type { BrowserWindow } from 'electron';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import type { PsyRecService } from '../../packages/core/service.js';
import type { InferencePort } from '../../packages/core/types.js';

/** Explicit test double used only by the guarded fresh-vault renderer check. */
export function createQueryUiRuntime(): InferencePort & { getStatus(): unknown; cancelAll(): Promise<void> } {
  return {
    getStatus: () => ({ ready: true, testDouble: true, message: 'Automated synthetic query UI test; QVAC is not loaded.' }),
    cancelAll: async () => {},
    extractImage: async () => ({ text: 'Synthetic extraction test double.', metrics: { testDouble: true } }),
    draftFromSource: async ({ text }) => ({ text, metrics: { testDouble: true } }),
    answerApprovedNotes: async ({ sources }) => ({ text: JSON.stringify({ sourceIds: [sources[0].sourceId] }), metrics: { testDouble: true } }),
  };
}

/** Tests the real sandboxed preload and renderer; all records are synthetic test fixtures. */
export async function runQueryUiCheck(window: BrowserWindow, service: PsyRecService, root: string, directory: string) {
  const passphrase = 'synthetic-query-ui-test-only';
  assert.equal(await service.vault.exists(), false, 'The UI check requires a fresh vault.');
  await service.vault.unlock(passphrase, true);
  const patient = await service.addPatient('SYNTHETIC QUERY UI TEST');
  const other = await service.addPatient('SYNTHETIC ISOLATION UI TEST');
  const target = await service.addEncounter(patient.id);
  await service.importImage(target.id, await readFile(join(root, 'diagnostics/qvac-spike/fixtures/synthetic-note.png')));
  const text = 'Denies suicidal ideation. Reports improved sleep. This is an automated synthetic UI fixture.';
  await service.reviewSource(target.id, text);
  const draft = await service.generateDraft(target.id);
  const record = await service.approve(target.id, draft.id, draft.sourceRevision, text);
  const emptyEncounter = await service.addEncounter(patient.id);
  await service.lock();
  const js = (source: string) => window.webContents.executeJavaScript(source, false);
  const wait = async (condition: string, label: string) => {
    for (let attempt = 0; attempt < 150; attempt++) {
      if (await js(condition)) return;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('Query UI check timed out: ' + label);
  };
  await window.loadFile(join(root, 'apps/desktop/ui/index.html'));
  await wait("document.getElementById('unlock').textContent==='Unlock vault'", 'existing synthetic vault status');
  await js(`document.getElementById('passphrase').value=${JSON.stringify(passphrase)};document.getElementById('unlockForm').requestSubmit()`);
  await wait(`!document.getElementById('workspace').hidden && !document.getElementById('newEncounter').disabled && document.getElementById('editor').dataset.encounterId===${JSON.stringify(emptyEncounter.id)}`, 'unlock and selected encounter');
  assert.equal(await js("document.getElementById('goldText').value"), '', 'Gold reference must start blank.');
  assert.equal(await js("document.getElementById('goldSynthetic').checked"), false);
  await js("document.getElementById('historyToggle').click();document.getElementById('queryQuestion').value='What is documented about suicidal ideation?';document.getElementById('queryForm').requestSubmit()");
  await wait("document.querySelector('#queryAnswer blockquote') && !document.getElementById('askApprovedNotes').disabled", 'query result');
  assert.equal(await js("document.querySelector('#queryAnswer blockquote').textContent"), text);
  assert.equal(await js("document.getElementById('queryAnswer').textContent.includes('UNSUPPORTED TEST PROSE')"), false);
  assert.equal(await js("document.getElementById('queryMetrics').textContent.includes('testDouble')"), true);
  assert.equal(await js("document.getElementById('queryMetrics').textContent.includes('history')"), false);
  await js("document.querySelector('#queryAnswer button').click()");
  await wait(`document.getElementById('editor').dataset.encounterId===${JSON.stringify(target.id)} && !document.getElementById('askApprovedNotes').disabled`, 'canonical citation navigation');
  assert.equal(await js(`Array.from(document.querySelectorAll('#historyRecords article')).some(article=>article.dataset.recordId===${JSON.stringify(record.id)})`), true);
  assert.equal(await js("document.getElementById('goldText').value"), '', 'Opening cited notes must not prefill gold.');
  const reference = 'Manually supplied synthetic test reference; this automation is not human evidence.';
  await js(`document.getElementById('goldText').value=${JSON.stringify(reference)};document.getElementById('goldText').dispatchEvent(new Event('input',{bubbles:true}));document.getElementById('goldSynthetic').checked=true;document.getElementById('goldSynthetic').dispatchEvent(new Event('change',{bubbles:true}))`);
  const spoofRejected = await js(`(async()=>{try {await window.psyrec.call('recordHumanGoldTranscription',${JSON.stringify(target.id)},${JSON.stringify(reference)},true,true);return false;}catch{return true;}})()`);
  assert.equal(spoofRejected, true, 'A caller-supplied trusted flag must not authorize gold.');
  await js("document.getElementById('saveGold').click()");
  await wait("document.getElementById('notice').textContent.includes('actual Save reference button') && !document.getElementById('askApprovedNotes').disabled", 'programmatic gold rejection');
  assert.equal(service.state().goldTranscriptions?.length ?? 0, 0, 'Automation must not create a human reference.');
  await js("document.getElementById('notice').textContent='AUTOMATED SYNTHETIC UI CHECK · TEST DOUBLE · NO HUMAN ACCEPTANCE';document.getElementById('history').scrollIntoView({block:'start'})");
  await js("document.querySelector('#history h2').textContent='Approved patient history · SYNTHETIC TEST DOUBLE';document.getElementById('passphrase').value=''");
  window.webContents.invalidate();
  await js('Promise.race([new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))),new Promise((_,reject)=>setTimeout(()=>reject(new Error("Synthetic screenshot repaint timed out")),3000))])');
  await writeFile(join(directory, 'query-panel.png'), (await window.webContents.capturePage()).toPNG(), { flag: 'wx' });
  await js("document.querySelector('.gold-reference').open=true;document.querySelector('.gold-reference').scrollIntoView({block:'center'})");
  await js("document.querySelector('.gold-reference summary').textContent='Human reference · SYNTHETIC TEST DOUBLE'");
  window.webContents.invalidate();
  await js('Promise.race([new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))),new Promise((_,reject)=>setTimeout(()=>reject(new Error("Synthetic screenshot repaint timed out")),3000))])');
  await writeFile(join(directory, 'gold-panel.png'), (await window.webContents.capturePage()).toPNG(), { flag: 'wx' });
  await js(`document.getElementById('patient').value=${JSON.stringify(other.id)};document.getElementById('patient').dispatchEvent(new Event('change',{bubbles:true}))`);
  await wait(`document.getElementById('patient').value===${JSON.stringify(other.id)} && !document.getElementById('newEncounter').disabled && document.getElementById('encounterTitle').textContent==='SYNTHETIC ISOLATION UI TEST'`, 'patient isolation navigation');
  assert.deepEqual(await js("['queryQuestion','queryAnswer','queryCoverage','queryMetrics'].map(id=>document.getElementById(id).value??document.getElementById(id).textContent)"), ['', '', '', '']);
  await js(`document.getElementById('patient').value=${JSON.stringify(patient.id)};document.getElementById('patient').dispatchEvent(new Event('change',{bubbles:true}))`);
  await wait("document.getElementById('encounterTitle').textContent==='SYNTHETIC QUERY UI TEST' && !document.getElementById('newEncounter').disabled", 'return to target patient');
  await js("document.getElementById('queryQuestion').value='What is documented about suicidal ideation?';document.getElementById('queryForm').requestSubmit()");
  await wait("document.querySelector('#queryAnswer blockquote') && !document.getElementById('askApprovedNotes').disabled", 'second query');
  await js("document.getElementById('lock').click()");
  await wait("!document.getElementById('locked').hidden && document.getElementById('workspace').hidden", 'lock purge');
  assert.deepEqual(await js("['queryQuestion','queryAnswer','queryCoverage','queryMetrics','goldText','goldStatus','goldScore','sourceText','draftText','historyRecords'].map(id=>document.getElementById(id).value??document.getElementById(id).textContent)"), Array(10).fill(''));
  assert.equal(await js("document.getElementById('goldSynthetic').checked"), false);
  assert.equal(await js("document.getElementById('editor').dataset.encounterId"), '');
  const summary = {
    schemaVersion: 1, kind: 'automated-desktop-query-ui-check', completedAt: new Date().toISOString(), passed: true,
    testDouble: true, realGpu: false, humanWorkflowAcceptance: false, physicalCaptureAcceptance: false,
    checks: ['gold starts blank and stays blank after opening a source', 'query uses complete canonical passage including denial', 'display contains canonical text only; source-ID-only model output', 'query UI contains performance summary only', 'citation opens the canonical current approved note', 'caller-supplied trusted boolean rejected', 'programmatic gold click rejected', 'no human reference created by automation', 'query question/result/metrics purged on patient change', 'query and gold fields purged on lock'],
    screenshots: ['query-panel.png', 'gold-panel.png'],
  };
  await writeFile(join(directory, 'summary.json'), JSON.stringify(summary, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  return summary;
}

async function main() {
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const executable = join(root, 'node_modules/electron/dist', process.platform === 'win32' ? 'electron.exe' : process.platform === 'darwin' ? 'Electron.app/Contents/MacOS/Electron' : 'electron');
  const environment: NodeJS.ProcessEnv = { ...process.env }; delete environment.ELECTRON_RUN_AS_NODE; delete environment.PSYREC_HOME;
  const child = spawn(executable, [root, '--query-ui-check'], { cwd: root, env: environment, stdio: 'inherit', windowsHide: true });
  const code = await new Promise<number>((resolve, reject) => { child.once('error', reject); child.once('exit', exitCode => resolve(exitCode ?? 1)); });
  console.log(JSON.stringify({ testDouble: true, noGpu: true, exitCode: code }));
  process.exitCode = code;
}
if (!process.versions.electron && process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) void main().catch(error => { console.error(error.message); process.exitCode = 1; });