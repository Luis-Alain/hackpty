import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createFoldLaunch, printedFixture, selectFoldAddress } from '../apps/desktop/fold-launch.js';

test('fresh Fold setup creates distinct vault directories and never attests paper or acceptance', async t => {
  const root = await mkdtemp(join(tmpdir(), 'psyrec-fresh-launch-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(dirname(join(root, printedFixture)), { recursive: true });
  await writeFile(join(root, printedFixture), '<p>Explicitly synthetic unit fixture</p>');
  const old = join(root, '.local', 'desktop-workflow', 'physical-fold-1');
  await mkdir(old, { recursive: true });
  await writeFile(join(old, 'psyrec.vault'), 'opaque historical encrypted vault sentinel');
  const at = new Date('2026-09-09T20:00:00.000Z');
  const first = await createFoldLaunch(root, '192.168.1.2', at);
  const second = await createFoldLaunch(root, '192.168.1.2', at);
  assert.notEqual(first.directory, second.directory);
  assert.equal(first.manifest.observedSourceMedium, null);
  assert.equal(first.manifest.syntheticSourceConfirmedByHuman, null);
  assert.equal(first.manifest.physicalAcceptance, false);
  assert.match(first.manifest.fixture.sha256, /^[a-f0-9]{64}$/);
  assert.equal(await readFile(join(old, 'psyrec.vault'), 'utf8'), 'opaque historical encrypted vault sentinel');
  assert.equal(JSON.parse(await readFile(join(first.directory, 'launch.json'), 'utf8')).sessionId, first.manifest.sessionId);
});

test('Fold address selection accepts only an assigned private IPv4 and requires choice when ambiguous', () => {
  assert.equal(selectFoldAddress(undefined, ['192.168.1.2']), '192.168.1.2');
  assert.equal(selectFoldAddress('10.0.0.2', ['192.168.1.2', '10.0.0.2']), '10.0.0.2');
  assert.throws(() => selectFoldAddress(undefined, ['192.168.1.2', '10.0.0.2']), /Choose/);
  assert.throws(() => selectFoldAddress('192.168.1.3', ['192.168.1.2']), /currently assigned/);
  assert.throws(() => selectFoldAddress('8.8.8.8', ['8.8.8.8']), /private/);
});
