import type { ApprovedQueryAnswer } from '../../packages/core/types.js';
import type { ChartReviewResult } from '../../packages/contracts/chart-review.js';
import type { PsyRecService } from '../../packages/core/service.js';
export {};
declare global { interface Window { psyrec: { call(method: string, ...args: any[]): Promise<any>; onLock(callback: () => void): void; } } }
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const call = (method, ...args) => window.psyrec.call(method, ...args);
let state: ReturnType<PsyRecService['snapshot']> | null, patientId = '', encounterId = '', busy = false, createVault = false, lastCapture = '';
let physicalObserving = false;
let lastQuery: ApprovedQueryAnswer | null = null;
let lastChartReview: ChartReviewResult | null = null;
const goldEdits = new Map<string, { text: string; confirmed: boolean }>();
let pendingSource = '', pendingEncounter = '', pendingRevision = 0, sessionGeneration = 0;
const edits = new Map<string, { revision: number; draftId: string; source: string; draft: string }>();
function rememberEdits() { const e = current(); if (e) { edits.set(e.id, { revision: e.source.revision, draftId: e.draft?.id ?? '', source: $<HTMLTextAreaElement>('sourceText').value, draft: $<HTMLTextAreaElement>('draftText').value }); goldEdits.set(e.id, { text: $<HTMLTextAreaElement>('goldText').value, confirmed: $<HTMLInputElement>('goldSynthetic').checked }); } }
const sourceDirty = () => Boolean(current() && $<HTMLTextAreaElement>('sourceText').value.trim() !== current().source.text);
function resetApproval() { $<HTMLInputElement>('confirmApproval').checked = false; rememberEdits(); refreshButtons(); }
const current = () => state?.encounters.find(e => e.id === encounterId);
const notice = (message = '', error = false) => { $('notice').textContent = message; $('notice').className = error ? 'error' : ''; };
const cleanError = error => String(error.message ?? error).replace(/^Error invoking remote method '[^']+': Error: /, '');
async function action(fn, message = '') { if (busy) return; busy = true; notice(message); refreshButtons(); try { await fn(); } catch (error) { notice(cleanError(error), true); } finally { busy = false; refreshButtons(); } }

