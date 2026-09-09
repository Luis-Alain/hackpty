/** All identifiers are opaque application-generated IDs, never patient names. */
export interface RunMetrics {
  model: string; sdkVersion: string; operation: 'extract' | 'draft';
  loadMs: number; durationMs: number; ttftMs: number | null;
  inputTokens: number | null; outputTokens: number | null;
  tokensPerSecond: number | null; measurementMethod: string;
}
export interface ExtractionResult { text: string; metrics: RunMetrics; }
export interface DraftSection { title: string; text: string; sourceIds: string[]; }
export interface DraftResult { text: string; metrics: RunMetrics; }
export interface RetrievalRequest { patientId: string; query: string; signal: AbortSignal; limit: number; }
/** Return locators into the application's canonical approved notes, not arbitrary text. */
export interface RetrievalHit { patientId: string; recordId: string; sourceRevision: number; start: number; end: number; }
export interface ApprovedNotesRetriever { retrieveApprovedNotes(request: RetrievalRequest): Promise<RetrievalHit[]>; }
/** Future voice adapter supplies source text; it never approves records or changes patient binding. */
export interface VoiceProcessor { transcribe(input: { localPath: string; signal: AbortSignal }): Promise<{ text: string; segments: { startMs: number; endMs: number; text: string }[]; metrics: RunMetrics }>; }
