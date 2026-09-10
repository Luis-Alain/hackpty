import { createHash } from 'node:crypto';
import type { VaultState } from './types.js';
import type { ChartReviewEvidence, ChartReviewOutput, ChartReviewPacket } from '../contracts/chart-review.js';

const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const MAX_HISTORICAL = 6;
const EXCERPT_CHARACTERS = 2000;
const MAX_TOTAL_CHARACTERS = 6000; // coordinator decision D1: current source plus historical excerpts, leaving room in ctx_size 4096 for reasoning and JSON
const FINDING_KINDS = new Set(['new', 'changed', 'unchanged', 'resolved', 'conflict', 'unknown']);

/** Refusing an oversized current source is a recorded outcome, not a silent truncation. */
export class ChartReviewBudgetError extends Error {}

/** The documented visit date is an ISO date (YYYY-MM-DD) on one of the first three lines; otherwise the record approval date (or the encounter creation date for the current source). */
function documentedDate(text: string, fallbackIso: string): string {
  for (const line of text.split('\n').slice(0, 3)) {
    const match = line.match(/\b(\d{4}-\d{2}-\d{2})\b/);
    if (match) return match[1];
  }
  return fallbackIso.slice(0, 10);
}

/** Sentence-bounded prefix of at most EXCERPT_CHARACTERS characters; a sentence is never clipped. */
function sentenceBoundedExcerpt(text: string): { start: number; end: number; text: string; complete: boolean } {
  if (text.length <= EXCERPT_CHARACTERS) return { start: 0, end: text.length, text, complete: true };
  let end = 0;
  for (const sentence of new Intl.Segmenter('en', { granularity: 'sentence' }).segment(text)) {
    const sentenceEnd = sentence.index + sentence.segment.length;
    if (sentenceEnd > EXCERPT_CHARACTERS) break;
    end = sentenceEnd;
  }
  return { start: 0, end, text: text.slice(0, end), complete: false };
}

/**
 * Binds the evidence packet in the application before inference. The model never selects patients or records.
 * Budget (coordinator decision D1): the current reviewed source is supplied in full and must fit the
 * 6000-character total by itself, otherwise the packet is refused with ChartReviewBudgetError (never
 * silently truncated). Historical approved records are then added oldest to newest — one sentence-bounded
 * head excerpt of at most 2000 characters each — stopping when the next excerpt would push the total over
 * 6000. With more than 6 approved records the 6 most recent are candidates (presented oldest to newest)
 * because the task is "what changed since the previous visit". Every omitted record — by the record limit
 * or the evidence budget — is disclosed in coverage.omitted with its record id, date and reason.
 */
export function buildChartReviewPacket(state: VaultState, patientId: string, currentEncounterId: string, snapshotAt: string): ChartReviewPacket {
  if (!state.patients.some(p => p.id === patientId)) throw new Error('Patient not found.');
  const encounter = state.encounters.find(e => e.id === currentEncounterId);
  if (!encounter || encounter.patientId !== patientId) throw new Error('The current encounter does not belong to this patient.');
  if (!encounter.source.revision || !encounter.source.reviewed || !encounter.source.text.trim()) throw new Error('Review and confirm the current source before requesting a chart review.');
  const currentText = encounter.source.text;
  if (currentText.length > MAX_TOTAL_CHARACTERS) throw new ChartReviewBudgetError(`The reviewed source is ${currentText.length} characters, over the ${MAX_TOTAL_CHARACTERS}-character chart review evidence budget. Shorten the source or split the encounter; the current source is never silently truncated.`);
  const current: ChartReviewEvidence = {
    evidenceId: 'C1', kind: 'current', patientId, encounterId: currentEncounterId, recordId: null,
    sourceRevision: encounter.source.revision, sourceDate: documentedDate(currentText, encounter.createdAt), approvedAt: null,
    start: 0, end: currentText.length, text: currentText, textSha256: hash(currentText),
  };
  const available = state.records
    .filter(r => r.patientId === patientId && !r.supersededAt && r.encounterId !== currentEncounterId)
    .sort((a, b) => a.approvedAt.localeCompare(b.approvedAt));
  const candidates = available.slice(-MAX_HISTORICAL);
  const omitted: string[] = [];
  const omittedRecords = available.length - candidates.length;
  if (omittedRecords > 0) omitted.push(`${omittedRecords} older approved record(s) omitted by the ${MAX_HISTORICAL}-record limit; only the ${candidates.length} most recent approved records were supplied.`);
  const historical: ChartReviewEvidence[] = [];
  let total = currentText.length, budgetReached = false;
  for (const record of candidates) {
    const sourceDate = documentedDate(record.text, record.approvedAt);
    const excerpt = sentenceBoundedExcerpt(record.text);
    if (budgetReached || total + excerpt.text.length > MAX_TOTAL_CHARACTERS) {
      budgetReached = true;
      omitted.push(`Record ${record.id} (documented ${sourceDate}): omitted by the evidence budget; the ${MAX_TOTAL_CHARACTERS}-character total for current plus historical evidence was reached.`);
      continue;
    }
    total += excerpt.text.length;
    const evidenceId = 'H' + (historical.length + 1);
    if (!excerpt.complete) {
      omitted.push(excerpt.end === 0
        ? `${evidenceId} (record ${record.id}): no excerpt supplied; the first sentence exceeds the ${EXCERPT_CHARACTERS}-character limit and is never clipped.`
        : `${evidenceId} (record ${record.id}): excerpt ends at ${excerpt.end} of ${record.text.length} characters; the remaining text was omitted to keep sentences whole.`);
    }
    historical.push({
      evidenceId, kind: 'historical', patientId, encounterId: record.encounterId, recordId: record.id,
      sourceRevision: record.sourceRevision, sourceDate, approvedAt: record.approvedAt,
      start: excerpt.start, end: excerpt.end, text: excerpt.text, textSha256: hash(excerpt.text),
    });
  }
  const dates = historical.map(h => h.sourceDate).sort();
  return {
    schemaVersion: 1, task: 'what-changed-and-unclear', patientId, currentEncounterId, current, historical,
    coverage: {
      method: 'application-bound-approved-history-v1',
      historicalRecordsAvailable: available.length, historicalRecordsSupplied: historical.length,
      dateRange: { from: dates[0] ?? null, to: dates.at(-1) ?? null },
      charactersSupplied: total,
      omitted,
    },
  };
}

