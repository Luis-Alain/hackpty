import { contextBridge, ipcRenderer } from 'electron';
const allowed = new Set(['status', 'unlock', 'lock', 'snapshot', 'addPatient', 'addEncounter', 'captureData', 'import', 'extract', 'previewSourceChange', 'reviewSource', 'generateDraft', 'approve', 'approvedNotes', 'revokeDevice', 'pair', 'exportEvidence']);
contextBridge.exposeInMainWorld('psyrec', {
  call: (method: string, ...args: unknown[]) => { if (!allowed.has(method)) throw new Error('Unknown operation.'); return ipcRenderer.invoke('psyrec', method, args); },
  onLock: (callback: () => void) => { ipcRenderer.on('locked', () => callback()); },
});
