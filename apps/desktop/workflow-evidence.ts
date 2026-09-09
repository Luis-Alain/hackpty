import { BrowserWindow, dialog } from 'electron';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import assert from 'node:assert/strict';

async function paintedScreenshot(window: BrowserWindow, path: string) {
  window.showInactive();
  await window.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  await new Promise(resolve => setTimeout(resolve, 250));
  await writeFile(path, (await window.webContents.capturePage()).toPNG());
}

/** Reopen an existing synthetic test vault for visual QA, without model execution. */
export async function captureReloadEvidence(window: BrowserWindow, projectRoot: string, privateDirectory: string) {
  if (!process.env.PSYREC_HOME || !privateDirectory.includes('desktop-workflow')) throw new Error('Synthetic workflow vault required.');
  const js = (source: string) => window.webContents.executeJavaScript(source, true);
  const wait = async (condition: string) => {
    for (let attempt = 0; attempt < 100; attempt++) { if (await js(condition)) return; await new Promise(resolve => setTimeout(resolve, 100)); }
    throw new Error(`Reload visual QA wait failed: ${condition}`);
  };
  await wait(`document.getElementById('unlock').textContent.includes('Unlock')`);
  await js(`document.getElementById('passphrase').value='synthetic-workflow-passphrase';document.getElementById('unlock').click()`);
  await wait(`!document.getElementById('workspace').hidden && !document.getElementById('newEncounter').disabled`);
  await js(`document.querySelector('#encounters button').click()`);
  await wait(`!document.getElementById('newEncounter').disabled && document.getElementById('encounterStatus').textContent.includes('approved')`);
  await js(`document.getElementById('historyToggle').click()`);
  assert.match(await js(`document.getElementById('historyRecords').textContent`), /Reports poor sleep for three nights/);
  await paintedScreenshot(window, join(projectRoot, '.local/desktop-workflow/approved-reload.png'));
  await js(`document.getElementById('history').scrollIntoView({block:'end'})`);
  await paintedScreenshot(window, join(projectRoot, '.local/desktop-workflow/approved-history.png'));
  return { screenshot: '.local/desktop-workflow/approved-reload.png', inferenceExecuted: false, status: await js(`document.getElementById('encounterStatus').textContent`), history: await js(`document.getElementById('historyRecords').textContent`) };
}

/** Synthetic-only automated renderer exercise. Only native picker responses are
 * supplied by the driver; every product mutation uses the visible UI handlers. */
