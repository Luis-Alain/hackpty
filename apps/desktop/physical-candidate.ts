import { createHash } from 'node:crypto';
import type { VaultState } from '../../packages/core/types.js';
import { assertCompleteMetrics } from '../../packages/runtime/metrics.js';
import { validateHumanReview, validatePaperSource } from '../../scripts/validate-human-review.js';
import { validatePhoneLifecycle } from '../../scripts/validate-phone-lifecycle.js';
import { validateWorkflow } from '../../scripts/validate-release.js';

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');


const pick = (value: any, names: string[]) => Object.fromEntries(names.filter(name => value?.[name] !== undefined).map(name => [name, value[name]]));
const recordFields = ['id', 'patientId', 'encounterId', 'sourceRevision', 'sourceText', 'text', 'draftId', 'modelDraftText', 'clinicianEdited', 'approvedAt', 'supersededAt', 'context', 'extractionMetrics', 'draftingMetrics'];
function syntheticObservations(state: VaultState) {
  return (state.physicalObservations ?? []).flatMap(event => {
    const d = event.details as any;
    let details: any;
    if (event.event === 'renderer-input') details = pick(d, ['control', 'eventType', 'trusted', 'sourceText', 'draftText', 'approvalChecked', 'patientId', 'encounterId', 'captureId', 'sha256']);
    else if (event.event === 'renderer-view') details = { ...pick(d, ['patientId', 'encounterStatus', 'historyText', 'historyVisible', 'approvedText', 'approvedReadOnly']), canonicalApprovedRecords: d.canonicalApprovedRecords?.map(r => pick(r, ['id', 'encounterId', 'text'])) };
    else if (event.event === 'lock-renderer-purge') details = pick(d, ['workspaceHidden', 'fields', 'content', 'images']);
    else if (event.event === 'printed-source-attestation') details = pick(d, ['actor', 'method', 'fixtureId', 'sourceMedium', 'observedAt', 'patientId', 'encounterId', 'captureId', 'sha256']);
    else if (event.event === 'operation-completed') {
      if (d.method === 'unlock') details = { method: d.method, result: { records: d.result?.records?.map(r => pick(r, recordFields)) ?? [] } };
      else if (d.method === 'approve') details = { method: d.method, result: pick(d.result, recordFields) };
      else if (['extract', 'reviewSource'].includes(d.method)) details = { method: d.method, result: pick(d.result, ['revision', 'text', 'reviewed', 'metrics']) };
      else if (d.method === 'generateDraft') details = { method: d.method, result: pick(d.result, ['id', 'sourceRevision', 'text', 'createdAt', 'metrics', 'context']) };
    }
    return details ? [structuredClone({ at: event.at, event: event.event, details })] : [];
  });
}

/** Explicit synthetic export only. This function never changes canonical state,
 * claims acceptance, writes a file, or includes image bytes/transport secrets. */
