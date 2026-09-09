import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';

const projectRoot = fileURLToPath(new URL('../../../', import.meta.url));
export const printedFixture = 'diagnostics/qvac-spike/fixtures/print-synthetic-note.html';

export function selectFoldAddress(requested: string | undefined, available: string[]) {
  const unique = [...new Set(available)].filter(address => /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(address));
  if (requested && unique.includes(requested)) return requested;
  if (requested) throw new Error('Choose an IPv4 address currently assigned to this PC on private Wi-Fi.');
  if (unique.length === 1) return unique[0];
  throw new Error('Choose this PC’s private Wi-Fi address with --address=<IPv4>. Run --check to list available addresses.');
}

export async function createFoldLaunch(root: string, address: string, createdAt = new Date()) {
  const fixtureBytes = await readFile(join(root, printedFixture));
  const parent = join(root, '.local', 'desktop-workflow');
  await mkdir(parent, { recursive: true });
  const stamp = createdAt.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const directory = await mkdtemp(join(parent, 'physical-printed-' + stamp + '-'));
  const sessionId = directory.slice(parent.length + 1);
  const manifest = {
    schemaVersion: 1, sessionId, createdAt: createdAt.toISOString(), address,
    fixture: { id: 'DEMO-001', path: printedFixture, sha256: createHash('sha256').update(fixtureBytes).digest('hex'), language: 'English', intendedMedium: 'paper' },
    observedSourceMedium: null, syntheticSourceConfirmedByHuman: null, physicalAcceptance: false,
    evidenceState: 'prepared-only; physical observation and human review are pending',
  };
  await writeFile(join(directory, 'launch.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  return { directory, manifest };
}

async function checkPort(address: string) {
  const server = createServer();
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(9443, address, () => resolve()); });
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

async function main() {
  if (process.argv.includes('--help')) {
    console.log('Prepare a NEW synthetic Fold session: --check | [--address=<private Wi-Fi IPv4>]. Enter a new passphrase in PsyRec. Existing vaults are never opened. No inference or clinical approval is automated.');
    return;
  }
  const available = Object.values(networkInterfaces()).flat().filter(a => a && a.family === 'IPv4' && !a.internal).map(a => a!.address).filter(a => /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a));
  const requested = process.argv.find(arg => arg.startsWith('--address='))?.slice('--address='.length) ?? process.env.PSYREC_FOLD_ADDRESS;
  const executable = join(projectRoot, 'node_modules', 'electron', 'dist', process.platform === 'win32' ? 'electron.exe' : process.platform === 'darwin' ? 'Electron.app/Contents/MacOS/Electron' : 'electron');
  const readiness = { availablePrivateIpv4: available, electronAvailable: existsSync(executable), desktopBuilt: existsSync(join(projectRoot, 'dist/apps/desktop/main.js')), printedFixtureAvailable: existsSync(join(projectRoot, printedFixture)), inferenceStarted: false, physicalAcceptance: false };
  if (process.argv.includes('--check')) { console.log(JSON.stringify(readiness, null, 2)); return; }
  if (!readiness.electronAvailable || !readiness.desktopBuilt || !readiness.printedFixtureAvailable) throw new Error('Desktop build, Electron executable or printable fixture is missing. Run the documented installation/build steps.');
  const address = selectFoldAddress(requested, available);
  try { await checkPort(address); } catch { throw new Error('The receiver port is unavailable. Lock or close the previous PsyRec window before starting this fresh session.'); }
  const launch = await createFoldLaunch(projectRoot, address);
  console.log(JSON.stringify({ sessionId: launch.manifest.sessionId, privateDirectory: launch.directory, evidenceState: launch.manifest.evidenceState, instruction: 'Create the new vault using your passphrase in the PsyRec window. Photograph the printed DEMO-001 page when ready.' }, null, 2));
  const environment: NodeJS.ProcessEnv = { ...process.env, PSYREC_HOME: launch.directory, PSYREC_FOLD_ADDRESS: address, PSYREC_FOLD_SESSION_ID: launch.manifest.sessionId };
  delete environment.ELECTRON_RUN_AS_NODE;
  const child = spawn(executable, [projectRoot, '--prepare-fold'], { cwd: projectRoot, env: environment, stdio: 'inherit', windowsHide: false });
  child.on('error', error => { console.error(error.message); process.exitCode = 1; });
  child.on('exit', code => { process.exitCode = code ?? 1; });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) void main().catch(error => { console.error(error.message); process.exitCode = 1; });
