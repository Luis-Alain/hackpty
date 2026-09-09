import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import type { ModelAsset, VerifiedAsset, Operation } from './types.js';

export async function manifest(projectRoot: string): Promise<{ schemaVersion: 1; sdk: {package: string; version: string}; models: ModelAsset[] }> {
  const value = JSON.parse(await readFile(path.join(projectRoot, 'MODEL-MANIFEST.json'), 'utf8'));
  if (value.schemaVersion !== 1 || !Array.isArray(value.models) || value.sdk?.package !== '@qvac/sdk') throw new Error('Invalid model manifest.');
  return value;
}
export async function sha256File(file: string) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
export function assertWithin(directory: string, file: string) {
  const relative = path.relative(path.resolve(directory), path.resolve(file));
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Runtime path escapes its owned directory.');
}
export async function verifyAsset(asset: ModelAsset, directory: string): Promise<VerifiedAsset> {
  const folder = await realpath(directory);
  const candidate = path.join(folder, asset.filename); assertWithin(folder, candidate);
  const file = await realpath(candidate); assertWithin(folder, file);
  const info = await stat(file);
  if (!info.isFile() || info.size !== asset.expectedBytes) throw new Error(`Model missing or incomplete: ${asset.id}. Run the model provisioning command.`);
  const actualSha256 = await sha256File(file);
  if (actualSha256 !== asset.sha256) throw new Error(`Model checksum mismatch: ${asset.id}. Inference refused.`);
  return {...asset, path: file, actualBytes: info.size, actualSha256, verifiedAt: new Date().toISOString()};
}
export async function verifyModels(projectRoot: string, directory: string, operation: Operation) {
  const data = await manifest(projectRoot);
  const selected = data.models.filter(model => model.role === operation || (operation === 'extract' && model.role === 'projector'));
  if (selected.length !== (operation === 'extract' ? 2 : 1)) throw new Error('Model manifest does not define the exact required model set.');
  const assets: VerifiedAsset[] = [];
  for (const asset of selected) assets.push(await verifyAsset(asset, directory));
  return {assets, sdkVersion: data.sdk.version};
}
