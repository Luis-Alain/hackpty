import { createWriteStream } from 'node:fs';
import { mkdir, stat, rename, rm, writeFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { manifest, verifyAsset, assertWithin } from '../../packages/runtime/models.js';

const projectRoot = path.resolve(process.cwd());
const directory = path.join(projectRoot, '.local', 'models');
const evidenceDirectory = path.join(projectRoot, 'artifacts', 'evidence');
await mkdir(directory, {recursive: true});
await mkdir(evidenceDirectory, {recursive: true});
const modelManifest = await manifest(projectRoot);
const startedAt = new Date().toISOString();
const assets: unknown[] = [];
for (const asset of modelManifest.models) {
  const destination = path.join(directory, asset.filename);
  try { const verified = await verifyAsset(asset, directory); assets.push(verified); console.log(`Verified cached ${asset.id}`); continue; } catch {}
  const partial = `${destination}.part`; assertWithin(directory, partial);
  let offset = await stat(partial).then(value => value.size).catch(() => 0);
  if (offset >= asset.expectedBytes) { await rm(partial, {force: true}); offset = 0; }
  console.log(`Downloading ${asset.id}: ${offset}/${asset.expectedBytes} bytes`);
  const response = await fetch(asset.url, {headers: offset ? {Range: `bytes=${offset}-`, 'Accept-Encoding':'identity'} : {'Accept-Encoding':'identity'}, signal: AbortSignal.timeout(900000)});
  if (!response.ok || !response.body) throw new Error(`Model download failed: ${asset.id}: HTTP ${response.status}`);
  const append = offset > 0 && response.status === 206;
  if (!append) offset = 0;
  let received = offset, lastReport = Date.now();
  const readable = Readable.fromWeb(response.body as any);
  readable.on('data', chunk => { received += chunk.length; if (Date.now() - lastReport > 15000) { lastReport = Date.now(); console.log(`${asset.id}: ${Math.round(100 * received / asset.expectedBytes)}% (${received} bytes)`); } });
  await pipeline(readable, createWriteStream(partial, {flags: append ? 'a' : 'w', mode: 0o600}));
  // Do not move unverified bytes into the final filename.
  const {sha256File} = await import('../../packages/runtime/models.js');
  if ((await stat(partial)).size !== asset.expectedBytes || await sha256File(partial) !== asset.sha256) throw new Error(`Integrity check failed for ${asset.id}; partial retained for diagnosis.`);
  await rename(partial, destination);
  assets.push(await verifyAsset(asset, directory));
  console.log(`SHA-256 verified ${asset.id}`);
}
await writeFile(path.join(evidenceDirectory, 'model-provisioning.json'), JSON.stringify({schemaVersion:1, status:'verified', startedAt, endedAt:new Date().toISOString(), assets}, null, 2));
console.log('All pinned model files verified. No inference performed by provisioning.');
