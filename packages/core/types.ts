import type { TransportIdentity, CaptureReceipt, PhoneLifecycleEvidence } from '../contracts/index.js';
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
export interface VaultState { version: 1; patients: Patient[]; encounters: Encounter[]; records: ApprovedRecord[]; devices: Device[]; transfers: Receipt[]; runs: RunRecord[]; phoneEvidence?: { receivedAt: string; evidence: PhoneLifecycleEvidence }[]; transportIdentity?: TransportIdentity; physicalObservations?: { at: string; event: string; details: Record<string, unknown> }[] }
export interface InferencePort {
  extractImage(input: { bytes: Buffer; mime: string }): Promise<{ text: string; metrics: Evidence }>;
  draftFromSource(input: { text: string; sourceId: string; context: Excerpt[] }): Promise<{ text: string; metrics: Evidence }>;
}