function clearQuery(preserveQuestion = false) {
  lastQuery = null;
  if (!preserveQuestion) $<HTMLTextAreaElement>('queryQuestion').value = '';
  $('queryAnswer').replaceChildren(); $('queryCoverage').replaceChildren(); $('queryMetrics').replaceChildren(); $('queryEvidence').hidden = true;
}
function clearChartReview() {
  lastChartReview = null;
  $('chartReviewCoverage').replaceChildren(); $('chartReviewFindings').replaceChildren(); $('chartReviewClarifications').replaceChildren();
  $('chartReviewPassage').replaceChildren(); $('chartReviewPassage').hidden = true;
  $('chartReviewMetrics').replaceChildren(); $('chartReviewEvidence').hidden = true;
}
const chartReviewStale = (result: ChartReviewResult) => {
  if (!state || result.patientId !== patientId || result.currentEncounterId !== encounterId) return true;
  const encounter = current();
  const currentEvidence = result.evidence.find(item => item.kind === 'current');
  if (!encounter || !currentEvidence || encounter.source.revision !== currentEvidence.sourceRevision || encounter.source.text.slice(currentEvidence.start, currentEvidence.end) !== currentEvidence.text) return true;
  return result.evidence.some(item => item.kind === 'historical' && !state.records.some(r => r.id === item.recordId && r.patientId === patientId && !r.supersededAt && r.sourceRevision === item.sourceRevision && r.text.slice(item.start, item.end) === item.text));
};
const CHART_REVIEW_KINDS: [string, string][] = [['new', 'New'], ['changed', 'Changed'], ['unchanged', 'Unchanged'], ['resolved', 'Resolved'], ['conflict', 'Conflict'], ['unknown', 'Unknown / not documented']];
function showChartReview(result: ChartReviewResult) {
  lastChartReview = result;
  const coverage = result.coverage;
  $('chartReviewCoverage').textContent = 'Application-bound approved history · ' + coverage.historicalRecordsSupplied + ' of ' + coverage.historicalRecordsAvailable + ' current approved record(s) supplied'
    + (coverage.dateRange.from ? ' · documented history ' + coverage.dateRange.from + ' → ' + coverage.dateRange.to : ' · no approved history supplied')
    + ' · ' + coverage.charactersSupplied + ' characters sent to the local model.'
    + (coverage.historicalRecordsAvailable === 0 ? ' No approved history exists for this patient; findings describe the current source only.' : '');
  if (coverage.omitted.length) {
    const list = document.createElement('ul');
    for (const note of coverage.omitted) { const item = document.createElement('li'); item.textContent = 'Omitted: ' + note; list.append(item); }
    $('chartReviewCoverage').append(list);
  }
  const chip = (evidenceId: string) => {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'secondary small'; button.textContent = evidenceId;
    button.onclick = () => void action(async () => {
      const generation = sessionGeneration, selected = patientId;
      const passage = await call('resolveChartReviewEvidence', selected, result.reviewId, evidenceId);
      if (generation !== sessionGeneration || selected !== patientId || lastChartReview?.reviewId !== result.reviewId) return;
      const box = $('chartReviewPassage'); box.replaceChildren();
      const meta = document.createElement('small');
      meta.textContent = (passage.kind === 'current' ? 'Current reviewed source' : 'Approved record ' + (passage.recordId ?? '').slice(0, 8)) + ' · documented ' + passage.sourceDate + ' · source revision ' + passage.sourceRevision;
      const quote = document.createElement('blockquote'); quote.textContent = passage.text || '(No excerpt supplied; see coverage omissions.)';
      box.append(meta, quote); box.hidden = false;
    });
    return button;
  };
  const findings = $('chartReviewFindings'); findings.replaceChildren();
  if (!result.output.findings.length) findings.textContent = 'The local model reported no findings within the supplied evidence.';
  for (const [kind, label] of CHART_REVIEW_KINDS) {
    const group = result.output.findings.filter(f => f.kind === kind);
    if (!group.length) continue;
    const section = document.createElement('section'), title = document.createElement('h3');
    title.textContent = label + ' (' + group.length + ')'; section.append(title);
    for (const finding of group) { const row = document.createElement('p'); row.textContent = finding.statement + ' '; row.append(...finding.evidenceIds.map(chip)); section.append(row); }
    findings.append(section);
  }
  const clarifications = $('chartReviewClarifications'); clarifications.replaceChildren();
  if (result.output.clarifications.length) {
    const title = document.createElement('h3'); title.textContent = 'Still needs clarification (' + result.output.clarifications.length + ')'; clarifications.append(title);
    for (const clarification of result.output.clarifications) { const row = document.createElement('p'); row.textContent = clarification.question + ' — Reason: ' + clarification.reason + ' '; row.append(...clarification.evidenceIds.map(chip)); clarifications.append(row); }
  }
  $('chartReviewMetrics').textContent = 'Model: ' + result.modelIdentity + '\nValidated and revalidated: ' + result.validation.revalidatedAt + '\n' + JSON.stringify(result.metrics, null, 2);
  $('chartReviewEvidence').hidden = false;
}
function renderGoldStatus() {
  const reference = state?.goldTranscriptions?.filter(gold => gold.encounterId === encounterId).at(-1);
  $('goldStatus').textContent = reference ? 'Immutable human reference saved ' + new Date(reference.createdAt).toLocaleString() + '. Another save creates a new reference.' : 'No human reference saved for this capture.';
  if (!reference) { $('goldScore').replaceChildren(); return; }
  if (reference.accuracy.status === 'unavailable') { $('goldScore').textContent = 'Accuracy unavailable: ' + reference.accuracy.reason; return; }
  const { scores, methods, extractionRunId, performanceEvidenceComplete } = reference.accuracy;
  const percent = (value: number) => (value * 100).toFixed(2) + '%';
  $('goldScore').textContent = [
    'Original extraction run: ' + extractionRunId,
    'Word error rate (WER): ' + percent(scores.wer.rate) + ' · substitutions ' + scores.wer.substitutions + ', deletions ' + scores.wer.deletions + ', insertions ' + scores.wer.insertions + ' / ' + scores.wer.referenceUnits + ' reference words.',
    'Character error rate (CER): ' + percent(scores.cer.rate) + ' · substitutions ' + scores.cer.substitutions + ', deletions ' + scores.cer.deletions + ', insertions ' + scores.cer.insertions + ' / ' + scores.cer.referenceUnits + ' reference code points.',
    'Exact raw text match: ' + (scores.exactTextMatch ? 'yes' : 'no'),
    'Native performance evidence complete: ' + (performanceEvidenceComplete ? 'yes' : 'no'),
    'Clinical categories are unscored without explicit reference rules. These rates do not establish clinical safety or release acceptance.',
    reference.referenceConditions,
    'WER method: ' + methods.wer, 'CER method: ' + methods.cer,
  ].join('\n\n');
}
function showQuery(answer: ApprovedQueryAnswer) {
  lastQuery = answer;
  const coverage = answer.coverage;
  $('queryCoverage').textContent = 'Local text matching · ' + coverage.excerptsSearched + ' passage(s) from ' + coverage.recordsRepresented + ' of ' + coverage.approvedRecordsScanned + ' current approved notes.' + (coverage.partial ? ' Limited coverage: other passages were not sent to QVAC.' : ' All available approved-note passages were included.') + (coverage.omittedLongPassages ? ' ' + coverage.omittedLongPassages + ' overlong sentence(s) were excluded; open the full approved notes below to inspect them.' : '') + ' Exact source context is shown; no generated interpretation is approved.';
  $('queryAnswer').replaceChildren();
  if (answer.status === 'not-found') $('queryAnswer').textContent = 'No answer found in the searched notes.';
  answer.citations.forEach((citation, index) => {
    const section = document.createElement('section'), quote = document.createElement('blockquote'), button = document.createElement('button');
    quote.textContent = citation.quote;
    button.type = 'button'; button.className = 'secondary small';
    button.textContent = 'Open approved note · ' + new Date(citation.approvedAt).toLocaleString() + ' · revision ' + citation.sourceRevision;
    button.onclick = () => void action(async () => {
      const generation = sessionGeneration, selected = patientId;
      const canonical = await call('resolveQueryCitation', selected, answer.queryId, index);
      if (generation !== sessionGeneration || selected !== patientId) return;
      encounterId = canonical.encounterId; await refresh(); $('history').hidden = false;
      const article = Array.from($('historyRecords').children).find(item => (item as HTMLElement).dataset.recordId === canonical.recordId);
      article?.scrollIntoView({ block: 'center' });
    });
    section.append(quote, button); $('queryAnswer').append(section);
  });
  $('queryMetrics').textContent = answer.metrics ? JSON.stringify(answer.metrics, null, 2) : 'No model was invoked because no complete approved passage fit this lookup.';
  $('queryEvidence').hidden = false;
}