export async function runWorkflowEvidence(window: BrowserWindow, projectRoot: string, privateDirectory: string) {
  if (!process.env.PSYREC_HOME || !privateDirectory.includes('desktop-workflow')) throw new Error('Use a dedicated synthetic desktop-workflow vault directory.');
  const output = join(projectRoot, '.local', 'desktop-workflow');
  await mkdir(output, { recursive: true });
  const steps: { operation: string; passed: boolean; evidence: unknown }[] = [];
  const hash = (text: string | Buffer) => createHash('sha256').update(text).digest('hex');
  const js = <T = any>(source: string): Promise<T> => window.webContents.executeJavaScript(source, true);
  const wait = async (condition: string, timeout = 180000) => {
    const start = Date.now(); console.log('WORKFLOW WAIT', condition);
    while (!(await js(condition))) {
      const error = await js<string>(`document.getElementById('notice').className === 'error' ? document.getElementById('notice').textContent : ''`);
      if (error) throw new Error(`Renderer action failed while waiting ${condition}: ${error}`);
      if (Date.now() - start > timeout) throw new Error(`Renderer wait timed out: ${condition}; ${await js('document.getElementById("notice").textContent')}`);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  };
  const fill = (id: string, value: string) => js(`{const e=document.getElementById(${JSON.stringify(id)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('input',{bubbles:true}));}`);
  const click = async (id: string) => { await wait(`!document.getElementById(${JSON.stringify(id)}).disabled`); await js(`document.getElementById(${JSON.stringify(id)}).click()`); };
  const idle = () => wait(`!document.getElementById('newEncounter').disabled`);
  const snapshot = () => js('window.psyrec.call("snapshot")');
  const step = (operation: string, evidence: unknown) => { console.log('WORKFLOW PASSED', operation); steps.push({ operation, passed: true, evidence }); };
  const fixture = join(projectRoot, 'diagnostics/qvac-spike/fixtures/synthetic-note.png');
  const exported = join(output, 'runs.jsonl');
  dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [fixture] })) as typeof dialog.showOpenDialog;
  dialog.showSaveDialog = (async () => ({ canceled: false, filePath: exported })) as typeof dialog.showSaveDialog;
  const password = 'synthetic-workflow-passphrase';
  await wait(`document.getElementById('unlock').textContent.includes('Create')`);
  await fill('passphrase', password); await click('unlock');
  await wait(`!document.getElementById('workspace').hidden`);
  await fill('alias', 'SYNTHETIC WORKFLOW A');
  await js(`document.getElementById('patientForm').requestSubmit()`); await idle();
  await click('newEncounter'); await wait(`!document.getElementById('editor').hidden`); await idle();
  await click('importImage'); await wait(`document.getElementById('sourceImage').src.startsWith('data:image/png')`); await idle();
  let data = await snapshot(); const patientId = data.patients[0].id, encounterId = data.encounters[0].id;
  step('imported-synthetic-image', { method: 'actual renderer import handler; native dialog response selects synthetic fixture', fixture: 'diagnostics/qvac-spike/fixtures/synthetic-note.png', sha256: hash(await readFile(fixture)), captureId: data.encounters[0].capture.id, physicalPhone: false });
  await click('extract'); await wait(`document.getElementById('sourceText').value.length > 0`); await idle();
  const extracted = await js<string>(`document.getElementById('sourceText').value`);
  data = await snapshot(); const extractRunId = data.encounters[0].source.metrics.runId;
  step('real-visionpsy-extraction', { runId: extractRunId, extractedText: extracted });
  const corrected = 'SYNTHETIC TRAINING NOTE\nSource ID: DEMO-001\nReports poor sleep for three nights.\nNo diagnosis recorded.\nFollow up: review sleep log.';
  await fill('sourceText', corrected);
  assert.equal(await js(`document.getElementById('draft').disabled`), true);
  await click('reviewSource'); await idle();
  await wait(`!document.getElementById('draft').disabled`);
  data = await snapshot(); assert.equal(data.encounters[0].source.text, corrected);
  step('source-correction-review', { extractedSha256: hash(extracted), correctedText: corrected, correctedSha256: hash(corrected), sourceRevision: data.encounters[0].source.revision });
  await click('draft'); await wait(`document.getElementById('draftText').value.length > 0`); await idle();
  data = await snapshot(); const draftRunId = data.encounters[0].draft.metrics.runId;
  const modelDraft = data.encounters[0].draft.text;
  step('real-bounded-draft', { runId: draftRunId, sourceRevision: data.encounters[0].draft.sourceRevision, text: modelDraft });
  await fill('draftText', modelDraft + '\nClinician review completed.');
  await click('confirmApproval');
  await fill('sourceText', corrected + '\nUnsaved correction');
  assert.equal(await js(`document.getElementById('approve').disabled`), true);
  assert.equal(await js(`document.getElementById('confirmApproval').checked`), false);
  await fill('sourceText', corrected);
  await click('newEncounter'); await idle();
  await js(`document.querySelector('#encounters button').click()`); await idle();
  assert.equal(await js(`document.getElementById('draftText').value`), modelDraft + '\nClinician review completed.');
  step('unsaved-edit-and-stale-approval-guard', { editSurvivedEncounterSwitch: true, dirtySourceBlockedApproval: true, inputChangeClearedConfirmation: true });
  // Exact clinician-edited text, including leading/trailing whitespace, must persist.
  const exactText = '  Reports poor sleep for three nights. No diagnosis recorded. Follow up: review sleep log.\n';
  await fill('draftText', exactText); await click('confirmApproval'); await click('approve'); await idle();
  data = await snapshot(); let approved = data.records.find(r => r.encounterId === encounterId && !r.supersededAt);
  assert.equal(approved.text, exactText);
  const approvedSha256 = hash(approved.text);
  step('exact-approval-encrypted-save', { recordId: approved.id, sourceRevision: approved.sourceRevision, exactText, approvedSha256 });
  await fill('sourceText', corrected + '\nCorrection preview only.'); await click('reviewSource');
  await wait(`document.getElementById('consequences').open`);
  assert.match(await js(`document.getElementById('consequenceText').textContent`), /supersede 1 approval/);
  await click('cancelCorrection'); await fill('sourceText', corrected);
  step('consequence-preview-cancel', { supersededApprovalCountShown: 1, originalApprovalRetained: true });
  await fill('alias', 'SYNTHETIC WORKFLOW B'); await js(`document.getElementById('patientForm').requestSubmit()`); await idle();
  assert.match(await js(`document.getElementById('historyRecords').textContent`), /No approved notes/);
  await js(`{const e=document.getElementById('patient');e.value=${JSON.stringify(patientId)};e.dispatchEvent(new Event('change',{bubbles:true}));}`); await idle();
  assert.match(await js(`document.getElementById('historyRecords').textContent`), /Reports poor sleep for three nights/);
  step('selected-patient-approved-history', { patientId, otherPatientExcluded: true, selectedPatientRecordVisible: true });
  await js(`document.querySelector('#encounters button').click()`); await idle();
  await click('syntheticOnly'); await click('exportEvidence'); await idle();
  const runs = (await readFile(exported, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
  assert.equal(runs.length, 2); assert.deepEqual(runs.map(r => r.metrics.runId), [extractRunId, draftRunId]);
  await paintedScreenshot(window, join(output, 'approved.png'));
  const disk = await readFile(join(privateDirectory, 'psyrec.vault'), 'utf8');
  assert.equal(disk.includes('Reports poor sleep'), false); assert.equal(disk.includes('SYNTHETIC WORKFLOW'), false);
  await click('lock'); await wait(`document.getElementById('workspace').hidden`);
  const lockPurge = await js(`({ fields:['sourceText','draftText','alias','passphrase'].every(id=>document.getElementById(id).value===''), content:['patient','encounters','historyRecords','metrics','consequenceText','pairStatus','encounterTitle'].every(id=>document.getElementById(id).textContent===''), images:['sourceImage','pairQr'].every(id=>!document.getElementById(id).hasAttribute('src')) })`);
  assert.ok(Object.values(lockPurge).every(Boolean)); step('lock-renderer-purge', lockPurge);
  await wait(`window.psyrec.call('status').then(s=>s.locked && !s.locking)`);
  await fill('passphrase', password); await click('unlock'); await wait(`!document.getElementById('workspace').hidden`); await idle();
  data = await snapshot(); approved = data.records.find(r => r.encounterId === encounterId && !r.supersededAt);
  assert.equal(approved.text, exactText); const reloadedSha256 = hash(approved.text);
  step('encrypted-reload', { reloadedSha256, identicalToApproved: reloadedSha256 === approvedSha256, plaintextAbsentFromVaultEnvelope: true });
  const receipt = { schemaVersion: 1, syntheticOnly: true, kind: 'automated-electron-renderer-import-workflow', completedAt: new Date().toISOString(), physicalFoldAcceptance: false, clinicianHumanAcceptance: false, steps, runs, source: { extracted, corrected }, approval: { exactText, approvedSha256, reloadedSha256 }, historyIsolation: true, lockPurge };
  await writeFile(join(output, 'receipt.json'), JSON.stringify(receipt, null, 2));
  return { output, steps: steps.length, runIds: runs.map(r => r.metrics.runId) };
}
