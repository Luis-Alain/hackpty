export {};
declare global { interface Window { psyrec: { call(method: string, ...args: any[]): Promise<any>; onLock(callback: () => void): void } } }
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const call = (method, ...args) => window.psyrec.call(method, ...args);
let state: any, patientId = '', encounterId = '', busy = false, createVault = false, lastCapture = '';
let pendingSource = '';
const current = () => state?.encounters.find(e => e.id === encounterId);
const notice = (message = '', error = false) => { $('notice').textContent = message; $('notice').className = error ? 'error' : ''; };
const cleanError = error => String(error.message ?? error).replace(/^Error invoking remote method '[^']+': Error: /, '');
async function action(fn, message = '') { if (busy) return; busy = true; notice(message); refreshButtons(); try { await fn(); } catch (error) { notice(cleanError(error), true); } finally { busy = false; refreshButtons(); } }
function refreshButtons() {
  const e = current();
  for (const id of ['importImage', 'pairPhone', 'extract', 'reviewSource', 'draft', 'approve', 'newEncounter']) ($<HTMLButtonElement>(id)).disabled = busy || !e;
  $<HTMLButtonElement>('newEncounter').disabled = busy || !patientId;
  $<HTMLButtonElement>('importImage').disabled = busy || !e || Boolean(e.capture);
  $<HTMLButtonElement>('pairPhone').disabled = busy || !e || Boolean(e.capture);
  $<HTMLButtonElement>('extract').disabled = busy || !e?.capture;
  $<HTMLButtonElement>('reviewSource').disabled = busy || !e?.source.revision || !$<HTMLTextAreaElement>('sourceText').value.trim();
  $<HTMLButtonElement>('draft').disabled = busy || !e?.source.reviewed || $<HTMLTextAreaElement>('sourceText').value.trim() !== e?.source.text;
  $<HTMLButtonElement>('approve').disabled = busy || !e?.draft || !$<HTMLInputElement>('confirmApproval').checked;
}
async function status() {
  const s = await call('status'); createVault = !s.exists;
  $('unlockTitle').textContent = createVault ? 'Create your private vault' : 'Open your workspace';
  $('unlock').textContent = createVault ? 'Create encrypted vault' : 'Unlock vault';
  $('runtimeStatus').textContent = JSON.stringify(s.runtime, null, 2);
  $<HTMLSelectElement>('lanAddress').replaceChildren(...s.addresses.map(address => new Option(address, address)));
  return s;
}
async function refresh() {
  state = await call('snapshot');
  if (!state.patients.some(p => p.id === patientId)) patientId = state.patients[0]?.id ?? '';
  $<HTMLSelectElement>('patient').replaceChildren(...state.patients.map(p => new Option(p.alias, p.id)));
  $<HTMLSelectElement>('patient').value = patientId;
  const encounters = state.encounters.filter(e => e.patientId === patientId);
  if (!encounters.some(e => e.id === encounterId)) encounterId = encounters.at(-1)?.id ?? '';
  $('encounters').replaceChildren(...encounters.map(e => {
    const button = document.createElement('button'); button.textContent = `${new Date(e.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · ${e.status.replaceAll('-', ' ')}`;
    button.className = e.id === encounterId ? 'selected' : '';
    button.onclick = () => action(async () => { encounterId = e.id; await refresh(); }); return button;
  }));
  const e = current(); $('empty').hidden = Boolean(e); $('editor').hidden = !e;
  $('encounterTitle').textContent = state.patients.find(p => p.id === patientId)?.alias ?? 'Choose a patient to begin';
  $('encounterStatus').textContent = e ? `${e.status.replaceAll('-', ' ')} · ${e.id.slice(0, 8)}` : 'Create a patient, then start an encounter.';
  if (e) {
    $('revision').textContent = String(e.source.revision);
    $<HTMLTextAreaElement>('sourceText').value = e.source.text;
    $<HTMLTextAreaElement>('draftText').value = e.draft?.text ?? '';
    $<HTMLInputElement>('confirmApproval').checked = false;
    $('draftLink').textContent = e.draft ? `Linked to source revision ${e.draft.sourceRevision}. Historical context: ${e.draft.context.status}.` : 'No active draft';
    $('sourceState').textContent = e.source.reviewed ? 'Source confirmed. Changes require a new review.' : 'Check and confirm the source before drafting.';
    $('approvedBanner').hidden = e.status !== 'approved';
    $('metrics').textContent = JSON.stringify({ extraction: e.source.metrics ?? null, drafting: e.draft?.metrics ?? state.records.filter(r => r.encounterId === e.id).at(-1)?.draftingMetrics ?? null }, null, 2);
    const data = await call('captureData', e.id); $<HTMLImageElement>('sourceImage').src = data ?? ''; $('sourceImage').hidden = !data; $('noImage').hidden = Boolean(data); lastCapture = e.capture?.id ?? '';
  }
  await renderHistory(); refreshButtons();
}
async function renderHistory() {
  if (!patientId) { $('historyRecords').replaceChildren(); return; }
  const records = await call('approvedNotes', patientId, $<HTMLInputElement>('showSuperseded').checked);
  $('historyRecords').replaceChildren(...records.map(r => {
    const article = document.createElement('article'), meta = document.createElement('small'), text = document.createElement('p');
    meta.textContent = `${r.supersededAt ? 'SUPERSEDED' : 'APPROVED'} · ${new Date(r.approvedAt).toLocaleString()} · source revision ${r.sourceRevision} · ${r.id.slice(0, 8)}`;
    text.textContent = r.text; article.append(meta, text); return article;
  }));
  if (!records.length) $('historyRecords').textContent = 'No approved notes for this patient.';
}
$('unlockForm').onsubmit = event => { event.preventDefault(); void action(async () => { await call('unlock', $<HTMLInputElement>('passphrase').value, createVault); $<HTMLInputElement>('passphrase').value = ''; $('locked').hidden = true; $('workspace').hidden = false; $('lock').hidden = false; await refresh(); notice('Vault unlocked.'); }); };
$('lock').onclick = () => void call('lock');
window.psyrec.onLock(() => { state = null; patientId = encounterId = lastCapture = ''; $('workspace').hidden = true; $('locked').hidden = false; $('lock').hidden = true; $<HTMLTextAreaElement>('sourceText').value = ''; $<HTMLTextAreaElement>('draftText').value = ''; $('metrics').textContent = ''; $('historyRecords').replaceChildren(); $<HTMLImageElement>('sourceImage').removeAttribute('src'); $<HTMLDialogElement>('pairDialog').close(); $<HTMLDialogElement>('consequences').close(); $<HTMLImageElement>('pairQr').removeAttribute('src'); void status(); notice('Vault locked.'); });
$('patientForm').onsubmit = event => { event.preventDefault(); void action(async () => { const p = await call('addPatient', $<HTMLInputElement>('alias').value); patientId = p.id; $<HTMLInputElement>('alias').value = ''; await refresh(); }); };
$('patient').onchange = () => void action(async () => { patientId = $<HTMLSelectElement>('patient').value; encounterId = ''; await refresh(); });
$('newEncounter').onclick = () => void action(async () => { const e = await call('addEncounter', patientId); encounterId = e.id; await refresh(); });
$('importImage').onclick = () => void action(async () => { await call('import', encounterId); await refresh(); });
$('extract').onclick = () => void action(async () => { await call('extract', encounterId); await refresh(); notice('Extraction complete. Check every line against the image.'); }, 'VisionPsy is loading and reading the image locally…');
$('sourceText').oninput = refreshButtons;
$('reviewSource').onclick = () => void action(async () => {
  pendingSource = $<HTMLTextAreaElement>('sourceText').value;
  const preview = await call('previewSourceChange', encounterId, pendingSource);
  if (preview.changed && (preview.approvalsToSupersede.length || preview.discardDraft)) {
    $('consequenceText').textContent = `Revision ${preview.nextRevision} will supersede ${preview.approvalsToSupersede.length} approval(s)${preview.discardDraft ? ' and discard the current draft' : ''}. ${preview.approvalsToSupersede.map(a => a.id.slice(0, 8)).join(', ')}`;
    $<HTMLDialogElement>('consequences').showModal();
  } else { await call('reviewSource', encounterId, pendingSource); await refresh(); notice('Source review saved.'); }
});
$('cancelCorrection').onclick = () => $<HTMLDialogElement>('consequences').close();
$('confirmCorrection').onclick = () => void action(async () => { await call('reviewSource', encounterId, pendingSource); $<HTMLDialogElement>('consequences').close(); await refresh(); notice('Correction saved. Review and approve a new draft.'); });
$('draft').onclick = () => void action(async () => { await call('generateDraft', encounterId); await refresh(); notice('Draft ready for clinician review.'); }, 'Creating a draft from the reviewed source…');
$('confirmApproval').onchange = refreshButtons;
$('draftText').oninput = () => { $<HTMLInputElement>('confirmApproval').checked = false; refreshButtons(); };
$('approve').onclick = () => void action(async () => { const e = current(); await call('approve', e.id, e.draft.id, e.draft.sourceRevision, $<HTMLTextAreaElement>('draftText').value); await refresh(); $('history').hidden = false; notice('Exact reviewed record approved and encrypted.'); });
$('historyToggle').onclick = () => { $('history').hidden = !$('history').hidden; };
$('showSuperseded').onchange = () => void renderHistory();
$('pairPhone').onclick = () => void action(async () => { await status(); $('pairQr').hidden = true; $('pairStatus').textContent = ''; $<HTMLDialogElement>('pairDialog').showModal(); });
$('createInvite').onclick = () => void action(async () => { const invite = await call('pair', encounterId, $<HTMLSelectElement>('lanAddress').value); $<HTMLImageElement>('pairQr').src = invite.qr; $('pairQr').hidden = false; $('pairStatus').textContent = `Invitation expires ${new Date(invite.expiresAt).toLocaleTimeString()}. Bound to this encounter. Server identity: ${invite.certificateFingerprint.slice(0, 16)}…`; });
$('closePair').onclick = () => $<HTMLDialogElement>('pairDialog').close();
$('exportEvidence').onclick = () => void action(async () => { const result = await call('exportEvidence', $<HTMLInputElement>('syntheticOnly').checked); if (result) notice(`${result.count} complete synthetic run records exported.`); });
// Poll only capture receipt; never overwrite unsaved clinician edits.
setInterval(async () => { if (!state || busy || !current() || current().capture) return; try { const next = await call('snapshot'); const e = next.encounters.find(e => e.id === encounterId); if (e?.capture?.id && e.capture.id !== lastCapture) { await refresh(); $<HTMLDialogElement>('pairDialog').close(); notice('Encrypted phone capture received.'); } } catch {} }, 2500);
void status().catch(error => notice(cleanError(error), true));
