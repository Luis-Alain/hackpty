import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { validateWorkflow } from './validate-release.js';

const root = process.cwd();
const require = createRequire(import.meta.url);
const executable = require('electron') as string;
const vault = path.join(root, '.local', 'desktop-workflow', `vault-${randomUUID()}`);
const environment: NodeJS.ProcessEnv = { ...process.env, PSYREC_HOME: vault };
delete environment.ELECTRON_RUN_AS_NODE;
const startedAt = Date.now();
const child = spawn(executable, ['.', '--workflow-evidence'], {
  cwd: root, windowsHide: true, stdio: 'inherit',
  env: environment,
});
const code = await new Promise<number>((resolve, reject) => {
  child.once('error', reject);
  child.once('exit', code => resolve(code ?? 1));
});
if (code !== 0) process.exitCode = code;
else {
  const receipt = JSON.parse(await readFile(path.join(root, '.local', 'desktop-workflow', 'receipt.json'), 'utf8'));
  if (Date.parse(receipt.completedAt) < startedAt) throw new Error('Workflow receipt is stale.');
  console.log(JSON.stringify(validateWorkflow(receipt, false), null, 2));
}
