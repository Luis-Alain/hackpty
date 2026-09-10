import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, stat, rename, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const directory = fileURLToPath(new URL('../assets/models/', import.meta.url));
const filename = 'Qwen3-0.6B-Q4_0.gguf';
const expectedSize = 382156480;
const expectedSha256 = '33bcc57074ec7b6eada5a90651ee546ec0c2b271002c22baf9f1b2dd1e8f75cb';
const url = 'https://huggingface.co/unsloth/Qwen3-0.6B-GGUF/resolve/50968a4468ef4233ed78cd7c3de230dd1d61a56b/Qwen3-0.6B-Q4_0.gguf';
const target = join(directory, filename);
async function verified(path) {
  try {
    if ((await stat(path)).size !== expectedSize) return false;
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(path)) hash.update(chunk);
    return hash.digest('hex') === expectedSha256;
  } catch { return false; }
}
await mkdir(directory, { recursive: true });
if (await verified(target)) {
  console.log(JSON.stringify({ model: filename, bytes: expectedSize, sha256: expectedSha256, alreadyVerified: true }));
} else {
  const temporary = join(directory, filename + '.' + randomUUID() + '.partial');
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(15 * 60 * 1000) });
    if (!response.ok || !response.body) throw new Error('Public model download failed: HTTP ' + response.status);
    let bytes = 0;
    const hash = createHash('sha256');
    const limit = new Transform({ transform(chunk, encoding, callback) {
      bytes += chunk.length;
      if (bytes > expectedSize) return callback(new Error('Public model exceeded its pinned size.'));
      hash.update(chunk); callback(null, chunk);
    } });
    await pipeline(Readable.fromWeb(response.body), limit, createWriteStream(temporary, { flags: 'wx' }));
    if (bytes !== expectedSize || hash.digest('hex') !== expectedSha256) throw new Error('Public model size/checksum mismatch.');
    await rename(temporary, target);
    console.log(JSON.stringify({ model: filename, bytes, sha256: expectedSha256, downloaded: true, license: 'Apache-2.0', sdkRegistry: '0.18.2' }));
  } finally {
    // Only our uniquely named partial download is eligible for removal.
    if (dirname(temporary) === directory.replace(/[\\/]$/, '')) await rm(temporary, { force: true });
  }
}
