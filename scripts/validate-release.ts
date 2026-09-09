import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertCompleteMetrics } from '../packages/runtime/metrics.js';
import type { RunMetrics } from '../packages/runtime/types.js';
import { validateHumanReview } from './validate-human-review.js';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
function requireEvidence(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
type WorkflowRun = { encounterId: string; sourceRevision: number; operation: string; metrics: RunMetrics };
/** Validate the connected workflow, not a collection of unrelated SDK probes. */
export function validateWorkflow(receipt: any, physical = true) {
  requireEvidence(receipt?.schemaVersion === 1 && receipt.syntheticOnly === true, 'Explicit synthetic workflow evidence required.');
  requireEvidence(typeof receipt.completedAt === 'string' && Number.isFinite(Date.parse(receipt.completedAt)), 'Workflow completion timestamp required.');
  requireEvidence(Array.isArray(receipt.steps) && receipt.steps.length > 0 && receipt.steps.every(s => s.passed === true && s.evidence), 'Every recorded workflow step must pass with evidence.');
  const step = (operation: string) => {
    const matches = receipt.steps.filter(s => s.operation === operation);
    requireEvidence(matches.length === 1, `Exactly one ${operation} step required.`);
    return matches[0].evidence;
  };
  for (const operation of ['source-correction-review', 'exact-approval-encrypted-save', 'selected-patient-approved-history', 'lock-renderer-purge', 'encrypted-reload']) step(operation);
  requireEvidence(Array.isArray(receipt.runs) && receipt.runs.length >= 2, 'Connected extraction and drafting run records required.');
  const runIds = new Set<string>();
  for (const run of receipt.runs) {
    requireEvidence(run.status !== 'failed' && typeof run.encounterId === 'string' && run.encounterId.length > 0 && Number.isInteger(run.sourceRevision) && run.sourceRevision > 0, 'Successful workflow run identity and positive source revision required.');
    assertCompleteMetrics(run.metrics);
    requireEvidence(!runIds.has(run.metrics.runId), 'Duplicate workflow run ID.'); runIds.add(run.metrics.runId);
    requireEvidence(run.metrics.sdkVersion === '0.18.2' && run.metrics.runtime.platform === 'win32' && run.metrics.native.backendDevice === 'gpu', 'Workflow must use actual Windows GPU SDK 0.18.2.');
    requireEvidence(run.operation === run.metrics.operation, 'Workflow operation and metrics disagree.');
  }
  const selectRun = (operation: string, stepName: string): WorkflowRun => {
    const matches = receipt.runs.filter((r: WorkflowRun) => r.operation === operation && r.metrics.runId === step(stepName).runId);
    requireEvidence(matches.length === 1, `Unambiguous connected ${operation} run required.`);
    return matches[0];
  };
  const extraction = selectRun('extract', 'real-visionpsy-extraction');
  const draft = selectRun('draft', 'real-bounded-draft');
  requireEvidence(extraction.encounterId === draft.encounterId && typeof draft.encounterId === 'string', 'Extraction and draft must belong to the same encounter.');
  requireEvidence(receipt.source?.extracted && receipt.source?.corrected, 'Actual extracted and corrected source required.');
  requireEvidence(sha256(receipt.source.extracted) === extraction.metrics.output.sha256, 'Extraction output hash mismatch.');
  const correction = step('source-correction-review');
  requireEvidence(correction.correctedText === receipt.source.corrected && correction.correctedSha256 === sha256(receipt.source.corrected) && correction.extractedSha256 === sha256(receipt.source.extracted), 'Source correction step and retained source disagree.');
  requireEvidence(sha256(step('real-bounded-draft').text) === draft.metrics.output.sha256, 'Draft output hash mismatch.');
  requireEvidence(draft.metrics.request.sourceId === `${draft.encounterId}:${draft.sourceRevision}`, 'Draft source locator mismatch.');
  requireEvidence(step('source-correction-review').sourceRevision === draft.sourceRevision, 'Reviewed source and draft revisions differ.');
  const expectedPrompt = `Source reference: ${draft.metrics.request.sourceId}\n\nBEGIN REVIEWED SOURCE\n${receipt.source.corrected}\nEND REVIEWED SOURCE\n\nOrganize this source into a concise draft without adding facts. /no_think`;
  const userPrompts = draft.metrics.request.history.filter(m => m.role === 'user');
  requireEvidence(draft.metrics.request.promptTemplateVersion === 'psyrec-draft-v1' && userPrompts.length === 1 && userPrompts[0].content === expectedPrompt, 'Actual draft prompt must contain exactly the reviewed source in the approved template.');
  requireEvidence(typeof receipt.approval?.exactText === 'string' && receipt.approval.exactText.trim(), 'Exact clinician-approved text required.');
  const approvedHash = sha256(receipt.approval.exactText);
  requireEvidence(approvedHash === receipt.approval.approvedSha256 && approvedHash === receipt.approval.reloadedSha256, 'Approved text changed during encrypted save/reload.');
  requireEvidence(step('exact-approval-encrypted-save').sourceRevision === draft.sourceRevision && step('exact-approval-encrypted-save').approvedSha256 === approvedHash && step('exact-approval-encrypted-save').exactText === receipt.approval.exactText, 'Approval is not bound to the reviewed draft revision and exact text.');
  requireEvidence(receipt.historyIsolation === true && step('selected-patient-approved-history').otherPatientExcluded === true && step('selected-patient-approved-history').selectedPatientRecordVisible === true, 'Selected-patient history isolation evidence required.');
  requireEvidence(receipt.lockPurge?.fields === true && receipt.lockPurge?.content === true && receipt.lockPurge?.images === true, 'Locked renderer must purge private fields, text and images.');
  requireEvidence(['fields', 'content', 'images'].every(key => step('lock-renderer-purge')[key] === receipt.lockPurge[key]), 'Lock purge step and retained result disagree.');
  requireEvidence(step('encrypted-reload').plaintextAbsentFromVaultEnvelope === true && step('encrypted-reload').reloadedSha256 === approvedHash && step('encrypted-reload').identicalToApproved === true, 'Encrypted persistence/reload evidence required.');
  if (physical) {
    requireEvidence(receipt.kind === 'physical-fold-review-workflow' && receipt.physicalFoldAcceptance === true && receipt.clinicianHumanAcceptance === true, 'Physical Fold and human review acceptance remain missing; desktop automation is not a substitute.');
    const capture = step('paired-fold-photo-received');
    requireEvidence(capture.nativeAndroidBuild === true && capture.printedSyntheticEnglishNote === true && capture.certificatePinVerified === true, 'Native Fold printed-note capture and certificate-pinned pairing required.');
    requireEvidence(capture.receipt?.encounterId === draft.encounterId && capture.receipt?.sha256 === extraction.metrics.request.attachment?.sha256 && typeof capture.receipt?.transferId === 'string', 'Durable phone receipt must identify the actual extracted photo and encounter.');
    requireEvidence(capture.encryptedPendingQueue === true && capture.deletedOnlyAfterReceipt === true, 'Encrypted phone queue and receipt-before-deletion evidence required.');
    validateHumanReview(receipt, extraction, draft);
  } else {
    requireEvidence(receipt.kind === 'automated-electron-renderer-import-workflow', 'Expected an actual automated Electron renderer receipt.');
    requireEvidence(step('imported-synthetic-image').sha256 === extraction.metrics.request.attachment?.sha256, 'Imported image and actual VisionPsy attachment differ.');
  }
  return { status: 'passed', scope: physical ? 'Physical Fold through clinician approval and encrypted reload' : 'Automated desktop import workflow only; physical Fold acceptance remains separate', runIds: [extraction.metrics.runId, draft.metrics.runId] };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const desktopOnly = process.argv.includes('--desktop-only');
  const file = process.argv.find(value => value.startsWith('--receipt='))?.slice('--receipt='.length) ?? path.join('artifacts', 'evidence', desktopOnly ? 'desktop-workflow.json' : 'physical-fold-workflow.json');
  try { console.log(JSON.stringify(validateWorkflow(JSON.parse(await readFile(file, 'utf8')), !desktopOnly), null, 2)); }
  catch (error) { console.error(`Workflow acceptance FAILED: ${(error as Error).message}`); process.exitCode = 1; }
}
