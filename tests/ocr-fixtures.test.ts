import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { scoreTranscription } from '../packages/runtime/transcription-scoring.js';
import { loadOcrManifest, fixtureReference, scoreOutput, scoreOcrEvidence, sha256, type OcrFixture } from '../diagnostics/qvac-spike/ocr-score.js';
import { OCR_BITMAP_FIXTURES, renderOcrBitmap, referenceText } from '../diagnostics/qvac-spike/ocr-fixtures/generate-bitmaps.js';

const root = process.cwd();
const fixtureDir = (...parts: string[]) => path.join(root, 'diagnostics/qvac-spike/ocr-fixtures', ...parts);

test('manifest integrity: schema, unique ids, media and split discipline, print source hashes', async () => {
  const manifest = await loadOcrManifest(root); // loadOcrManifest itself enforces schema/ids/media/splits
  assert.equal(manifest.fixtures.length, 5);
  for (const source of manifest.printSources) {
    const bytes = await readFile(fixtureDir(source.file));
    assert.equal(sha256(bytes), source.sha256, `print source ${source.file} hash`);
  }
  for (const fixture of manifest.fixtures) {
    assert.match(fixture.referenceMethod, /\S/);
    for (const rule of fixture.rules) {
      assert.ok(['negation', 'number', 'uncertainty', 'omission', 'hallucination'].includes(rule.category), `${fixture.id}:${rule.id} category`);
      assert.ok(rule.required?.length || rule.forbidden?.length, `${fixture.id}:${rule.id} needs a phrase`);
    }
  }
});

test('printed bitmaps match their recorded sha256 and authored ground truth passes every rule', async () => {
  const manifest = await loadOcrManifest(root);
  const bitmaps = manifest.fixtures.filter(f => f.medium === 'printed-bitmap');
  assert.deepEqual(bitmaps.map(f => f.id), ['syn-ocr-stress-01-bitmap', 'syn-ocr-mask-01-bitmap']);
  for (const fixture of bitmaps) {
    const bytes = await readFile(fixtureDir(fixture.file));
    assert.equal(sha256(bytes), fixture.sha256, `${fixture.id} bitmap hash`);
    assert.equal(fixture.status, 'ready');
    const reference = fixtureReference(fixture);
    assert.ok(reference?.includes('SYNTHETIC') && reference.includes('NOT A REAL PATIENT'));
    const score = scoreTranscription(reference, reference, fixture.rules);
    assert.equal(score.exactTextMatch, true);
    assert.equal(score.wer.rate, 0);
    assert.equal(score.clinical.filter(r => !r.passed).length, 0, `${fixture.id} ground truth must pass its own rules`);
  }
});

test('paper photos are pre-registered awaiting a blinded human transcription', async () => {
  const manifest = await loadOcrManifest(root);
  const photos = manifest.fixtures.filter(f => f.medium === 'paper-photo');
  assert.equal(photos.length, 3);
  for (const fixture of photos) {
    assert.equal(fixture.status, 'awaiting-capture');
    assert.equal(fixture.groundTruth, null);
    assert.equal(fixture.humanTranscription, '');
    assert.equal(fixture.referenceMethod, 'human-transcription-from-paper');
    assert.equal(fixtureReference(fixture), null);
  }
});

test('bitmap rendering is deterministic and matches the manifest hashes and references', async () => {
  const manifest = await loadOcrManifest(root);
  for (const spec of OCR_BITMAP_FIXTURES) {
    const first = renderOcrBitmap(spec), second = renderOcrBitmap(spec);
    assert.equal(sha256(first), sha256(second), `${spec.id} determinism`);
    const entry = manifest.fixtures.find(f => f.medium === 'printed-bitmap' && f.file.endsWith(`${spec.id}.png`));
    assert.ok(entry, `${spec.id} registered`);
    assert.equal(sha256(first), entry.sha256, `${spec.id} manifest hash`);
    assert.equal(referenceText(spec), entry.groundTruth, `${spec.id} reference`);
    const onDisk = await readFile(fixtureDir('bitmaps', `${spec.id}.png`));
    assert.equal(sha256(onDisk), entry.sha256, `${spec.id} on-disk hash`);
  }
});

test('scorer measures a degraded archived output double (deletion, altered dose, recovered hidden line)', async () => {
  const manifest = await loadOcrManifest(root);
  const stress = manifest.fixtures.find(f => f.id === 'syn-ocr-stress-01-bitmap');
  const degraded = stress.groundTruth
    .replace('BLOOD PRESSURE 142/88 MMHG SEATED.\n', '') // deletion of a vital line
    .replace('AMLODIPINE 5 MG ONCE DAILY.', 'AMLODIPINE 50 MG ONCE DAILY.'); // altered dose
  const score = scoreOutput(stress.groundTruth, degraded, stress.rules);
  assert.ok(score.wer.errors > 0 && score.wer.deletions > 0);
  const failed = score.clinical.filter(r => !r.passed).map(r => r.id).sort();
  assert.deepEqual(failed, ['amlodipine-dose-not-altered', 'bp-value', 'medication-name-dose']);

  const mask = manifest.fixtures.find(f => f.id === 'syn-ocr-mask-01-bitmap');
  const recovered = mask.groundTruth.replace('[unclear]', 'DURATION ABOUT TWO WEEKS.');
  const maskScore = scoreOutput(mask.groundTruth, recovered, mask.rules);
  assert.deepEqual(maskScore.clinical.filter(r => !r.passed).map(r => r.id).sort(), ['hidden-line-not-recovered', 'masked-line-abstention']);
});

test('evidence binding rejects non-synthetic, mismatched and incomplete doubles', async () => {
  const manifest = await loadOcrManifest(root);
  const fixture = manifest.fixtures.find(f => f.id === 'syn-ocr-stress-01-bitmap') as OcrFixture;
  const imageBytes = await readFile(fixtureDir(fixture.file));
  const text = 'SYNTHETIC double output';
  const good = { synthetic: true, fixtureId: fixture.id, result: { text, metrics: { request: { attachment: { sha256: sha256(imageBytes), bytes: imageBytes.length } }, output: { sha256: sha256(text), characters: text.length } } } };
  assert.throws(() => scoreOcrEvidence(fixture, imageBytes, { ...good, synthetic: false }), /synthetic/);
  assert.throws(() => scoreOcrEvidence(fixture, imageBytes, { ...good, fixtureId: 'other' }), /does not match/);
  const wrongImage = structuredClone(good); wrongImage.result.metrics.request.attachment.sha256 = sha256('different bytes');
  assert.throws(() => scoreOcrEvidence(fixture, imageBytes, wrongImage), /exact fixture image bytes/);
  const wrongOutput = structuredClone(good); wrongOutput.result.metrics.output.sha256 = sha256('other text');
  assert.throws(() => scoreOcrEvidence(fixture, imageBytes, wrongOutput), /retained raw text/);
  assert.throws(() => scoreOcrEvidence(fixture, imageBytes, good), /Mandatory runtime evidence/); // binding ok, metrics incomplete
});
