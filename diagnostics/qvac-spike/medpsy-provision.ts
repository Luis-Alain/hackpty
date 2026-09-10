import { createWriteStream } from 'node:fs';
import { mkdir, stat, rename, rm, writeFile, readFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { verifyAsset, assertWithin, sha256File } from '../../packages/runtime/models.js';

// Cell A step A1: hash-verified provisioning of MedPsy-1.7B Q4_K_M imatrix into the
// shared verified model directory, plus the isolated evaluation manifest. The
// production MODEL-MANIFEST.json is never modified. No inference is performed.
const require = createRequire(import.meta.url);
const registry = require('@qvac/sdk').HEALTHCARE_1_7B_MEDICAL_Q4_K_M;

const asset = {
  constant: 'HEALTHCARE_1_7B_MEDICAL_Q4_K_M',
  filename: 'medpsy-1.7b-q4_k_m-imat.gguf',
  url: 'https://huggingface.co/qvac/MedPsy-1.7B-GGUF/resolve/fd4cecc90c2de8dce4b112795456a54be9c59363/medpsy-1.7b-q4_k_m-imat.gguf',
  expectedBytes: 1282439360,
  sha256: '41ee947d9cce72ec657577219fd1798fabeabf0d832217fe23c9d6d3d18d5880',
  modelType: 'llamacpp-completion' as const,
  license: 'Apache-2.0',
  modelCard: 'https://huggingface.co/qvac/MedPsy-1.7B-GGUF/blob/fd4cecc90c2de8dce4b112795456a54be9c59363/README.md'
};
if (registry.expectedSize !== asset.expectedBytes || registry.sha256Checksum !== asset.sha256 || registry.modelId !== asset.filename || registry.engine !== asset.modelType) {
  throw new Error('Pinned MedPsy asset does not match the installed SDK 0.18.2 registry constant HEALTHCARE_1_7B_MEDICAL_Q4_K_M.');
}

const projectRoot = path.resolve(process.cwd());
const directory = path.join(projectRoot, '.local', 'models');
const isolatedRoot = path.join(projectRoot, '.local', 'medpsy-eval');
const evidenceDirectory = path.join(projectRoot, 'artifacts', 'evidence');
await mkdir(directory, {recursive: true});
await mkdir(isolatedRoot, {recursive: true});
await mkdir(evidenceDirectory, {recursive: true});

const startedAt = new Date().toISOString();
const destination = path.join(directory, asset.filename);
let verified;
try {
  verified = await verifyAsset({id: 'medpsy-1.7b-q4_k_m-imat-review', role: 'review', ...asset}, directory);
  console.log('Verified cached medpsy-1.7b-q4_k_m-imat');
} catch {
  const partial = `${destination}.part`; assertWithin(directory, partial);
  let offset = await stat(partial).then(value => value.size).catch(() => 0);
  if (offset >= asset.expectedBytes) { await rm(partial, {force: true}); offset = 0; }
  console.log(`Downloading medpsy-1.7b-q4_k_m-imat: ${offset}/${asset.expectedBytes} bytes`);
  const response = await fetch(asset.url, {headers: offset ? {Range: `bytes=${offset}-`, 'Accept-Encoding': 'identity'} : {'Accept-Encoding': 'identity'}, signal: AbortSignal.timeout(900000)});
  if (!response.ok || !response.body) throw new Error(`Model download failed: HTTP ${response.status}`);
  const append = offset > 0 && response.status === 206;
  if (!append) offset = 0;
  let received = offset, lastReport = Date.now();
  const readable = Readable.fromWeb(response.body as any);
  readable.on('data', chunk => { received += chunk.length; if (Date.now() - lastReport > 15000) { lastReport = Date.now(); console.log(`medpsy-1.7b-q4_k_m-imat: ${Math.round(100 * received / asset.expectedBytes)}% (${received} bytes)`); } });
  await pipeline(readable, createWriteStream(partial, {flags: append ? 'a' : 'w', mode: 0o600}));
  // Do not move unverified bytes into the final filename.
  if ((await stat(partial)).size !== asset.expectedBytes || await sha256File(partial) !== asset.sha256) throw new Error('Integrity check failed for medpsy-1.7b-q4_k_m-imat; partial retained for diagnosis.');
  await rename(partial, destination);
  verified = await verifyAsset({id: 'medpsy-1.7b-q4_k_m-imat-review', role: 'review', ...asset}, directory);
  console.log('SHA-256 verified medpsy-1.7b-q4_k_m-imat');
}

const production = JSON.parse(await readFile(path.join(projectRoot, 'MODEL-MANIFEST.json'), 'utf8'));
const visionPair = production.models.filter((model: any) => model.role === 'extract' || model.role === 'projector');
if (visionPair.length !== 2) throw new Error('Production manifest does not carry the exact VisionPsy pair.');
const isolatedManifest = {
  schemaVersion: 1,
  sdk: {package: '@qvac/sdk', version: '0.18.2', reason: 'Shared team runtime compatibility with upstream commit 21f7f40736c201f8d3c14a36ced4cdb426639122'},
  inferencePolicy: 'Local absolute verified files only. No registry, HTTP, delegation, RAG, or audio during inference.',
  models: [
    {id: 'medpsy-1.7b-q4_k_m-imat-review', role: 'review', ...asset},
    {id: 'medpsy-1.7b-q4_k_m-imat-draft', role: 'draft', ...asset},
    ...visionPair
  ]
};
await writeFile(path.join(isolatedRoot, 'MODEL-MANIFEST.json'), JSON.stringify(isolatedManifest, null, 2) + '\n');
console.log('Isolated evaluation manifest written to .local/medpsy-eval/MODEL-MANIFEST.json');

const receipt = {
  schemaVersion: 1,
  kind: 'medpsy-1.7b-provisioning',
  status: 'verified',
  startedAt,
  verifiedAt: verified.verifiedAt,
  asset: {id: 'medpsy-1.7b-q4_k_m-imat-review', roles: ['review', 'draft'], ...asset, actualBytes: verified.actualBytes, actualSha256: verified.actualSha256},
  installedSdkRegistryHashMatched: true,
  productionModelChanged: false,
  inferenceRuns: 0,
  method: 'Public publisher immutable revision download, exact size and SHA-256 verified against installed SDK 0.18.2 registry; no model loaded.'
};
await writeFile(path.join(evidenceDirectory, 'medpsy-1.7b-provisioning.json'), JSON.stringify(receipt, null, 2), {flag: 'wx'});
console.log('Provisioning receipt written. No inference performed by provisioning.');
