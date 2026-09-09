import type { RunMetrics } from '../runtime/types.js';
export type { RunMetrics } from '../runtime/types.js';
/** Private TLS identity: encrypted vault only; never include in renderer snapshots. */
export interface TransportIdentity { key: string; cert: string; }
/** The physical desktop QR is the trust anchor for this single encounter. */
export interface PairingInvite {
  version: 1; endpoint: string; certificateFingerprint: string;
  secret: string; encounterId: string; expiresAt: number;
}
/** Phone persists these only in protected device storage. */
export interface PairedDevice { deviceId: string; token: string; encounterId: string; }
/** Receipt is returned only after the capture's encrypted vault commit succeeds. */
export interface CaptureReceipt {
  deviceId: string; transferId: string; encounterId: string; captureId: string;
  sha256: string; receivedAt: string; duplicate?: boolean;
}
/** All identifiers are opaque application-generated IDs, never patient names. */
export interface ExtractionResult { text: string; metrics: RunMetrics; }
export interface DraftSection { title: string; text: string; sourceIds: string[]; }
export interface DraftResult { text: string; metrics: RunMetrics; }
export interface RetrievalRequest { patientId: string; query: string; signal: AbortSignal; limit: number; }
/** Return locators into the application's canonical approved notes, not arbitrary text. */
export interface RetrievalHit { patientId: string; recordId: string; sourceRevision: number; start: number; end: number; }
export interface ApprovedNotesRetriever { retrieveApprovedNotes(request: RetrievalRequest): Promise<RetrievalHit[]>; }
/** Future voice adapter supplies source text; it never approves records or changes patient binding. */
export interface VoiceProcessor { transcribe(input: { localPath: string; signal: AbortSignal }): Promise<{ text: string; segments: { startMs: number; endMs: number; text: string }[]; metrics: RunMetrics }>; }
