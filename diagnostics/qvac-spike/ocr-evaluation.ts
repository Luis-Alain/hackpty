import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { QvacRuntime, RuntimeEvidenceError, assertCompleteMetrics } from '../../packages/runtime/index.js';
import { withGpuLease } from './gpu-lease.js';
import { sha256, loadOcrManifest, fixtureReference, mimeForFixture } from './ocr-score.js';

/**
 * OCR evaluation RUNNER. Executed ONLY by Cell A (the GPU cell) under the GPU
 * lease; Cells B and C must never run this file. It runs VisionPsy extraction
 * over the manifest fixtures that already have a scoring reference (authored
 * ground truth for printed bitmaps, or a saved blinded human transcription for
 * paper photos), retains complete RunMetrics and writes one evidence file per
 * fixture plus a summary. Existing evidence is never overwritten (flag 'wx');
 * failures are recorded as failure evidence, not deleted.
 *
 * Usage: node ocr-evaluation.js <run-id>   (run-id: [a-zA-Z0-9-]+, new per run)
 * Outputs: artifacts/evidence/ocr-<run-id>-<fixtureId>.json
 *          artifacts/evidence/ocr-<run-id>-<fixtureId>-failure.json (on failure)
 *          artifacts/evidence/ocr-<run-id>-summary.json
 */
export async function runOcrEvaluation(runId: string, root = process.cwd()) {
  if (!/^[a-zA-Z0-9-]+$/.test(runId)) throw new Error('Use a plain run id: [a-zA-Z0-9-]+.');
  const evidenceDir = path.join(root, 'artifacts/evidence');
  const prior = (await readdir(evidenceDir).catch(() => [] as string[])).filter(name => name.startsWith(`ocr-${runId}-`));
  if (prior.length) throw new Error(`Run id ${runId} already has archived evidence (${prior.join(', ')}). Evidence is never overwritten or rescored in place; choose a new run id.`);
  const manifest = await loadOcrManifest(root);
  await mkdir(evidenceDir, { recursive: true });
  const runnable = [];
  for (const fixture of manifest.fixtures) {
    if (fixture.status !== 'ready') continue;
    const reference = fixtureReference(fixture);
    if (!reference) continue;
    const file = path.join(root, 'diagnostics/qvac-spike/ocr-fixtures', fixture.file);
    const bytes = await readFile(file);
    if (fixture.sha256 && sha256(bytes) !== fixture.sha256) throw new Error(`Fixture ${fixture.id} differs from its manifest sha256; refusing to evaluate.`);
    runnable.push({ fixture, reference, bytes });
  }
  if (!runnable.length) throw new Error('No manifest fixture is ready with a scoring reference.');
  const outcomes: Record<string, unknown>[] = [];
  const { result: leaseOutcomes, lease } = await withGpuLease(async signal => {
    const runtime = new QvacRuntime({ projectRoot: root });
    try {
      for (const { fixture, reference, bytes } of runnable) {
        const base = { schemaVersion: 1, synthetic: true, purpose: 'OCR evaluation run over a registered synthetic fixture; not release acceptance by itself', runId, fixtureId: fixture.id, noteId: fixture.noteId, medium: fixture.medium, split: fixture.split, referenceMethod: fixture.referenceMethod, referenceSha256: sha256(reference), imageSha256: sha256(bytes), imageBytes: bytes.length };
        try {
          const result = await runtime.extractImage({ bytes, mime: mimeForFixture(fixture), signal });
          assertCompleteMetrics(result.metrics);
          const file = path.join(evidenceDir, `ocr-${runId}-${fixture.id}.json`);
          await writeFile(file, JSON.stringify({ ...base, result }, null, 2), { flag: 'wx' });
          outcomes.push({ fixtureId: fixture.id, status: 'metrics-accepted-quality-review-required', runId: result.metrics.runId });
          console.log(JSON.stringify(outcomes.at(-1)));
        } catch (error) {
          const failure = error instanceof RuntimeEvidenceError ? error.evidence : { error: String(error) };
          const file = path.join(evidenceDir, `ocr-${runId}-${fixture.id}-failure.json`);
          await writeFile(file, JSON.stringify({ ...base, failure }, null, 2), { flag: 'wx' });
          outcomes.push({ fixtureId: fixture.id, status: 'failed' });
          process.exitCode = 1;
        }
      }
    } finally { await runtime.close(); }
    return outcomes;
  });
  const temporaryFilesRemaining = await readdir(path.join(root, '.local/runtime-tmp')).catch(() => []);
  assert.deepEqual(temporaryFilesRemaining, []);
  const summary = { schemaVersion: 1, synthetic: true, checkedAt: new Date().toISOString(), runId, scope: 'OCR extraction runs over registered synthetic fixtures with complete native metrics. Scoring is a separate offline step (ocr-score.ts). Not physical workflow acceptance.', fixtures: runnable.map(r => ({ fixtureId: r.fixture.id, medium: r.fixture.medium, split: r.fixture.split, imageSha256: sha256(r.bytes) })), outcomes: leaseOutcomes, lease, temporaryFilesRemaining };
  const summaryFile = path.join(evidenceDir, `ocr-${runId}-summary.json`);
  await writeFile(summaryFile, JSON.stringify(summary, null, 2), { flag: 'wx' });
  console.log(JSON.stringify({ summary: path.relative(root, summaryFile), outcomes: leaseOutcomes }));
  return summary;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const runId = process.argv[2];
  if (!runId) throw new Error('Usage: node ocr-evaluation.js <run-id>');
  await runOcrEvaluation(runId);
}
