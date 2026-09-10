import type { TransportIdentity, CaptureReceipt, PhoneLifecycleEvidence } from '../contracts/index.js';
import type { ChartReviewPacket } from '../contracts/chart-review.js';
import type { RunMetrics, RuntimeFailure } from '../runtime/types.js';

// Test evidence is explicitly distinguishable and never passes the runtime export gate.
export type Evidence = RunMetrics | { testDouble: true };
export interface Patient { id: string; alias: string; createdAt: string }
export interface Capture { id: string; mime: string; data: string; sha256: string; receivedAt: string }
export interface Source { revision: number; text: string; reviewed: boolean; metrics?: Evidence }
export interface Excerpt { recordId: string; patientId: string; sourceRevision: number; approvedAt: string; start: number; end: number; text: string }
export interface Context { status: 'disabled' | 'available' | 'unavailable'; excerpts: Excerpt[] }
export interface Draft { id: string; sourceRevision: number; text: string; createdAt: string; metrics: Evidence; context: Context }
export interface Encounter { id: string; patientId: string; createdAt: string; capture: Capture | null; source: Source; draft: Draft | null; status: 'empty' | 'received' | 'source-review' | 'source-reviewed' | 'draft-review' | 'approved' }
export interface ApprovedRecord { id: string; patientId: string; encounterId: string; sourceRevision: number; sourceText: string; text: string; draftId: string; modelDraftText: string; clinicianEdited: boolean; approvedAt: string; supersededAt: string | null; context: Excerpt[]; extractionMetrics?: Evidence; draftingMetrics: Evidence }
export interface Device { id: string; name: string; tokenHash: string; createdAt: string; revoked: boolean; encounterId: string }
export type Receipt = CaptureReceipt;
export type RunRecord = { encounterId: string; sourceRevision: number; operation: 'extract' | 'draft' } & ({ status?: 'succeeded'; metrics: Evidence; outputText?: string } | { status: 'failed'; evidence: RuntimeFailure; metrics?: never });
export interface ChartReviewRunRecord {
  id: string; patientId: string; encounterId: string; createdAt: string;
  packet?: ChartReviewPacket; raw?: string; metrics?: Evidence;
  status: 'answered' | 'rejected' | 'failed'; rejection?: string; failure?: RuntimeFailure;
  invalidatedAt?: string | null; invalidationReason?: string;
}
export interface VaultState { version: 1; patients: Patient[]; encounters: Encounter[]; records: ApprovedRecord[]; devices: Device[]; transfers: Receipt[]; runs: RunRecord[]; queryRuns?: QueryRunRecord[]; chartReviews?: ChartReviewRunRecord[]; goldTranscriptions?: HumanGoldTranscription[]; phoneEvidence?: { receivedAt: string; evidence: PhoneLifecycleEvidence }[]; transportIdentity?: TransportIdentity; physicalObservations?: { at: string; event: string; details: Record<string, unknown> }[] }
export interface InferencePort {
  extractImage(input: { bytes: Buffer; mime: string }): Promise<{ text: string; metrics: Evidence }>;
  answerApprovedNotes?(input: { question: string; sources: { sourceId: string; text: string }[] }): Promise<{ text: string; metrics: Evidence }>;
  reviewChart?(input: { packet: ChartReviewPacket }): Promise<{ text: string; metrics: Evidence }>;
  draftFromSource(input: { text: string; sourceId: string; context: Excerpt[] }): Promise<{ text: string; metrics: Evidence }>;
}

export interface ApprovedQueryExcerpt {
  sourceId: string; recordId: string; patientId: string; encounterId: string;
  sourceRevision: number; approvedAt: string; recordSha256: string; start: number; end: number; text: string;
}
export interface QueryCitation {
  sourceId: string; recordId: string; patientId: string; encounterId: string;
  sourceRevision: number; approvedAt: string; start: number; end: number; quote: string;
}
export interface QueryCoverage {
  method: 'local-lexical-ranking-v1'; snapshotAt: string; approvedRecordsScanned: number;
  excerptsAvailable: number; excerptsSearched: number; recordsRepresented: number; charactersSearched: number; omittedLongPassages: number; segmentation: 'Intl.Segmenter en sentences; no clipped sentences'; partial: boolean;
}
export interface QueryRunRecord {
  id: string; patientId: string; question: string; startedAt: string; completedAt: string;
  sources: ApprovedQueryExcerpt[]; coverage: QueryCoverage; modelInvoked: boolean;
  status: 'answered' | 'not-found' | 'rejected' | 'failed'; rawOutput?: string; metrics?: Evidence;
  citations?: QueryCitation[]; failure?: RuntimeFailure; rejection?: string;
}
export interface ApprovedQueryAnswer {
  queryId: string; patientId: string; status: 'answered' | 'not-found'; answer: string;
  citations: QueryCitation[]; coverage: QueryCoverage; modelInvoked: boolean;
  metrics?: { testDouble: true } | Pick<RunMetrics, 'runId' | 'model' | 'sdkVersion' | 'loadMs' | 'durationMs' | 'native' | 'timings' | 'modelDetails' | 'measurementMethod' | 'runtime'>;
}
export interface HumanGoldTranscription {
  id: string; encounterId: string; captureId: string; captureSha256: string;
  text: string; textSha256: string; createdAt: string; characterCount: number;
  referenceMethod: 'human-transcription-from-displayed-capture';
  actor: 'human'; confirmedSynthetic: true; trustedInput: true;
  referenceConditions: 'May be authored after viewing model output; not a blinded or held-out reference.';
  accuracy: { status: 'available'; extractionRunId: string; extractionOutputSha256: string; performanceEvidenceComplete: boolean; scores: ReturnType<typeof import('../runtime/transcription-scoring.js').scoreTranscription>; methods: typeof import('../runtime/transcription-scoring.js').SCORING_METHODS } | { status: 'unavailable'; reason: string };
}
