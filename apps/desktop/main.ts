import { app, BrowserWindow, dialog, ipcMain, session } from 'electron';
import { readFile, writeFile, mkdir, mkdtemp } from 'node:fs/promises';
import { join, resolve, relative } from 'node:path';
import { networkInterfaces } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Vault } from '../../packages/core/vault.js';
import { PsyRecService } from '../../packages/core/service.js';
import { CaptureServer } from '../../packages/transport/server.js';
import QRCode from 'qrcode';
import { validateRequest, isTrustedUiUrl } from './ipc.js';
import { PhysicalObserver } from './physical-observer.js';

// Keep the isolated UI check off the inference GPU as well as out of QVAC.
if (process.argv.includes('--query-ui-check')) app.disableHardwareAcceleration();
const projectRoot = fileURLToPath(new URL('../../../', import.meta.url));
const uiPath = join(projectRoot, 'apps/desktop/ui/index.html');
const uiUrl = pathToFileURL(uiPath).href;
let window: BrowserWindow;
let service: PsyRecService;
let receiver: CaptureServer;
let runtime: any;
let receiverInfo: any = null;
let physicalObserver: PhysicalObserver | null = null;
let idleTimer: ReturnType<typeof setTimeout>;
let privateDirectory = process.env.PSYREC_HOME ? resolve(process.env.PSYREC_HOME) : join(app.getPath('userData'), 'private');
const sameUiDocument = (url: string) => isTrustedUiUrl(url, uiUrl);
const ownFrame = event => event.senderFrame === window.webContents.mainFrame && sameUiDocument(event.senderFrame.url);
function addresses() { return Object.values(networkInterfaces()).flat().filter(a => a && a.family === 'IPv4' && !a.internal && /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address)).map(a => a!.address); }
let locking: Promise<void> | null = null;
async function lock() {
  if (locking) return locking;
  clearTimeout(idleTimer);
  physicalObserver?.beginLock();
  // Purge visible and hidden renderer data immediately while cancellation drains.
  if (window && !window.isDestroyed()) window.webContents.send('locked');
  locking = (async () => {
    let failure: unknown;
    // Attempt every cleanup stage even when an earlier stage fails.
    for (const cleanup of [
      () => receiver?.stop(),
      () => runtime?.cancelAll?.(),
      () => physicalObserver?.lockPurge().catch(() => { physicalObserver.failed = true; }),
      () => service?.lock(),
    ]) { try { await cleanup(); } catch (error) { failure ??= error; } }
    receiverInfo = null;
    if (failure) throw failure;
  })();
  try { await locking; } finally { locking = null; }
}
function touch() { clearTimeout(idleTimer); idleTimer = setTimeout(() => void lock(), 10 * 60 * 1000); }

