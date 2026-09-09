export type Operation = 'extract' | 'draft' | 'query';
export interface QuerySource { sourceId: string; text: string }
export interface ModelAsset {
  id: string; role: 'extract' | 'projector' | 'draft'; constant: string;
  filename: string; url: string; expectedBytes: number; sha256: string;
  modelType: 'llamacpp-completion';
}
export interface VerifiedAsset extends ModelAsset {
  path: string; actualBytes: number; actualSha256: string; verifiedAt: string;
}
export interface PromptMessage {
  role: string; content: string; attachments?: { path: string }[];
}
export interface NativeStats {
  timeToFirstToken: number; tokensPerSecond: number; cacheTokens: number;
  promptTokens: number; generatedTokens: number; emittedTokens: number;
  avgConcurrentSeq?: number; backendDevice: 'cpu' | 'gpu';
}
export interface Measurement {
  value: number; unit: 'ms' | 'tokens/s'; method: string;
}
/** Contains source text and exact prompts: persist only inside the encrypted vault. */
export interface RunMetrics {
  schemaVersion: 1; status: 'succeeded'; runId: string; requestId: string;
  operation: Operation; model: string; sdkVersion: string;
  loadMs: number; durationMs: number; ttftMs: number;
  inputTokens: number; outputTokens: number; tokensPerSecond: number;
  measurementMethod: string; startedAt: string; endedAt: string;
  runtime: {
    sdk: '@qvac/sdk'; sdkVersion: string; inferenceVersion: string;
    addonVersion: string; nodeVersion: string; platform: string; arch: string;
    processId: number; transport: 'windows-named-pipe' | 'unix-domain-socket';
    workerEntry: string; localOnly: true;
  };
  modelDetails: {
    modelId: string; type: 'llamacpp-completion'; assets: VerifiedAsset[];
    loadConfig: Record<string, unknown>; loadedModelInfo: Record<string, unknown>;
  };
  request: {
    history: PromptMessage[]; generationParams: Record<string, number>; responseFormat?: Record<string, unknown>;
    kvCache: false; stream: true; promptTemplateVersion: string;
    sourceId?: string; context: unknown[];
    attachment?: { sha256: string; bytes: number; mime: string };
  };
  output: { sha256: string; characters: number; stopReason?: string; contentDeltaCount: number; completionDoneObserved:true; finalPromiseResolved:true; terminationMethod:string };
  native: NativeStats;
  timings: {
    modelLoadWall: Measurement; nativeModelInitialization: Measurement;
    sdkTotalLoad: Measurement; completionWall: Measurement;
    timeToFirstContent: Measurement; nativeTimeToFirstToken: Measurement;
    nativeThroughput: Measurement;
  };
  profiler: Record<string, unknown>;
  sharedRuntime: { repository: string; commit: string; paths: readonly string[]; performanceRows: Record<string, unknown>[] };
}
export interface RuntimeResult { text: string; metrics: RunMetrics; }
export interface RuntimeFailure {
  schemaVersion: 1; status: 'failed'; runId: string; operation: Operation;
  stage: string; error: { name: string; message: string; code?: string | number };
  startedAt: string; endedAt: string; partialEvidence: Record<string, unknown>;
}
export class RuntimeEvidenceError extends Error {
  constructor(message: string, public evidence: RuntimeFailure) {
    super(message); this.name = 'RuntimeEvidenceError';
  }
}
export interface JobRequest {
  runId: string; operation: Operation; projectRoot: string; modelDirectory: string;
  tempDirectory: string; imageBase64?: string; mime?: string; text?: string;
  sourceId?: string; context: unknown[]; querySources?: QuerySource[]; extractionPromptProfile?: 'psyrec-extract-lines-v3';
}