function refreshButtons() {
  const e = current();
  $<HTMLTextAreaElement>('queryQuestion').disabled = busy || !patientId;
  $<HTMLButtonElement>('askApprovedNotes').disabled = busy || !patientId || !state?.queryEnabled;
  $<HTMLButtonElement>('askChartReview').disabled = busy || !e?.source.reviewed;
  $<HTMLTextAreaElement>('goldText').disabled = busy || !e?.capture;
  $<HTMLInputElement>('goldSynthetic').disabled = busy || !e?.capture;
  $<HTMLButtonElement>('saveGold').disabled = busy || !e?.capture || !$<HTMLTextAreaElement>('goldText').value.trim() || !$<HTMLInputElement>('goldSynthetic').checked;
  $<HTMLButtonElement>('attestPrintedSource').disabled = busy || !e?.capture;
  $<HTMLButtonElement>('exportPhysicalCandidate').disabled = busy || !e;
  $<HTMLSelectElement>('patient').disabled = busy;
  $<HTMLInputElement>('alias').disabled = busy;
  for (const button of $('encounters').querySelectorAll('button')) button.disabled = busy;
  for (const id of ['importImage', 'pairPhone', 'extract', 'reviewSource', 'draft', 'approve', 'newEncounter']) ($<HTMLButtonElement>(id)).disabled = busy || !e;
  $<HTMLButtonElement>('newEncounter').disabled = busy || !patientId;
  $<HTMLButtonElement>('importImage').disabled = busy || !e || Boolean(e.capture);
  $<HTMLButtonElement>('pairPhone').disabled = busy || !e || Boolean(e.capture);
  $<HTMLButtonElement>('extract').disabled = busy || !e?.capture || Boolean(e.source.revision);
  $<HTMLButtonElement>('reviewSource').disabled = busy || !e?.source.revision || !$<HTMLTextAreaElement>('sourceText').value.trim();
  $<HTMLButtonElement>('draft').disabled = busy || !e?.source.reviewed || $<HTMLTextAreaElement>('sourceText').value.trim() !== e?.source.text;
  $<HTMLButtonElement>('approve').disabled = busy || !e?.draft || sourceDirty() || !$<HTMLTextAreaElement>('draftText').value.trim() || !$<HTMLInputElement>('confirmApproval').checked;
}
async function status() {
  const s = await call('status'); createVault = !s.exists; physicalObserving = s.physicalObserverEnabled === true;
  $('exportPhysicalCandidate').hidden = !physicalObserving;
  $('unlockTitle').textContent = createVault ? 'Create your private vault' : 'Open your workspace';
  $('unlock').textContent = createVault ? 'Create encrypted vault' : 'Unlock vault';
  $('runtimeStatus').textContent = JSON.stringify(s.runtime, null, 2);
  $<HTMLSelectElement>('lanAddress').replaceChildren(...s.addresses.map(address => new Option(address, address)));
  return s;
}
async function refresh() {
  const generation = sessionGeneration;
  const next = await call('snapshot');
  if (generation !== sessionGeneration) return;
  state = next;
  if (!state.patients.some(p => p.id === patientId)) patientId = state.patients[0]?.id ?? '';
  $<HTMLSelectElement>('patient').replaceChildren(...state.patients.map(p => new Option(p.alias, p.id)));
  $<HTMLSelectElement>('patient').value = patientId;
  const encounters = state.encounters.filter(e => e.patientId === patientId);
  if (!encounters.some(e => e.id === encounterId)) encounterId = encounters.at(-1)?.id ?? '';
  $('encounters').replaceChildren(...encounters.map(e => {
    const button = document.createElement('button'); button.textContent = `${new Date(e.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · ${e.status.replaceAll('-', ' ')}`;
    button.className = e.id === encounterId ? 'selected' : '';
    button.onclick = () => action(async () => { rememberEdits(); encounterId = e.id; await refresh(); }); return button;
  }));
  const e = current(); $('editor').dataset.encounterId = e?.id ?? ''; $('empty').hidden = Boolean(e); $('editor').hidden = !e;
  $('encounterTitle').textContent = state.patients.find(p => p.id === patientId)?.alias ?? 'Choose a patient to begin';
  $('encounterStatus').textContent = e ? `${e.status.replaceAll('-', ' ')} · ${e.id.slice(0, 8)}` : 'Create a patient, then start an encounter.';
  if (e) {
    $('attestPrintedSource').hidden = !physicalObserving || !e.capture;
    $('revision').textContent = String(e.source.revision);
    const edit = edits.get(e.id);
    const approved = state.records.find(r => r.encounterId === e.id && !r.supersededAt);
    $<HTMLTextAreaElement>('draftText').readOnly = !e.draft;
    $<HTMLInputElement>('confirmApproval').disabled = !e.draft;
    $('draftLabel').textContent = e.draft ? 'Review and edit this draft' : approved ? 'Saved approved record' : 'Review and edit this draft';
    $<HTMLTextAreaElement>('sourceText').value = edit?.revision === e.source.revision ? edit.source : e.source.text;
    $<HTMLTextAreaElement>('draftText').value = edit && edit.draftId === e.draft?.id ? edit.draft : e.draft?.text ?? approved?.text ?? '';
    const goldEdit = goldEdits.get(e.id);
    $<HTMLTextAreaElement>('goldText').value = goldEdit?.text ?? '';
    $<HTMLInputElement>('goldSynthetic').checked = goldEdit?.confirmed ?? false;
    renderGoldStatus();
    rememberEdits();
    $<HTMLInputElement>('confirmApproval').checked = false;
    $('draftLink').textContent = e.draft ? `Linked to source revision ${e.draft.sourceRevision}. Historical context: ${e.draft.context.status}.` : approved ? `Approved record - source revision ${approved.sourceRevision}. Create a new draft to make a new approval.` : 'No active draft';
    $('sourceState').textContent = e.source.reviewed ? 'Source confirmed. Changes require a new review.' : 'Check and confirm the source before drafting.';
    $('approvedBanner').hidden = e.status !== 'approved';
    $('metrics').textContent = JSON.stringify({ extraction: e.source.metrics ?? null, drafting: e.draft?.metrics ?? state.records.filter(r => r.encounterId === e.id).at(-1)?.draftingMetrics ?? null }, null, 2);
    const data = await call('captureData', e.id); if (generation !== sessionGeneration) return; $<HTMLImageElement>('sourceImage').src = data ?? ''; $('sourceImage').hidden = !data; $('noImage').hidden = Boolean(data); lastCapture = e.capture?.id ?? '';
  }
  if (lastQuery && lastQuery.citations.some(citation => !state.records.some(record => record.id === citation.recordId && record.patientId === patientId && !record.supersededAt && record.sourceRevision === citation.sourceRevision && record.text.slice(citation.start, citation.end) === citation.quote))) { clearQuery(true); $('queryCoverage').textContent = 'An approved source changed. Ask again against the current notes.'; }
  $('chartReview').hidden = !e?.source.reviewed;
  if (lastChartReview && chartReviewStale(lastChartReview)) { clearChartReview(); $('chartReviewCoverage').textContent = 'The source or an approved record changed. Request a new chart review against the current chart.'; }
  await renderHistory(); refreshButtons();
}
async function renderHistory() {
  if (!patientId) { $('historyRecords').replaceChildren(); return; }
  const generation = sessionGeneration, selected = patientId;
  const records = await call('approvedNotes', patientId, $<HTMLInputElement>('showSuperseded').checked);
  if (generation !== sessionGeneration || selected !== patientId) return;
  $('historyRecords').replaceChildren(...records.map(r => {
    const article = document.createElement('article'), meta = document.createElement('small'), text = document.createElement('p');
    article.dataset.recordId = r.id;
    meta.textContent = `${r.supersededAt ? 'SUPERSEDED' : 'APPROVED'} · ${new Date(r.approvedAt).toLocaleString()} · source revision ${r.sourceRevision} · ${r.id.slice(0, 8)}`;
    text.textContent = r.text; article.append(meta, text); return article;
  }));
  if (!records.length) $('historyRecords').textContent = 'No approved notes for this patient.';
}

