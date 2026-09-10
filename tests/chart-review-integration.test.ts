import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { Vault } from '../packages/core/vault.js';
import { PsyRecService } from '../packages/core/service.js';
import { QvacRuntime, assertCompleteMetrics } from '../packages/runtime/index.js';
import { withGpuLease } from '../diagnostics/qvac-spike/gpu-lease.js';

// REAL-RUNTIME INTEGRATION CHECK — Cell A only. This loads the provisioned review model on the PC GPU.
// Never enable it from Cells B/C, inside npm test, or concurrently with another GPU job.
// Run it exactly as documented in .local/cells/C/INTEGRATION-READY.md:
//   PSYREC_CHART_REVIEW_INTEGRATION=1 node --test .local/cells/A/dist/tests/chart-review-integration.test.js
// from the repository root. Without the env flag the test skips and performs no inference.
const enabled = process.env.PSYREC_CHART_REVIEW_INTEGRATION === '1';
const evidencePath = process.env.PSYREC_CHART_REVIEW_EVIDENCE
  ?? join('.local', 'cells', 'A', 'chart-review-integration-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json');

const HISTORICAL = '2026-08-20\nSYNTHETIC integration prior visit: sleep poor, dose documented. NOT A REAL PATIENT.';
const CURRENT = '2026-09-09\nSYNTHETIC integration current visit: sleep improved, exercise added. NOT A REAL PATIENT.';

test('chart review end-to-end with the real QvacRuntime (Cell A GPU check)', { skip: !enabled, timeout: 600000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'psyrec-chart-integration-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const vault = new Vault(join(directory, 'integration.vault'));
  await vault.unlock('synthetic-integration-passphrase', true); // fresh synthetic vault; never opens an existing one
  const runtime = new QvacRuntime({ projectRoot: process.cwd() });
  t.after(() => runtime.close());
  const status = await runtime.getStatus();
  assert.ok(status.models.every(model => model.present), 'Provision every manifest model first: ' + JSON.stringify(status.models.map(model => ({ id: model.id, present: model.present }))));
  const service = new PsyRecService(vault, runtime);
  const { result, lease } = await withGpuLease(async () => {
    const patient = await service.addPatient('SYNTHETIC INTEGRATION — NOT A REAL PATIENT');
    const historyEncounter = await service.addEncounter(patient.id);
    await service.reviewSource(historyEncounter.id, HISTORICAL);
    const draft = await service.generateDraft(historyEncounter.id); // real draft-model inference
    await service.approve(historyEncounter.id, draft.id, draft.sourceRevision, HISTORICAL);
    const current = await service.addEncounter(patient.id);
    await service.reviewSource(current.id, CURRENT);
    return service.reviewChart(patient.id, current.id); // real review-model inference
  });
  assert.equal(result.validation.schemaValid, true);
  assert.equal(result.validation.evidenceIdsAuthorized, true);
  assert.ok(!('testDouble' in result.metrics), 'This check must run the real runtime, never a double.');
  if (!('testDouble' in result.metrics)) {
    assertCompleteMetrics(result.metrics);
    assert.equal(result.metrics.operation, 'review');
    assert.equal(result.metrics.output.sha256, (await import('node:crypto')).createHash('sha256').update(result.raw).digest('hex'));
  }
  assert.equal(result.coverage.historicalRecordsAvailable, 1);
  assert.equal(result.coverage.historicalRecordsSupplied, 1);
  assert.deepEqual(result.coverage.dateRange, { from: '2026-08-20', to: '2026-08-20' });
  assert.equal(service.state().chartReviews.at(-1)?.status, 'answered');
  await mkdir(dirname(evidencePath), { recursive: true });
  await writeFile(evidencePath, JSON.stringify({
    schemaVersion: 1, kind: 'chart-review-real-runtime-integration', synthetic: true, notARealPatient: true,
    completedAt: new Date().toISOString(), modelIdentity: result.modelIdentity, gpuLease: lease,
    coverage: result.coverage, output: result.output, validation: result.validation, metrics: result.metrics,
  }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  t.diagnostic('Integration evidence written to ' + evidencePath);
});