async function startDesktop() {
await app.whenReady();
if (process.argv.includes('--query-ui-check')) {
  if (process.argv.some(arg => ['--prepare-fold', '--workflow-evidence', '--workflow-reload-evidence', '--smoke'].includes(arg))) throw new Error('The isolated query check cannot be combined with other desktop modes.');
  await mkdir(join(projectRoot, '.local'), { recursive: true });
  privateDirectory = await mkdtemp(join(projectRoot, '.local', 'query-ui-check-'));
}
await mkdir(privateDirectory, { recursive: true, mode: 0o700 });
if (process.argv.includes('--prepare-fold')) {
  if (!process.env.PSYREC_HOME?.includes('desktop-workflow') || !process.env.PSYREC_FOLD_ADDRESS || !process.env.PSYREC_FOLD_SESSION_ID) throw new Error('Use the fresh Fold session launcher.');
  if (await new Vault(join(privateDirectory, 'psyrec.vault')).exists()) throw new Error('Fresh Fold preparation refuses an existing vault.');
  const launch = JSON.parse(await readFile(join(privateDirectory, 'launch.json'), 'utf8'));
  if (launch.sessionId !== process.env.PSYREC_FOLD_SESSION_ID || launch.address !== process.env.PSYREC_FOLD_ADDRESS || launch.physicalAcceptance !== false) throw new Error('Fresh Fold launch metadata is invalid.');
}
if (process.argv.includes('--query-ui-check')) {
  const testRelative = relative(join(projectRoot, '.local'), privateDirectory);
  if (!/^query-ui-check-[a-zA-Z0-9-]+$/.test(testRelative) || await new Vault(join(privateDirectory, 'psyrec.vault')).exists()) throw new Error('Query UI checks require a fresh dedicated test directory.');
  const { createQueryUiRuntime } = await import('./query-ui-check.js');
  runtime = createQueryUiRuntime();
} else try {
  const module = await import(pathToFileURL(join(projectRoot, 'dist/packages/runtime/index.js')).href);
  runtime = new module.QvacRuntime({ projectRoot });
} catch {
  runtime = { getStatus: () => ({ ready: false, message: 'QVAC runtime is not built yet. No inference is being simulated.' }), extractImage: async () => { throw new Error('QVAC runtime unavailable.'); }, draftFromSource: async () => { throw new Error('QVAC runtime unavailable.'); } };
}
service = new PsyRecService(new Vault(join(privateDirectory, 'psyrec.vault')), runtime);
receiver = new CaptureServer(service, privateDirectory);
window = new BrowserWindow({ width: 1400, height: 940, minWidth: 1050, minHeight: 700, title: 'PsyRec · QVAC Psy', backgroundColor: '#f3f5f5', show: !process.argv.includes('--query-ui-check') && !process.argv.includes('--smoke') && !process.argv.includes('--workflow-evidence'), webPreferences: { offscreen: process.argv.includes('--query-ui-check'), backgroundThrottling: false, preload: join(projectRoot, 'dist/apps/desktop/preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, devTools: !app.isPackaged } });
window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
window.webContents.on('will-navigate', (event, url) => { if (!sameUiDocument(url)) event.preventDefault(); });
session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
session.defaultSession.webRequest.onBeforeRequest((details, callback) => { callback({ cancel: !details.url.startsWith('file:') && !details.url.startsWith('data:') }); });

if (process.argv.includes('--prepare-fold')) physicalObserver = new PhysicalObserver(service, window);
ipcMain.on('psyrec-observation', (event, observation) => {
  if (ownFrame(event)) void physicalObserver?.input(observation).then(() => physicalObserver?.view()).catch(() => { if (physicalObserver) physicalObserver.failed = true; });
});
ipcMain.handle('psyrec', async (event, method: string, args: any[] = []) => {
  if (!ownFrame(event)) throw new Error('Untrusted window.');
  validateRequest(method, args);
  if (locking && !['status', 'lock'].includes(method)) throw new Error('Vault is locking. Wait for local inference cleanup, then unlock.');
  if (!['status', 'snapshot', 'captureData', 'approvedNotes'].includes(method)) touch();
  const result = await dispatch(method, args);
  await physicalObserver?.operation(method, result).catch(() => { physicalObserver.failed = true; });
  return result;
});
async function dispatch(method: string, args: any[]) {
  switch (method) {
    case 'status': return { locked: !service.vault.state, locking: Boolean(locking), physicalObserverEnabled: Boolean(physicalObserver), physicalObservationFailed: physicalObserver?.failed ?? false, exists: await service.vault.exists(), runtime: await runtime.getStatus?.(), addresses: addresses(), receiver: receiverInfo };
    case 'unlock': await service.vault.unlock(args[0], args[1] === true); return service.snapshot();
    case 'lock': await lock(); return;
    case 'snapshot': return service.snapshot();
    case 'addPatient': return service.addPatient(args[0]);
    case 'addEncounter': return service.addEncounter(args[0]);
    case 'captureData': return service.captureData(args[0]);
    case 'import': {
      const result = await dialog.showOpenDialog(window, { properties: ['openFile'], filters: [{ name: 'Synthetic printed note', extensions: ['png', 'jpg', 'jpeg'] }] });
      if (result.canceled) return null;
      return service.importImage(args[0], await readFile(result.filePaths[0]));
    }
    case 'extract': return service.extract(args[0]);
    case 'previewSourceChange': return service.previewSourceChange(args[0], args[1]);
    case 'reviewSource': return service.reviewSource(args[0], args[1], args[2]);
    case 'generateDraft': return service.generateDraft(args[0]);
    case 'approve': return service.approve(args[0], args[1], args[2], args[3]);
    case 'approvedNotes': return service.approvedNotes(args[0], args[1]);
    case 'queryApprovedNotes': return service.queryApprovedNotes(args[0], args[1]);
    case 'resolveQueryCitation': return service.resolveQueryCitation(args[0], args[1], args[2]);
    case 'recordHumanGoldTranscription': return service.recordHumanGoldTranscription(args[0], args[1], args[2], args[3]);
    case 'revokeDevice': return service.revokeDevice(args[0]);
    case 'pair': {
      if (!addresses().includes(args[1])) throw new Error('Select this PC’s private LAN address.');
      if (!receiverInfo) receiverInfo = await receiver.start(args[1]);
      if (receiverInfo.endpoint !== `https://${args[1]}:9443`) throw new Error('Lock and unlock the vault before switching networks.');
      const invite = service.startPairing(args[0], receiverInfo.endpoint, receiverInfo.certificateFingerprint);
      return { ...invite, qr: await QRCode.toDataURL(JSON.stringify(invite), { width: 320, margin: 2 }) };
    }
    case 'exportPhysicalCandidate': {
      if (!physicalObserver || !process.env.PSYREC_FOLD_SESSION_ID || args[1] !== true) throw new Error('Confirm this fresh physical-session vault contains reviewed synthetic data only.');
      const sessionGeneration = service.generation;
      const checkpoint = await physicalObserver.checkpoint();
      const output = await dialog.showSaveDialog(window, { defaultPath: 'psyrec-' + process.env.PSYREC_FOLD_SESSION_ID + '-candidate.json', filters: [{ name: 'Reviewed synthetic workflow candidate', extensions: ['json'] }] });
      if (output.canceled || !output.filePath) return null;
      const finalCheckpoint = await physicalObserver.checkpoint();
      if (sessionGeneration !== service.generation || checkpoint.generation !== finalCheckpoint.generation || !service.vault.state) throw new Error('Vault session changed during export. Unlock and repeat the review export.');
      await service.queue;
      const { buildPhysicalCandidate } = await import('./physical-candidate.js');
      const candidate = buildPhysicalCandidate(structuredClone(service.state()), {
        encounterId: args[0], sessionId: process.env.PSYREC_FOLD_SESSION_ID, observerFailed: physicalObserver.failed,
        vaultEnvelope: await readFile(service.vault.path, 'utf8'), reviewedSynthetic: true,
      });
      if (sessionGeneration !== service.generation || !service.vault.state) throw new Error('Vault session changed before export. No candidate was written.');
      await writeFile(output.filePath, JSON.stringify(candidate, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
      return { saved: true, reviewFailures: candidate.reviewPreview.failures.length, accepted: false };
    }

    case 'exportEvidence': {
      if (args[0] !== true) throw new Error('Confirm this vault contains synthetic demo data only.');
      const runs = service.state().runs ?? [];
      if (!runs.length) throw new Error('No completed inference runs to export.');
      const module = await import(pathToFileURL(join(projectRoot, 'dist/packages/runtime/index.js')).href);
      for (const run of runs) {
        if (run.status === 'failed') throw new Error('This vault contains failed runs with incomplete evidence. Review the encrypted ledger; these cannot pass the success export gate.');
        module.assertCompleteMetrics(run.metrics);
      }
      const output = await dialog.showSaveDialog(window, { defaultPath: 'psyrec-synthetic-runs.jsonl', filters: [{ name: 'JSON Lines', extensions: ['jsonl'] }] });
      if (output.canceled || !output.filePath) return null;
      await writeFile(output.filePath, runs.map(r => JSON.stringify(r)).join('\n') + '\n', { mode: 0o600 });
      return { count: runs.length };
    }
    default: throw new Error('Unknown operation.');
  }
}
await window.loadFile(uiPath);
app.on('window-all-closed', () => { void lock().finally(() => app.quit()); });
if (process.argv.includes('--prepare-fold')) {
  if (!process.env.PSYREC_HOME?.includes('desktop-workflow') || !process.env.PSYREC_FOLD_ADDRESS) throw new Error('Dedicated synthetic Fold vault and private LAN address required.');
  const { prepareFoldSession } = await import('./fold-session.js');
  const prepared = await prepareFoldSession(window, process.env.PSYREC_FOLD_ADDRESS);
  await service.recordPhysicalObservation('session-prepared', { ...prepared, sessionId: process.env.PSYREC_FOLD_SESSION_ID });
  console.log(JSON.stringify(prepared));
}
if (process.argv.includes('--query-ui-check')) {
  const { runQueryUiCheck } = await import('./query-ui-check.js');
  const summary = await runQueryUiCheck(window, service, projectRoot, privateDirectory); console.log(JSON.stringify({ ...summary, privateTestDirectory: privateDirectory }));
  await lock(); app.quit();
}
if (process.argv.includes('--workflow-reload-evidence')) {
  const { captureReloadEvidence } = await import('./workflow-evidence.js');
  console.log(JSON.stringify(await captureReloadEvidence(window, projectRoot, privateDirectory)));
  await lock(); app.quit();
}
if (process.argv.includes('--workflow-evidence')) {
  const { runWorkflowEvidence } = await import('./workflow-evidence.js');
  let evidence;
  try { evidence = await runWorkflowEvidence(window, projectRoot, privateDirectory); }
  catch (error) { await writeFile(join(projectRoot, '.local/desktop-workflow/failed.png'), (await window.webContents.capturePage()).toPNG()); throw error; }
  console.log(JSON.stringify(evidence)); await lock(); app.quit();
}
if (process.argv.includes('--smoke')) {
  await new Promise(resolve => setTimeout(resolve, 1000));
  const path = join(projectRoot, '.local/desktop-smoke.png');
  await mkdir(join(projectRoot, '.local'), { recursive: true });
  await writeFile(path, (await window.webContents.capturePage()).toPNG());
  console.log(JSON.stringify({ screenshot: path, title: await window.webContents.executeJavaScript('document.title'), controls: await window.webContents.executeJavaScript('document.querySelectorAll("button").length') }));
  app.quit();
}
}
void startDesktop().catch(async error => {
  console.error('PsyRec startup failed:', error.message);
  try { await lock(); } finally { app.exit(1); }
});