/** Every supplied record and the reviewed source are reauthorized after inference; evidence IDs carry no authority. */
export function revalidateChartReviewEvidence(state: VaultState, packet: ChartReviewPacket) {
  const encounter = state.encounters.find(e => e.id === packet.currentEncounterId);
  if (!encounter || encounter.patientId !== packet.patientId) throw new Error('The current encounter changed while the chart review ran. Request a new review.');
  if (!encounter.source.reviewed || encounter.source.revision !== packet.current.sourceRevision
    || encounter.source.text.slice(packet.current.start, packet.current.end) !== packet.current.text
    || hash(packet.current.text) !== packet.current.textSha256) throw new Error('The reviewed source changed while the chart review ran. Request a new review against the current source.');
  for (const evidence of packet.historical) {
    const record = state.records.find(r => r.id === evidence.recordId);
    if (!record || record.patientId !== packet.patientId || record.supersededAt || record.sourceRevision !== evidence.sourceRevision
      || record.text.slice(evidence.start, evidence.end) !== evidence.text || hash(evidence.text) !== evidence.textSha256) throw new Error('An approved historical record changed while the chart review ran. Request a new review against the current history.');
  }
}

/** Strict output validation: any schema, authorization or content violation rejects the entire output. */
export function validateChartReviewOutput(raw: string, packet: ChartReviewPacket): ChartReviewOutput {
  let response: any;
  try { response = JSON.parse(raw); } catch { throw new Error('The local model did not return valid chart review JSON. No result was accepted.'); }
  const invalid = (reason: string) => new Error(`The local model returned an invalid chart review (${reason}). No result was accepted.`);
  if (!response || typeof response !== 'object' || Array.isArray(response)) throw invalid('not an object');
  if (Object.keys(response).sort().join(',') !== 'clarifications,findings,schemaVersion' || response.schemaVersion !== 1) throw invalid('unexpected top-level shape');
  if (!Array.isArray(response.findings) || response.findings.length > 24) throw invalid('findings must be an array of at most 24 items');
  if (!Array.isArray(response.clarifications) || response.clarifications.length > 12) throw invalid('clarifications must be an array of at most 12 items');
  const authorized = new Set([packet.current.evidenceId, ...packet.historical.map(h => h.evidenceId)]);
  const text = (value: any, name: string) => { if (typeof value !== 'string' || !value.trim() || value.length > 600) throw invalid(`${name} must be a non-empty string of at most 600 characters`); };
  const evidenceIds = (value: any) => {
    if (!Array.isArray(value) || value.length < 1 || value.length > 7 || value.some(id => typeof id !== 'string') || new Set(value).size !== value.length) throw invalid('evidenceIds must be 1..7 unique strings');
    for (const id of value) if (!authorized.has(id)) throw invalid(`evidenceId "${id}" is not part of the authorized packet`);
  };
  for (const finding of response.findings) {
    if (!finding || typeof finding !== 'object' || Array.isArray(finding) || Object.keys(finding).sort().join(',') !== 'evidenceIds,kind,statement') throw invalid('finding has an unexpected shape');
    if (!FINDING_KINDS.has(finding.kind)) throw invalid(`unknown finding kind "${finding.kind}"`);
    text(finding.statement, 'finding statement'); evidenceIds(finding.evidenceIds);
  }
  for (const clarification of response.clarifications) {
    if (!clarification || typeof clarification !== 'object' || Array.isArray(clarification) || Object.keys(clarification).sort().join(',') !== 'evidenceIds,question,reason') throw invalid('clarification has an unexpected shape');
    text(clarification.question, 'clarification question'); text(clarification.reason, 'clarification reason'); evidenceIds(clarification.evidenceIds);
  }
  return response as ChartReviewOutput;
}
