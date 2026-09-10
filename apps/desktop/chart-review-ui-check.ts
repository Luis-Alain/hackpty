import assert from 'node:assert/strict';
import type { BrowserWindow } from 'electron';
import { writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import type { PsyRecService } from '../../packages/core/service.js';
import type { InferencePort } from '../../packages/core/types.js';

/** Explicit test double used only by the guarded fresh-vault renderer check. No model is ever loaded. */
export function createChartReviewUiRuntime(): InferencePort & { getStatus(): unknown; cancelAll(): Promise<void> } {
  return {
    getStatus: () => ({ ready: true, testDouble: true, message: 'Automated synthetic chart review UI test; QVAC is not loaded.' }),
    cancelAll: async () => {},
    extractImage: async () => ({ text: 'Synthetic extraction test double.', metrics: { testDouble: true } }),
    draftFromSource: async ({ text }) => ({ text, metrics: { testDouble: true } }),
    reviewChart: async () => ({
      text: JSON.stringify({
        schemaVersion: 1,
        findings: [
          { kind: 'changed', statement: 'SYNTHETIC UI CHECK finding: sleep documentation changed since the previous visit. NOT A REAL PATIENT.', evidenceIds: ['C1', 'H1'] },
          { kind: 'new', statement: 'SYNTHETIC UI CHECK finding: a new exercise entry appears in the current source. NOT A REAL PATIENT.', evidenceIds: ['C1'] },
        ],
        clarifications: [{ question: 'SYNTHETIC UI CHECK question: is the current dose unchanged?', reason: 'SYNTHETIC UI CHECK reason: the prior approved note documents a dose. NOT A REAL PATIENT.', evidenceIds: ['H1'] }],
      }),
      metrics: { testDouble: true },
    }),
  };
}

const historicalText = '2026-08-20\nSYNTHETIC UI CHECK prior visit: sleep poor, dose documented. NOT A REAL PATIENT.';
const currentText = '2026-09-09\nSYNTHETIC UI CHECK current visit: sleep improved, exercise added. NOT A REAL PATIENT.';

/** Tests the real sandboxed preload and renderer against a fresh synthetic vault; all records are synthetic fixtures. */
export async function runChartReviewUiCheck(window: BrowserWindow, service: PsyRecService, root: string, directory: string) {
  const passphrase = 'synthetic-chart-ui-test-only';
  assert.equal(await service.vault.exists(), false, 'The UI check requires a fresh vault.');
  await service.vault.unlock(passphrase, true);
  const patient = await service.addPatient('SYNTHETIC CHART REVIEW UI TEST — NOT A REAL PATIENT');
  const other = await service.addPatient('SYNTHETIC CHART ISOLATION UI TEST — NOT A REAL PATIENT');
  const historyEncounter = await service.addEncounter(patient.id);
  await service.reviewSource(historyEncounter.id, historicalText);
  const historyDraft = await service.generateDraft(historyEncounter.id);
  await service.approve(historyEncounter.id, historyDraft.id, historyDraft.sourceRevision, historicalText);
  const currentEncounter = await service.addEncounter(patient.id);
  await service.reviewSource(currentEncounter.id, currentText);
  await service.lock();
  const js = (source: string) => window.webContents.executeJavaScript(source, false);
  const wait = async (condition: string, label: string) => {
    for (let attempt = 0; attempt < 150; attempt++) {
      if (await js(condition)) return;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('Chart review UI check timed out: ' + label);
  };
  const repaint = () => js('Promise.race([new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))),new Promise((_,reject)=>setTimeout(()=>reject(new Error("Synthetic screenshot repaint timed out")),3000))])');
  await window.loadFile(join(root, 'apps/desktop/ui/chart-review-check.html'));
  await wait("document.getElementById('unlock').textContent==='Unlock vault'", 'existing synthetic vault status');
  await js(`document.getElementById('passphrase').value=${JSON.stringify(passphrase)};document.getElementById('unlockForm').requestSubmit()`);
  await wait(`!document.getElementById('workspace').hidden && !document.getElementById('newEncounter').disabled && document.getElementById('editor').dataset.encounterId===${JSON.stringify(currentEncounter.id)}`, 'unlock and selected encounter');
  await wait("!document.getElementById('chartReview').hidden && !document.getElementById('askChartReview').disabled", 'chart review panel visible for the reviewed source');
  assert.equal(await js("document.getElementById('chartReview').textContent.includes('read-only, unapproved')"), true);
  assert.equal(await js("document.getElementById('chartReview').textContent.includes('Nothing here enters the record until you approve a document.')"), true);
  await js("document.getElementById('askChartReview').click()");
  await wait("document.querySelector('#chartReviewFindings section') && !document.getElementById('askChartReview').disabled", 'chart review result');
  assert.equal(await js("document.getElementById('chartReviewCoverage').textContent.includes('1 of 1 current approved record(s) supplied')"), true);
  assert.equal(await js("document.getElementById('chartReviewCoverage').textContent.includes('2026-08-20')"), true);
  assert.equal(await js("document.getElementById('chartReviewFindings').textContent.includes('Changed (1)')"), true);
  assert.equal(await js("document.getElementById('chartReviewFindings').textContent.includes('New (1)')"), true);
  assert.equal(await js("document.getElementById('chartReviewClarifications').textContent.includes('Still needs clarification (1)')"), true);
  assert.equal(await js("document.getElementById('chartReviewMetrics').textContent.includes('test double (no model)')"), true);
  assert.equal(await js("document.getElementById('chartReviewMetrics').textContent.includes('testDouble')"), true);
  await js("Array.from(document.querySelectorAll('#chartReviewFindings button')).find(b=>b.textContent==='H1').click()");
  await wait("!document.getElementById('chartReviewPassage').hidden && document.getElementById('chartReviewPassage').textContent.includes('2026-08-20')", 'canonical evidence passage');
  assert.equal(await js("document.getElementById('chartReviewPassage').textContent.includes('sleep poor, dose documented')"), true);
  assert.equal(await js("document.getElementById('chartReviewPassage').textContent.includes('Approved record')"), true);
  await js("document.getElementById('notice').textContent='AUTOMATED SYNTHETIC UI CHECK · TEST DOUBLE · NO HUMAN ACCEPTANCE';document.getElementById('chartReview').scrollIntoView({block:'start'})");
  await js("document.querySelector('#chartReview h2').textContent='Chart review · SYNTHETIC TEST DOUBLE';document.getElementById('passphrase').value=''");
  window.webContents.invalidate(); await repaint();
  await writeFile(join(directory, 'chart-review-panel.png'), (await window.webContents.capturePage()).toPNG(), { flag: 'wx' });
  await js(`document.getElementById('patient').value=${JSON.stringify(other.id)};document.getElementById('patient').dispatchEvent(new Event('change',{bubbles:true}))`);
  await wait(`document.getElementById('patient').value===${JSON.stringify(other.id)} && !document.getElementById('newEncounter').disabled && document.getElementById('encounterTitle').textContent.startsWith('SYNTHETIC CHART ISOLATION')`, 'patient isolation navigation');
  assert.deepEqual(await js("['chartReviewCoverage','chartReviewFindings','chartReviewClarifications','chartReviewMetrics'].map(id=>document.getElementById(id).textContent)"), ['', '', '', '']);
  assert.equal(await js("document.getElementById('chartReviewPassage').hidden"), true);
  await js(`document.getElementById('patient').value=${JSON.stringify(patient.id)};document.getElementById('patient').dispatchEvent(new Event('change',{bubbles:true}))`);
  await wait("document.getElementById('encounterTitle').textContent.startsWith('SYNTHETIC CHART REVIEW') && !document.getElementById('newEncounter').disabled", 'return to target patient');
  await wait(`!document.getElementById('chartReview').hidden && document.getElementById('editor').dataset.encounterId===${JSON.stringify(currentEncounter.id)}`, 'chart review panel again');
  await js("document.getElementById('askChartReview').click()");
  await wait("document.querySelector('#chartReviewFindings section') && !document.getElementById('askChartReview').disabled", 'second chart review');
  await js("document.getElementById('lock').click()");
  await wait("!document.getElementById('locked').hidden && document.getElementById('workspace').hidden", 'lock purge');
  assert.deepEqual(await js("['chartReviewCoverage','chartReviewFindings','chartReviewClarifications','chartReviewMetrics','chartReviewPassage','queryQuestion','queryAnswer','sourceText','draftText','historyRecords'].map(id=>document.getElementById(id).value??document.getElementById(id).textContent)"), Array(10).fill(''));
  assert.equal(await js("document.getElementById('editor').dataset.encounterId"), '');
  const summary = {
    schemaVersion: 1, kind: 'automated-desktop-chart-review-ui-check', completedAt: new Date().toISOString(), passed: true,
    testDouble: true, realGpu: false, humanWorkflowAcceptance: false, physicalCaptureAcceptance: false,
    checks: [
      'chart review panel appears only for a reviewed source and carries the permanent read-only notice',
      'coverage discloses supplied/available records and the documented date range',
      'findings are grouped by kind and clarifications show reasons',
      'model identity and measurements show the test double honestly',
      'evidence chip opens the canonical approved passage with its documented date and record',
      'chart review output purged on patient change',
      'chart review output purged on lock',
    ],
    screenshots: ['chart-review-panel.png'],
  };
  await writeFile(join(directory, 'summary.json'), JSON.stringify(summary, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  return summary;
}

/** This file compiles into both the shared dist/ and cell-local builds; find the repository root by content, not by depth. */
function repositoryRoot(start: string) {
  let current = start;
  for (let depth = 0; depth < 12; depth++) {
    if (existsSync(join(current, 'node_modules/electron')) && existsSync(join(current, 'apps/desktop/ui/index.html'))) return current;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  throw new Error('Repository root not found from ' + start);
}

async function main() {
  const root = repositoryRoot(fileURLToPath(new URL('.', import.meta.url)));
  const executable = join(root, 'node_modules/electron/dist', process.platform === 'win32' ? 'electron.exe' : process.platform === 'darwin' ? 'Electron.app/Contents/MacOS/Electron' : 'electron');
  const environment: NodeJS.ProcessEnv = { ...process.env, PSYREC_UI_CHECK_ROOT: root };
  delete environment.ELECTRON_RUN_AS_NODE; delete environment.PSYREC_HOME;
  const cellMain = join(root, '.local/cells/C/dist/apps/desktop/main.js');
  const child = spawn(executable, [cellMain, '--chart-review-ui-check'], { cwd: root, env: environment, stdio: 'inherit', windowsHide: true });
  const code = await new Promise<number>((resolve, reject) => { child.once('error', reject); child.once('exit', exitCode => resolve(exitCode ?? 1)); });
  console.log(JSON.stringify({ testDouble: true, noGpu: true, exitCode: code }));
  process.exitCode = code;
}
if (!process.versions.electron && process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) void main().catch(error => { console.error(error.message); process.exitCode = 1; });
