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
/** Native phone observations are encrypted with the capture/receipt, never clinical text. */
export interface PhoneLifecycleEvent {
  sequence: number;
  type: 'capture_encrypted' | 'queue_reopened' | 'send_started' | 'tls_pin_verified' | 'tls_pin_rejected' | 'send_failed_queue_retained' | 'receipt_rejected_queue_retained' | 'matching_receipt_received' | 'photo_replaced_by_encrypted_receipt';
  observedAt: string;
  processSessionId: string;
  apkSha256: string;
  attemptId?: string;
  queueCiphertextSha256?: string;
  imageSha256Verified?: boolean;
  failureKind?: 'network' | 'certificate' | 'receipt' | 'other';
  interruption?: { method: 'native-mid-upload-disconnect'; bytesWritten: number; totalBytes: number; byteCountMethod: 'application-output-stream-write-and-flush' };
  receipt?: CaptureReceipt;
  photoPresent?: boolean;
  receiptPersisted?: boolean;
}
export interface PhoneLifecycleEvidence {
  schemaVersion: 1;
  kind: 'native-android-transfer-lifecycle';
  platform: 'android';
  provenance: 'native-camera-capture' | 'synthetic-instrumentation';
  binding: { transferId: string; encounterId: string; imageSha256: string; deviceId: string | null; captureId: string | null };
  /** Measured when a new native journal is created. Absent legacy identity is never backfilled. */
  device?: { manufacturer: string; model: string };
  build: { packageName: string; versionName: string; versionCode: number; apkSha256: string };
  events: PhoneLifecycleEvent[];
}