$('queryForm').onsubmit = event => {
  event.preventDefault();
  void action(async () => {
    const generation = sessionGeneration, selected = patientId, question = $<HTMLTextAreaElement>('queryQuestion').value;
    clearQuery(true);
    const answer = await call('queryApprovedNotes', selected, question) as ApprovedQueryAnswer;
    if (generation !== sessionGeneration || selected !== patientId || answer.patientId !== selected) return;
    showQuery(answer);
  }, 'Searching this patient’s approved notes locally…');
};
$('askChartReview').onclick = () => void action(async () => {
  const generation = sessionGeneration, selected = patientId, selectedEncounter = encounterId;
  clearChartReview();
  const result = await call('reviewChart', selected, selectedEncounter) as ChartReviewResult;
  if (generation !== sessionGeneration || selected !== patientId || encounterId !== selectedEncounter || result.patientId !== selected) return;
  showChartReview(result);
}, 'MedPsy is reviewing the chart locally…');

$('goldText').oninput = () => { $<HTMLInputElement>('goldSynthetic').checked = false; rememberEdits(); refreshButtons(); };
$('goldSynthetic').onchange = () => { rememberEdits(); refreshButtons(); };
$('saveGold').onclick = event => void action(async () => {
  const generation = sessionGeneration, selectedEncounter = encounterId;
  await call('recordHumanGoldTranscription', selectedEncounter, $<HTMLTextAreaElement>('goldText').value, $<HTMLInputElement>('goldSynthetic').checked, event.isTrusted);
  if (generation !== sessionGeneration || selectedEncounter !== encounterId) return;
  goldEdits.delete(selectedEncounter); $<HTMLTextAreaElement>('goldText').value = ''; $<HTMLInputElement>('goldSynthetic').checked = false;
  await refresh(); notice('Human reference saved separately. Accuracy uses only retained original extraction output.');
});

