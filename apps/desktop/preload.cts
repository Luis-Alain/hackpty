import { contextBridge, ipcRenderer } from 'electron';
const allowed = new Set(['status', 'unlock', 'lock', 'snapshot', 'addPatient', 'addEncounter', 'captureData', 'import', 'extract', 'previewSourceChange', 'reviewSource', 'generateDraft', 'approve', 'approvedNotes', 'revokeDevice', 'pair', 'exportEvidence', 'exportPhysicalCandidate', 'queryApprovedNotes', 'resolveQueryCitation', 'recordHumanGoldTranscription', 'reviewChart', 'resolveChartReviewEvidence']);
let goldGrant: { encounterId: string; text: string; expiresAt: number } | null = null;
let physicalObserving = false;
// These listeners run in the isolated preload world. Renderer arguments cannot
// manufacture trusted DOM events, enable observation or directly set this grant.
document.addEventListener('click', event => {
  if (!event.isTrusted || !(event.target as HTMLElement)?.closest?.('#saveGold')) return;
  const text = (document.getElementById('goldText') as HTMLTextAreaElement)?.value;
  const confirmed = (document.getElementById('goldSynthetic') as HTMLInputElement)?.checked;
  const encounterId = document.getElementById('editor')?.dataset.encounterId;
  goldGrant = confirmed && text?.trim() && encounterId ? { encounterId, text, expiresAt: Date.now() + 5000 } : null;
}, true);
const observedControls = new Set(['attestPrintedSource', 'extract', 'reviewSource', 'confirmCorrection', 'cancelCorrection', 'draft', 'confirmApproval', 'approve', 'lock', 'patient', 'historyToggle', 'showSuperseded']);
for (const eventType of ['click', 'change']) document.addEventListener(eventType, event => {
  if (!physicalObserving) return;
  const control = (event.target as HTMLElement)?.closest<HTMLElement>('button,input,select')?.id;
  if (!control || !observedControls.has(control)) return;
  ipcRenderer.send('psyrec-observation', {
    control, eventType, trusted: event.isTrusted,
    sourceText: (document.getElementById('sourceText') as HTMLTextAreaElement)?.value ?? '',
    draftText: (document.getElementById('draftText') as HTMLTextAreaElement)?.value ?? '',
    approvalChecked: (document.getElementById('confirmApproval') as HTMLInputElement)?.checked === true,
    patientId: (document.getElementById('patient') as HTMLSelectElement)?.value ?? '',
    encounterId: document.getElementById('editor')?.dataset.encounterId ?? '',
  });
}, true);
contextBridge.exposeInMainWorld('psyrec', {
  call: (method: string, ...args: unknown[]) => {
    if (!allowed.has(method)) throw new Error('Unknown operation.');
    if (method === 'recordHumanGoldTranscription') {
      const grant = goldGrant; goldGrant = null;
      if (!grant || grant.expiresAt < Date.now() || args.length !== 4 || args[0] !== grant.encounterId || args[1] !== grant.text || args[2] !== true) throw new Error('Use the actual Save reference button after confirming the visible synthetic transcription.');
      args[3] = true;
    }
    return ipcRenderer.invoke('psyrec', method, args).then(result => {
      if (method === 'status') physicalObserving = result?.physicalObserverEnabled === true;
      return result;
    });
  },
  onLock: (callback: () => void) => { ipcRenderer.on('locked', () => { goldGrant = null; callback(); }); },
});