import type { RunMetrics } from '../runtime/types.js';
/** Evidence is bound by the application before inference; the model never selects records or patients. */
export interface ChartReviewEvidence {
  evidenceId: string;            // 'C1' for the current reviewed source; 'H1'..'H6' for historical approved records, ordered oldest to newest
  kind: 'current' | 'historical';
  patientId: string; encounterId: string;
  recordId: string | null;       // approved record id for historical evidence; null for the current reviewed source
  sourceRevision: number;
  sourceDate: string;            // ISO 8601 date of the visit/note as documented (YYYY-MM-DD)
  approvedAt: string | null;     // ISO timestamp for historical approved records; null for current
  start: number; end: number;    // canonical excerpt range inside the record text
  text: string;                  // exact canonical excerpt text
  textSha256: string;            // sha256 hex of text
}
export interface ChartReviewCoverage {
  method: 'application-bound-approved-history-v1';
  historicalRecordsAvailable: number; historicalRecordsSupplied: number;
  dateRange: { from: string | null; to: string | null };
  charactersSupplied: number; omitted: string[];   // human-readable omissions imposed by limits
}
export interface ChartReviewPacket {
  schemaVersion: 1; task: 'what-changed-and-unclear';
  patientId: string; currentEncounterId: string;
  current: ChartReviewEvidence; historical: ChartReviewEvidence[];   // 0..6 items
  coverage: ChartReviewCoverage;
}
export type ChartReviewFindingKind = 'new' | 'changed' | 'unchanged' | 'resolved' | 'conflict' | 'unknown';
/** Every finding and clarification must cite at least one evidenceId present in the packet. */
export interface ChartReviewFinding { kind: ChartReviewFindingKind; statement: string; evidenceIds: string[]; }
export interface ChartReviewClarification { question: string; reason: string; evidenceIds: string[]; }
export interface ChartReviewOutput { schemaVersion: 1; findings: ChartReviewFinding[]; clarifications: ChartReviewClarification[]; }
/** Produced by core after schema, authorization and post-inference revalidation checks. */
export interface ChartReviewResult {
  reviewId: string; patientId: string; currentEncounterId: string;
  output: ChartReviewOutput; raw: string; modelIdentity: string;
  coverage: ChartReviewCoverage; evidence: ChartReviewEvidence[];
  metrics: RunMetrics | { testDouble: true };
  validation: { schemaValid: true; evidenceIdsAuthorized: true; revalidatedAt: string };
}