$('unlockForm').onsubmit = event => { event.preventDefault(); void action(async () => { await call('unlock', $<HTMLInputElement>('passphrase').value, createVault); $<HTMLInputElement>('passphrase').value = ''; $('locked').hidden = true; $('workspace').hidden = false; $('lock').hidden = false; await refresh(); notice('Vault unlocked.'); }); };
$('lock').onclick = () => void call('lock');
window.psyrec.onLock(() => {
  sessionGeneration++; clearQuery(); clearChartReview(); state = null; edits.clear(); goldEdits.clear(); patientId = encounterId = lastCapture = pendingSource = pendingEncounter = ''; pendingRevision = 0;
  $('attestPrintedSource').hidden = true; $('editor').dataset.encounterId = '';
  $('workspace').hidden = true; $('locked').hidden = false; $('lock').hidden = true; $('history').hidden = true;
  for (const id of ['sourceText', 'draftText', 'alias', 'passphrase', 'goldText']) $<HTMLInputElement>(id).value = '';
  for (const id of ['metrics', 'historyRecords', 'patient', 'encounters', 'encounterTitle', 'encounterStatus', 'consequenceText', 'pairStatus', 'revision', 'sourceState', 'draftLink', 'goldStatus', 'goldScore']) $(id).replaceChildren();
  for (const id of ['confirmApproval', 'syntheticOnly', 'showSuperseded', 'goldSynthetic']) $<HTMLInputElement>(id).checked = false;
  for (const id of ['sourceImage', 'pairQr']) { $<HTMLImageElement>(id).removeAttribute('src'); $(id).hidden = true; }
  $<HTMLDialogElement>('pairDialog').close(); $<HTMLDialogElement>('consequences').close();
  void status(); notice('Vault locked.');
});
$('patientForm').onsubmit = event => { event.preventDefault(); void action(async () => { rememberEdits(); clearQuery(); clearChartReview(); const p = await call('addPatient', $<HTMLInputElement>('alias').value); patientId = p.id; $<HTMLInputElement>('alias').value = ''; await refresh(); }); };
$('patient').onchange = () => void action(async () => { rememberEdits(); clearQuery(); clearChartReview(); patientId = $<HTMLSelectElement>('patient').value; encounterId = ''; await refresh(); });
$('newEncounter').onclick = () => void action(async () => { rememberEdits(); const e = await call('addEncounter', patientId); rememberEdits(); encounterId = e.id; await refresh(); });
$('importImage').onclick = () => void action(async () => { await call('import', encounterId); await refresh(); });
$('extract').onclick = () => void action(async () => { await call('extract', encounterId); await refresh(); notice('Extraction complete. Check every line against the image.'); }, 'VisionPsy is loading and reading the image locally…');
$('sourceText').oninput = () => { resetApproval(); $('sourceState').textContent = sourceDirty() ? 'Unsaved correction. Confirm reviewed source before drafting or approving.' : 'Source text matches the saved revision.'; };
$('reviewSource').onclick = () => void action(async () => {
  pendingSource = $<HTMLTextAreaElement>('sourceText').value; pendingEncounter = encounterId;
  const preview = await call('previewSourceChange', encounterId, pendingSource);
  pendingRevision = preview.sourceRevision;
  if (preview.changed && (preview.approvalsToSupersede.length || preview.discardDraft)) {
    $('consequenceText').textContent = `Revision ${preview.nextRevision} will supersede ${preview.approvalsToSupersede.length} approval(s)${preview.discardDraft ? ' and discard the current draft' : ''}. ${preview.approvalsToSupersede.map(a => a.id.slice(0, 8)).join(', ')}`;
    $<HTMLDialogElement>('consequences').showModal();
  } else { await call('reviewSource', pendingEncounter, pendingSource, pendingRevision); edits.delete(pendingEncounter); await refresh(); notice('Source review saved.'); }
});
$('cancelCorrection').onclick = () => $<HTMLDialogElement>('consequences').close();
$('confirmCorrection').onclick = () => void action(async () => { await call('reviewSource', pendingEncounter, pendingSource, pendingRevision); edits.delete(pendingEncounter); $<HTMLDialogElement>('consequences').close(); await refresh(); notice('Correction saved. Review and approve a new draft.'); });
$('draft').onclick = () => void action(async () => { await call('generateDraft', encounterId); await refresh(); notice('Draft ready for clinician review.'); }, 'Creating a draft from the reviewed source…');
$('confirmApproval').onchange = refreshButtons;
$('draftText').oninput = resetApproval;
$('approve').onclick = () => void action(async () => { const e = current(); if (sourceDirty()) throw new Error('Save and review the source correction first.'); await call('approve', e.id, e.draft.id, e.draft.sourceRevision, $<HTMLTextAreaElement>('draftText').value); edits.delete(e.id); await refresh(); $('history').hidden = false; notice('Exact reviewed record approved and encrypted.'); });
$('historyToggle').onclick = () => { $('history').hidden = !$('history').hidden; };
$('showSuperseded').onchange = () => void renderHistory();
$('pairPhone').onclick = () => void action(async () => { await status(); $('pairQr').hidden = true; $('pairStatus').textContent = ''; $<HTMLDialogElement>('pairDialog').showModal(); });
$('createInvite').onclick = () => void action(async () => { const invite = await call('pair', encounterId, $<HTMLSelectElement>('lanAddress').value); $<HTMLImageElement>('pairQr').src = invite.qr; $('pairQr').hidden = false; $('pairStatus').textContent = `Invitation expires ${new Date(invite.expiresAt).toLocaleTimeString()}. Bound to this encounter. Server identity: ${invite.certificateFingerprint.slice(0, 16)}…`; });
$('closePair').onclick = () => $<HTMLDialogElement>('pairDialog').close();
$('exportEvidence').onclick = () => void action(async () => { const result = await call('exportEvidence', $<HTMLInputElement>('syntheticOnly').checked); if (result) notice(`${result.count} complete synthetic run records exported.`); });
$('exportPhysicalCandidate').onclick = () => void action(async () => { const result = await call('exportPhysicalCandidate', encounterId, $<HTMLInputElement>('syntheticOnly').checked); if (result) notice(`Workflow candidate exported for independent review. ${result.reviewFailures} outstanding evidence checks. Acceptance remains pending.`); });
// Poll only capture receipt; never overwrite unsaved clinician edits.
setInterval(async () => { if (!state || busy || !current() || current().capture) return; try { const next = await call('snapshot'); const e = next.encounters.find(e => e.id === encounterId); if (e?.capture?.id && e.capture.id !== lastCapture) { await refresh(); $<HTMLDialogElement>('pairDialog').close(); notice('Encrypted phone capture received.'); } } catch {} }, 2500);
void status().catch(error => notice(cleanError(error), true));
