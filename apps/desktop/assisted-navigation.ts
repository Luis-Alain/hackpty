import type { BrowserWindow } from 'electron';
import { writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

/** User-authorized app diagnostics: navigation and encrypted reload only.
 * Never invokes extraction, source review, drafting or approval. JS-dispatched
 * navigation events remain isTrusted=false in the encrypted observer ledger. */
export async function verifyAssistedNavigation(window: BrowserWindow, projectRoot: string, recordId: string, options: { syntheticOnly: true }) {
  if (options?.syntheticOnly !== true) throw new Error('Explicit verified synthetic-only scope is required for diagnostic screenshots.');
  const navigationVerification = { actor: 'assistant', method: 'PsyRec diagnostic interface', startedAt: new Date().toISOString() };
  const actions: { at: string; action: string; control?: string }[] = [];
  const note = (action: string, control?: string) => actions.push({ at: new Date().toISOString(), action, control });
  const js = (source: string) => window.webContents.executeJavaScript(source, true);
  const wait = async (condition: string) => {
    for (let attempt = 0; attempt < 200; attempt++) {
      if (await js(condition)) return;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('Assisted navigation timed out. No clinical text was changed.');
  };
  const click = async (id: string) => { await wait(`!document.getElementById(${JSON.stringify(id)}).disabled`); note('click; isTrusted=false', id); await js(`document.getElementById(${JSON.stringify(id)}).click()`); };
  const settle = () => new Promise(resolve => setTimeout(resolve, 1100));
  const selectPatient = async (id: string) => {
    note('select patient; isTrusted=false', 'patient');
    await js(`{const e=document.getElementById('patient');e.value=${JSON.stringify(id)};e.dispatchEvent(new Event('change',{bubbles:true}));}`);
    await wait(`!document.getElementById('newEncounter').disabled`); await settle();
  };
  await js(`history.replaceState(null,'',location.href.split('#')[0]);document.querySelector('.brand')?.removeAttribute('href')`);
  const initialStatus = await js(`window.psyrec.call('status')`);
  if (initialStatus.locked) {
    note('unlock auto-locked synthetic vault before recovery', 'unlock');
    await js(`document.getElementById('passphrase').value='synthetic-fold-review-passphrase';document.getElementById('unlock').click()`);
    await wait(`!document.getElementById('workspace').hidden && !document.getElementById('newEncounter').disabled`);
  }
  const snapshot = await js(`window.psyrec.call('snapshot')`);
  const approved = snapshot.records.find(r => r.id === recordId && !r.supersededAt);
  if (!approved) throw new Error('Requested approved record is unavailable.');
  const dirty = await js(`({ source: document.getElementById('sourceText').value, draft:document.getElementById('draftText').value, readOnly:document.getElementById('draftText').readOnly, visible:!document.getElementById('editor').hidden, status:document.getElementById('encounterStatus').textContent })`);
  const current = snapshot.encounters.find(e => dirty.status.includes(e.id.slice(0, 8)));
  if (dirty.visible && !current) throw new Error('Visible encounter could not be identified. Assisted navigation stopped without changing the editor.');
  if (dirty.visible && current && (dirty.source.trim() !== current.source.text || (!dirty.readOnly && current.draft && dirty.draft !== current.draft.text))) throw new Error('Unsaved clinician edits exist. They were preserved; assisted navigation stopped.');
  await js(`document.getElementById('pairDialog').close();document.getElementById('consequences').close()`);
  await selectPatient(approved.patientId);
  const selectApprovedEncounter = async () => {
    const next = await js(`window.psyrec.call('snapshot')`);
    const index = next.encounters.filter(e => e.patientId === approved.patientId).findIndex(e => e.id === approved.encounterId);
    if (index < 0) throw new Error('Approved encounter unavailable.');
    note('select approved encounter; isTrusted=false', 'encounters');
    await js(`document.querySelectorAll('#encounters button')[${index}].click()`);
    await wait(`!document.getElementById('newEncounter').disabled`);
  };
  await selectApprovedEncounter();
  if (await js(`document.getElementById('history').hidden`)) await click('historyToggle');
  await settle();
  const selectedHistoryContainsRecord = await js(`document.getElementById('historyRecords').textContent.includes(${JSON.stringify(approved.text.trim())})`);
  let other = snapshot.patients.find(p => p.id !== approved.patientId);
  if (!other) {
    note('create empty synthetic patient for isolation check', 'patientForm');
    await js(`document.getElementById('alias').value='SYNTHETIC ISOLATION CHECK';document.getElementById('patientForm').requestSubmit()`);
    await wait(`!document.getElementById('newEncounter').disabled`);
    const next = await js(`window.psyrec.call('snapshot')`); other = next.patients.find(p => p.id !== approved.patientId);
  }
  await selectPatient(other.id);
  const otherPatientExcluded = await js(`document.getElementById('historyRecords').textContent === 'No approved notes for this patient.'`);
  if (!selectedHistoryContainsRecord || !otherPatientExcluded) throw new Error('Patient history isolation check failed.');
  await selectPatient(approved.patientId); await selectApprovedEncounter(); await settle();
  await click('lock');
  await wait(`window.psyrec.call('status').then(s=>s.locked && !s.locking)`);
  const lockPurge = await js(`({fields:['sourceText','draftText','alias','passphrase'].every(id=>document.getElementById(id).value===''),content:['patient','encounters','historyRecords','metrics','consequenceText','pairStatus','encounterTitle'].every(id=>document.getElementById(id).textContent===''),images:['sourceImage','pairQr'].every(id=>!document.getElementById(id).hasAttribute('src'))})`);
  if (!Object.values(lockPurge).every(Boolean)) throw new Error('Locked renderer purge failed.');
  note('unlock same synthetic vault; no clinical edits', 'unlock');
  await js(`document.getElementById('passphrase').value='synthetic-fold-review-passphrase';document.getElementById('unlock').click()`);
  await wait(`!document.getElementById('workspace').hidden && !document.getElementById('newEncounter').disabled`);
  await selectPatient(approved.patientId); await selectApprovedEncounter();
  if (await js(`document.getElementById('history').hidden`)) await click('historyToggle');
  await settle();
  const reloaded = await js(`window.psyrec.call('snapshot')`);
  const record = reloaded.records.find(r => r.id === recordId && !r.supersededAt);
  if (!record || record.text !== approved.text || record.sourceRevision !== approved.sourceRevision) throw new Error('Approved record changed on reload.');
  const status = await js(`window.psyrec.call('status')`);
  window.show(); window.focus();
  await js(`document.getElementById('pairDialog').close();document.getElementById('history').scrollIntoView({block:'end'})`);
  await js(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
  await new Promise(resolve => setTimeout(resolve, 250));
  const screenshot = join(projectRoot, '.local/desktop-workflow/assisted-approved-history.png');
  await writeFile(screenshot, (await window.webContents.capturePage()).toPNG());
  const result = { navigationVerification, completedAt: new Date().toISOString(), actions, recordId, patientId: approved.patientId, otherPatientId: other.id, selectedHistoryContainsRecord, otherPatientExcluded, lockPurge, reloadedSha256: createHash('sha256').update(record.text).digest('hex'), status, screenshot };
  await writeFile(join(projectRoot, '.local/desktop-workflow/assisted-navigation.json'), JSON.stringify(result, null, 2));
  return { completed: true, screenshot, observationFailed: status.physicalObservationFailed };
}