export function buildPhysicalCandidate(state: VaultState, options: { encounterId: string; sessionId: string; observerFailed: boolean; vaultEnvelope: string; reviewedSynthetic: true }) {
  if (options.reviewedSynthetic !== true || !/^physical-printed-\d{8}T\d{6}Z-[a-zA-Z0-9]+$/.test(options.sessionId)) throw new Error('Fresh-session reviewed synthetic scope is required.');
  if (!state.physicalObservations?.some(e => e.event === 'session-prepared' && e.details.sessionId === options.sessionId && e.details.fixtureId === 'DEMO-001' && e.details.observerEnabled === true)) throw new Error('Matching encrypted fresh-session preparation record is required.');
  if (state.encounters.some(e => e.id !== options.encounterId && (e.capture || e.source.text || e.draft)) || state.records.some(r => r.encounterId !== options.encounterId) || state.runs.some(r => r.encounterId !== options.encounterId)) throw new Error('Workflow export is limited to one synthetic clinical encounter and empty isolation patients.');
  const record = state.records.find(r => r.encounterId === options.encounterId && !r.supersededAt);
  const encounter = state.encounters.find(e => e.id === options.encounterId);
  const transfer = state.transfers.find(t => t.encounterId === options.encounterId && t.captureId === encounter?.capture?.id && t.sha256 === encounter.capture.sha256);
  if (!record || !encounter?.capture || !transfer) throw new Error('A received phone photo and current approved record are required.');
  const events = syntheticObservations(state);
  const attestation = events.find(e => e.event === 'printed-source-attestation' && e.details.actor === 'human' && e.details.encounterId === encounter.id && e.details.captureId === transfer.captureId && e.details.sha256 === transfer.sha256)?.details;
  if (!attestation) throw new Error('Confirm the photographed printed synthetic DEMO-001 page before exporting.');
  const runs = structuredClone((state.runs ?? []).filter(r => r.encounterId === encounter.id));
  const extraction = runs.find(r => r.operation === 'extract' && r.status !== 'failed' && 'runId' in r.metrics && r.metrics.request.attachment?.sha256 === transfer.sha256);
  const draftRunId = 'runId' in record.draftingMetrics ? record.draftingMetrics.runId : null;
  const draft = runs.find(r => r.operation === 'draft' && r.status !== 'failed' && 'runId' in r.metrics && r.metrics.runId === draftRunId);
  if (!extraction || !draft || extraction.status === 'failed' || draft.status === 'failed' || typeof extraction.outputText !== 'string' || typeof draft.outputText !== 'string') throw new Error('Canonical raw extraction and draft output must exist. Missing output is never reconstructed.');
  const failures: string[] = [];
  const check = (label: string, fn: () => void) => { try { fn(); return true; } catch (error) { failures.push(label + ': ' + (error as Error).message); return false; } };
  const metricsComplete = runs.map(run => check('Run metrics', () => {
    if (run.status === 'failed') throw new Error('Failed run retained; success acceptance is unavailable.');
    assertCompleteMetrics(run.metrics);
  })).every(Boolean);
  const phone = structuredClone(state.phoneEvidence?.filter(p => p.evidence.binding.transferId === transfer.transferId && p.evidence.binding.deviceId === transfer.deviceId).at(-1)?.evidence ?? null);
  const phonePassed = check('Phone lifecycle', () => validatePhoneLifecycle(phone, transfer));
  const approvalIndex = events.findIndex(e => e.event === 'operation-completed' && e.details.method === 'approve' && (e.details.result as any)?.id === record.id);
  const afterApproval = events.slice(approvalIndex < 0 ? events.length : approvalIndex + 1);
  const selectedHistory = afterApproval.find(e => e.event === 'renderer-view' && e.details.patientId === record.patientId && e.details.historyVisible === true && String(e.details.historyText).includes(record.text.trim()) && (e.details.canonicalApprovedRecords as any[])?.some(r => r.id === record.id && r.text === record.text));
  const otherHistory = afterApproval.find(e => e.event === 'renderer-view' && e.details.patientId && e.details.patientId !== record.patientId && e.details.historyVisible === true && Array.isArray(e.details.canonicalApprovedRecords) && e.details.canonicalApprovedRecords.length === 0 && e.details.historyText === 'No approved notes for this patient.');
  const purgeIndex = afterApproval.findIndex(e => e.event === 'lock-renderer-purge');
  const lockPurge = purgeIndex < 0 ? { workspaceHidden: null, fields: null, content: null, images: null } : afterApproval[purgeIndex].details;
  const reloadEvents = purgeIndex < 0 ? [] : afterApproval.slice(purgeIndex + 1);
  const unlockIndex = reloadEvents.findIndex(e => e.event === 'operation-completed' && e.details.method === 'unlock' && (e.details.result as any)?.records?.some(r => r.id === record.id && r.text === record.text && r.sourceRevision === record.sourceRevision));
  const visibleReload = unlockIndex >= 0 && reloadEvents.slice(unlockIndex + 1).some(e => e.event === 'renderer-view' && e.details.patientId === record.patientId && e.details.approvedReadOnly === true && e.details.approvedText === record.text);
  const envelope = JSON.parse(options.vaultEnvelope);
  const envelopeValid = envelope.version === 1 && envelope.kdf === 'scrypt' && envelope.cipher === 'aes-256-gcm' && Object.keys(envelope).every(k => ['version', 'kdf', 'cipher', 'salt', 'iv', 'tag', 'data'].includes(k)) && ['salt', 'iv', 'tag', 'data'].every(k => typeof envelope[k] === 'string' && envelope[k].length > 0);
  const plaintextAbsent = envelopeValid && [record.text, record.sourceText, extraction.outputText, draft.outputText, ...state.patients.map(p => p.alias)].every(text => !options.vaultEnvelope.includes(text));
  const approvedSha256 = sha256(record.text);
  const sourceReviewed = events.some(e => e.event === 'operation-completed' && e.details.method === 'reviewSource' && (e.details.result as any)?.reviewed === true && (e.details.result as any)?.revision === draft.sourceRevision && (e.details.result as any)?.text === record.sourceText);
  const sourceTrusted = events.some(e => e.event === 'renderer-input' && e.details.trusted === true && ['reviewSource', 'confirmCorrection'].includes(e.details.control) && e.details.patientId === record.patientId && e.details.encounterId === encounter.id && e.details.sourceText?.trim() === record.sourceText);
  const approvalTrusted = events.some((e, index) => index < approvalIndex && e.event === 'renderer-input' && e.details.control === 'approve' && e.details.trusted === true && e.details.approvalChecked === true && e.details.patientId === record.patientId && e.details.encounterId === encounter.id && e.details.draftText === record.text);
  const capture = { receipt: transfer, nativeAndroidBuild: phonePassed ? true : null, certificatePinVerified: phonePassed ? true : null, encryptedPendingQueue: phonePassed ? true : null, deletedOnlyAfterReceipt: phonePassed ? true : null, printedSyntheticEnglishNote: true, sourceMedium: 'paper', fixtureId: 'DEMO-001', sourceAttestation: attestation };
  const candidate: any = {
    schemaVersion: 1, syntheticOnly: true, sessionId: options.sessionId, kind: 'physical-fold-review-workflow', status: 'candidate-awaiting-independent-review',
    publicationRedactions: ['Source photo bytes, device credentials and TLS identity are excluded.', 'Observer unlock snapshots retain approved records only; session setup/network metadata is excluded. Required prompts, model configuration and native measurements are unchanged.'],
    exportedAt: new Date().toISOString(), completedAt: null, physicalFoldAcceptance: false, clinicianHumanAcceptance: false, physicalObservationFailed: options.observerFailed,
    steps: [
      { operation: 'paired-fold-photo-received', passed: phonePassed, evidence: capture },
      { operation: 'real-visionpsy-extraction', passed: metricsComplete, evidence: { runId: 'runId' in extraction.metrics ? extraction.metrics.runId : null, text: extraction.outputText } },
      { operation: 'source-correction-review', passed: sourceReviewed && sourceTrusted, evidence: { sourceRevision: draft.sourceRevision, correctedText: record.sourceText, correctedSha256: sha256(record.sourceText), extractedSha256: sha256(extraction.outputText), changed: record.sourceText !== extraction.outputText, actor: sourceTrusted ? 'human' : 'unconfirmed' } },
      { operation: 'real-bounded-draft', passed: metricsComplete, evidence: { runId: draftRunId, text: draft.outputText } },
      { operation: 'exact-approval-encrypted-save', passed: approvalIndex >= 0 && approvalTrusted, evidence: { recordId: record.id, sourceRevision: record.sourceRevision, exactText: record.text, approvedSha256, actor: approvalTrusted ? 'human' : 'unconfirmed' } },
      { operation: 'selected-patient-approved-history', passed: Boolean(selectedHistory && otherHistory), evidence: { patientId: record.patientId, selectedPatientRecordVisible: Boolean(selectedHistory), otherPatientExcluded: Boolean(otherHistory), otherPatientId: otherHistory?.details.patientId ?? null } },
      { operation: 'lock-renderer-purge', passed: ['workspaceHidden', 'fields', 'content', 'images'].every(k => lockPurge[k] === true), evidence: lockPurge },
      { operation: 'encrypted-reload', passed: Boolean(visibleReload && plaintextAbsent), evidence: { reloadedSha256: visibleReload ? approvedSha256 : null, identicalToApproved: Boolean(visibleReload), plaintextAbsentFromVaultEnvelope: plaintextAbsent } },
    ],
    runs, source: { extracted: extraction.outputText, corrected: record.sourceText },
    approval: { patientId: record.patientId, encounterId: record.encounterId, recordId: record.id, exactText: record.text, approvedSha256, reloadedSha256: visibleReload ? approvedSha256 : null },
    historyIsolation: Boolean(selectedHistory && otherHistory), lockPurge, physicalObservations: events, phoneLifecycle: phone,
  };
  check('Printed source', () => validatePaperSource(candidate, capture));
  check('Human workflow', () => validateHumanReview(candidate, extraction, draft));
  // Preview the gate without promoting this exported candidate's acceptance flags.
  const observedEnd = events.at(-1)?.at ?? null;
  const gatePassed = check('Workflow gate preview', () => validateWorkflow({ ...candidate, completedAt: observedEnd, physicalFoldAcceptance: true, clinicianHumanAcceptance: true }));
  candidate.completedAt = gatePassed && failures.length === 0 ? observedEnd : null;
  candidate.reviewPreview = { gatePassedWithReviewedFlags: gatePassed && failures.length === 0, failures, acceptanceRequiresIndependentReview: true };
  return candidate;
}
