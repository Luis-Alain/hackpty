import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { QvacRuntime, RuntimeEvidenceError, assertCompleteMetrics } from '../../packages/runtime/index.js';
import { CHART_REVIEW_PROMPT_VERSION, CHART_REVIEW_GENERATION, CHART_REVIEW_CAPTURE_THINKING, chartReviewHistory, chartReviewResponseFormat } from '../../packages/runtime/chart-review-prompts.js';
import { verifyModels } from '../../packages/runtime/models.js';
import { cargar, descargar } from '../../packages/runtime/shared-runtime.js';
import { scoreChartReviewCase, scoreChartReviewSuite, failedCaseScore, type CaseScore } from './chart-review-scoring.js';
import { withGpuLease } from './gpu-lease.js';
import { sha256 } from './transcription-cases.js';

// Cell A step A5/A6: chart-review evaluation harness. Freezes a protocol, runs each
// suite case through the review path selected by a D8 configuration label, retains raw
// outputs, thinking counts, wall timings and failures, and writes wx-flagged records.
// Structured configurations (i, iii) run through QvacRuntime.reviewChart; thinking
// configurations without grammar (ii, iv) run through a direct-SDK path (pattern:
// medpsy-verify.ts) because the runtime review operation is pinned to the verified
// structured configuration. Question cases always go through the query operation with
// the same model under test.
export const CHART_REVIEW_TARGETS = {goldRecallStrictMin: 0.80, prohibitedViolationsMax: 0, schemaValidRateMin: 1, abstentionAccuracyMin: 1} as const;

/** D8 (coordinator decision 2026-09-10 00:55 UTC): the four compared configurations. */
export const D8_CONFIGS = {
  i: {label: 'i', description: 'MedPsy-1.7B q4_k_m imatrix, reasoning_budget 0, strict json_schema (production candidate)', modelConstant: 'HEALTHCARE_1_7B_MEDICAL_Q4_K_M', quantization: 'q4_k_m imatrix', manifestDir: '.local/medpsy-eval', reasoningBudget: 0, predict: 1536, ctxSize: 4096, structured: true, captureThinking: true},
  ii: {label: 'ii', description: 'MedPsy-1.7B q4_k_m imatrix, thinking mode without grammar; JSON parsed from contentText', modelConstant: 'HEALTHCARE_1_7B_MEDICAL_Q4_K_M', quantization: 'q4_k_m imatrix', manifestDir: '.local/chart-review-eval/ii', reasoningBudget: 1024, predict: 2560, ctxSize: 8192, structured: false, captureThinking: true},
  iii: {label: 'iii', description: 'Qwen3-1.7B Q4_0 (production draft asset), reasoning_budget 0, strict json_schema; quantization difference Q4_0 vs q4_k_m imatrix disclosed', modelConstant: 'QWEN3_1_7B_INST_Q4', quantization: 'Q4_0', manifestDir: '.local/chart-review-eval/iii', reasoningBudget: 0, predict: 1536, ctxSize: 4096, structured: true, captureThinking: true},
  iv: {label: 'iv', description: 'Qwen3-1.7B Q4_0, thinking mode without grammar; matched control for medical specialization (quantization difference Q4_0 vs q4_k_m imatrix disclosed)', modelConstant: 'QWEN3_1_7B_INST_Q4', quantization: 'Q4_0', manifestDir: '.local/chart-review-eval/iv', reasoningBudget: 1024, predict: 2560, ctxSize: 8192, structured: false, captureThinking: true}
} as const;
export type D8Label = keyof typeof D8_CONFIGS;

/**
 * Free-form JSON extraction for thinking configurations. Strips nothing silently:
 * the (whitespace-trimmed) contentText must be exactly one JSON object, otherwise
 * first-pass validity is false and the raw text is kept for the record.
 */
export function extractChartReviewJson(contentText: string): {ok: boolean; value?: unknown; error?: string} {
  const text = contentText.trim();
  if (!text.startsWith('{') || !text.endsWith('}')) return {ok: false, error: 'contentText is not exactly one JSON object'};
  try {
    const value = JSON.parse(text);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {ok: false, error: 'parsed value is not a JSON object'};
    return {ok: true, value};
  } catch (error) {
    return {ok: false, error: String((error as Error).message)};
  }
}

const digestText = (value: string) => createHash('sha256').update(value).digest('hex');

/** Canonical application-side binding of a suite case into a review packet. Shared with the verifier. */
export function bindChartReviewPacket(entry: any, evidenceBudgetChars: number) {
  const omitted: string[] = [];
  const current = {
    evidenceId: 'C1', kind: 'current' as const, patientId: entry.patient.patientId, encounterId: entry.current.encounterId,
    recordId: null, sourceRevision: 1, sourceDate: entry.current.sourceDate, approvedAt: null,
    start: 0, end: entry.current.text.length, text: entry.current.text, textSha256: digestText(entry.current.text)
  };
  let total = current.text.length;
  const historical: any[] = [];
  for (const record of entry.historical as any[]) {
    if (record.superseded === true) { omitted.push(`Excluded superseded record ${record.recordId}.`); continue; }
    if (record.patientId !== entry.patient.patientId) { omitted.push(`Excluded record ${record.recordId}: patient binding mismatch.`); continue; }
    if (total + record.text.length > evidenceBudgetChars) { omitted.push(`Excluded record ${record.recordId}: evidence budget ${evidenceBudgetChars} characters would be exceeded.`); continue; }
    total += record.text.length;
    historical.push({
      evidenceId: `H${historical.length + 1}`, kind: 'historical' as const, patientId: record.patientId, encounterId: record.encounterId,
      recordId: record.recordId, sourceRevision: 1, sourceDate: record.sourceDate, approvedAt: `${record.sourceDate}T00:00:00.000Z`,
      start: 0, end: record.text.length, text: record.text, textSha256: digestText(record.text)
    });
  }
  return {
    schemaVersion: 1 as const, task: 'what-changed-and-unclear' as const,
    patientId: entry.patient.patientId, currentEncounterId: entry.current.encounterId,
    current, historical,
    coverage: {
      method: 'application-bound-approved-history-v1' as const,
      historicalRecordsAvailable: entry.historical.length, historicalRecordsSupplied: historical.length,
      dateRange: {from: historical.length ? historical[0].sourceDate : null, to: entry.current.sourceDate},
      charactersSupplied: total, omitted
    }
  };
}

async function main() {
  const [id, d8Arg, suiteFileArg, ...rest] = process.argv.slice(2);
  const root = process.cwd();
  if (!id || !/^20[0-9TZa-z-]+$/.test(id)) throw new Error('Use a unique dated synthetic experiment ID.');
  const config = (D8_CONFIGS as Record<string, typeof D8_CONFIGS[D8Label]>)[d8Arg ?? ''];
  if (!config) throw new Error('Select a D8 configuration label: i, ii, iii or iv.');
  const manifestDir = path.resolve(root, config.manifestDir);
  if (!manifestDir.startsWith(root) || !existsSync(path.join(manifestDir, 'MODEL-MANIFEST.json'))) throw new Error(`D8 configuration ${config.label} requires its isolated manifest at ${config.manifestDir}/MODEL-MANIFEST.json.`);
  const suiteFile = path.resolve(suiteFileArg ?? '');
  const suiteDir = path.join(root, 'diagnostics', 'qvac-spike', 'chart-review', 'suite');
  if (path.dirname(suiteFile) !== suiteDir || !/^(dev|draft)-v\d+\.json$/.test(path.basename(suiteFile))) throw new Error('Suite file must be a versioned file inside chart-review/suite.');
  let modelLabel: string | undefined;
  for (let index = 0; index < rest.length; index++) {
    if (rest[index] === '--model-label') { modelLabel = rest[++index]; if (!modelLabel || !/^[A-Z0-9_]+$/.test(modelLabel)) throw new Error('Unsafe model label.'); }
    else throw new Error(`Unknown argument ${rest[index]}.`);
  }
  const modelDirectory = path.join(root, '.local', 'models');
  const verified = await verifyModels(manifestDir, modelDirectory, 'review');
  if (verified.sdkVersion !== '0.18.2') throw new Error('Isolated manifest must pin SDK 0.18.2.');
  if (verified.assets[0].constant !== config.modelConstant) throw new Error(`D8 configuration ${config.label} requires model ${config.modelConstant}; the manifest resolves ${verified.assets[0].constant}.`);
  const draftVerified = await verifyModels(manifestDir, modelDirectory, 'query');
  if (draftVerified.assets[0].constant !== config.modelConstant) throw new Error('Question cases must use the same model under test: draft role must match the review asset.');
  const modelManifest = JSON.parse(await readFile(path.join(manifestDir, 'MODEL-MANIFEST.json'), 'utf8'));
  const label = modelLabel ?? verified.assets[0].constant;

  const suiteBytes = await readFile(suiteFile);
  const suite = JSON.parse(suiteBytes.toString('utf8'));
  if (suite.task !== 'what-changed-and-unclear' || !Array.isArray(suite.cases)) throw new Error('Unsupported suite file.');
  const goldConfirmedByHuman = existsSync(path.join(root, '.local', 'cells', 'shared', 'SUITE-FROZEN.md'));
  const promptModuleSha256 = sha256(await readFile(path.join(root, 'packages', 'runtime', 'chart-review-prompts.ts')));
  const queryModuleSha256 = sha256(await readFile(path.join(root, 'packages', 'runtime', 'prompts.ts')));
  const loadConfiguration = {ctx_size: config.ctxSize, device: 'gpu', gpu_layers: 99, 'main-gpu': 'dedicated', parallel: 1, verbosity: 0};
  const generationConfiguration = {temp: 0, seed: 42, predict: config.predict, reasoning_budget: config.reasoningBudget, captureThinking: config.captureThinking, stream: true, kvCache: false, structured: config.structured};
  if (config.structured && (config.reasoningBudget !== CHART_REVIEW_GENERATION.reasoning_budget || config.predict !== CHART_REVIEW_GENERATION.predict)) throw new Error('Structured D8 configurations must match the runtime review generation constants.');

  const cases = suite.cases.map((entry: any) => {
    const packet = bindChartReviewPacket(entry, suite.evidenceBudgetChars);
    const questionSources = entry.question != null
      ? [packet.current, ...packet.historical].map((evidence, index) => ({sourceId: `N${index + 1}`, text: evidence.text}))
      : null;
    return {
      id: entry.id, split: entry.split, category: entry.category, categories: entry.categories,
      question: entry.question, abstentionExpected: entry.abstentionExpected, packet,
      reviewHistory: chartReviewHistory(packet), reviewResponseFormat: chartReviewResponseFormat(packet),
      questionSources
    };
  });
  const prefix = path.join(root, 'artifacts', 'evidence', `chart-review-${id}`);
  const protocol = {
    schemaVersion: 1, synthetic: true, releaseAccepted: false, createdAt: new Date().toISOString(),
    scope: 'Chart-review evaluation over synthetic suite cases through the runtime review operation (structured configurations) or a direct-SDK thinking path (unstructured configurations); question cases additionally through the query operation with the same model. No clinical reliability claim.',
    id, modelLabel: label, split: suite.split, heldOut: suite.split === 'held-out',
    goldConfirmedByHuman, suiteFrozenFlag: suite.frozen === true,
    // Fix round 3 (verify3-glm.txt / verify3-evidence.txt SS3): worker.ts now always writes
    // output.stopReason (null when the SDK supplied none). This flag tells the read-only
    // verifier that every record in this run was produced after that fix, so it must assert
    // key presence on the structured (i)/(iii) path exactly like it already does on the
    // unstructured (ii)/(iv) path. Never set on records this cell did not itself produce.
    stopReasonKeyGuaranteed: true,
    targets: CHART_REVIEW_TARGETS,
    d8: config,
    promptVersion: CHART_REVIEW_PROMPT_VERSION, promptModuleSha256, queryModuleSha256,
    suiteFile: path.relative(root, suiteFile).replaceAll('\\', '/'), suiteSha256: sha256(suiteBytes),
    manifestDir: path.relative(root, manifestDir).replaceAll('\\', '/'), modelManifest,
    verifiedAssets: verified.assets, draftAssets: draftVerified.assets,
    loadConfiguration, generationConfiguration, cases
  };
  await writeFile(`${prefix}-protocol.json`, JSON.stringify(protocol, null, 2), {flag: 'wx'});
  const protocolSha256 = sha256(await readFile(`${prefix}-protocol.json`));

  const packetIds = (fixture: any) => ['C1', ...fixture.packet.historical.map((h: any) => h.evidenceId)];
  const outcomes: {entry: any; record: any; score: CaseScore}[] = [];
  const writeCase = async (fixture: any, record: any) => {
    await writeFile(`${prefix}-${fixture.id}.json`, JSON.stringify(record, null, 2), {flag: 'wx'});
  };
  const runQueryCase = async (runtime: QvacRuntime, fixture: any, entry: any, record: any) => {
    const query = await withGpuLease(signal => runtime.answerApprovedNotes({question: entry.question, sources: fixture.questionSources, signal}));
    assertCompleteMetrics(query.result.metrics);
    let sourceIds: string[] = [];
    try { sourceIds = JSON.parse(query.result.text).sourceIds ?? []; } catch {}
    record.query = {text: query.result.text, metrics: query.result.metrics, lease: query.lease, sourceIds, abstained: sourceIds.length === 0, abstentionCorrect: (sourceIds.length === 0) === entry.abstentionExpected};
  };

  const runtime = new QvacRuntime({projectRoot: manifestDir, modelDirectory, onStage: event => console.log(JSON.stringify({runId: event.runId, stage: event.stage}))});
  try {
    if (config.structured) {
      for (const fixture of cases) {
        const entry = suite.cases.find((candidate: any) => candidate.id === fixture.id);
        console.log(JSON.stringify({starting: fixture.id, model: label, d8: config.label}));
        const record: any = {schemaVersion: 1, synthetic: true, heldOut: protocol.heldOut, releaseAccepted: false, goldConfirmedByHuman, protocolSha256, d8: config.label, caseId: fixture.id, packet: fixture.packet, status: 'succeeded'};
        try {
          const {result, lease} = await withGpuLease(signal => runtime.reviewChart({packet: fixture.packet, signal}));
          assertCompleteMetrics(result.metrics);
          if (result.metrics.output.sha256 !== sha256(result.text)) throw new Error('Review raw output digest mismatch.');
          record.lease = lease;
          record.review = {mode: 'runtime-review-operation', text: result.text, metrics: result.metrics};
          record.score = scoreChartReviewCase(entry, packetIds(fixture), result.text, result.metrics.output.stopReason);
          if (fixture.questionSources) await runQueryCase(runtime, fixture, entry, record);
          console.log(JSON.stringify({completed: fixture.id, runId: result.metrics.runId, casePassed: record.score.casePassed, thinking: result.metrics.output.thinking}));
        } catch (error) {
          record.status = 'failed';
          record.score = failedCaseScore(entry, false);
          record.failure = error instanceof RuntimeEvidenceError ? error.evidence : {error: String((error as Error).message ?? error)};
          console.error(JSON.stringify({failed: fixture.id, message: String((error as Error).message ?? error)}));
        }
        await writeCase(fixture, record);
        outcomes.push({entry, record, score: record.score});
      }
    } else {
      // Direct-SDK thinking path (D8 ii/iv): one lease, one load, all review cases.
      const asset = verified.assets[0];
      const modelIdentity = {constant: asset.constant, filename: asset.filename, sha256: asset.sha256, quantization: config.quantization};
      const tempDirectory = path.join(manifestDir, 'tmp-eval');
      await mkdir(tempDirectory, {recursive: true, mode: 0o700});
      const configPath = path.join(tempDirectory, 'qvac.config.json');
      await writeFile(configPath, JSON.stringify({cacheDirectory: modelDirectory, loggerLevel: 'off', loggerConsoleOutput: false, rpcInitTimeoutMs: 45000}), {mode: 0o600});
      process.env.QVAC_CONFIG_PATH = configPath;
      process.env.QVAC_WORKER_PATH = fileURLToPath(new URL('../../packages/runtime/bare-entry.js', import.meta.url));
      process.env.QVAC_RPC_INIT_TIMEOUT_MS = '45000';
      let sdk: typeof import('@qvac/sdk') | undefined;
      let modelo: Awaited<ReturnType<typeof cargar>> | undefined;
      const leaseByCase = new Map<string, unknown>();
      try {
        const {lease} = await withGpuLease(async (signal, leaseBefore) => {
          const leaseObservation = {observedForeignGpuProcesses: leaseBefore.observedForeignGpuProcesses, rawGpuComputeLines: leaseBefore.rawGpuComputeLines, checkedAt: leaseBefore.checkedAt};
          sdk = await import('@qvac/sdk');
          sdk.profiler.enable({mode: 'verbose', includeResourceGauges: true});
          const performanceRows: Record<string, unknown>[] = [];
          modelo = await cargar(sdk, {modelSrc: asset.path, etiqueta: asset.constant, hardware: `${process.platform}-${process.arch}`, runId: `chart-review-${id}`, sdkVersion: verified.sdkVersion, modelConfig: loadConfiguration}, row => performanceRows.push(row));
          const loadRecord = {schemaVersion: 1, synthetic: true, leaseObservation, model: modelIdentity, loadMs: modelo.loadMs, loadConfig: loadConfiguration, loadedModelInfo: modelo.info, performanceRows, method: 'performance.now around await loadModel; single load serves every review case of this unstructured D8 run.'};
          for (const fixture of cases) {
            if (signal.aborted) throw new Error('GPU lease aborted.');
            const entry = suite.cases.find((candidate: any) => candidate.id === fixture.id);
            console.log(JSON.stringify({starting: fixture.id, model: label, d8: config.label, mode: 'direct-sdk-thinking'}));
            const record: any = {schemaVersion: 1, synthetic: true, heldOut: protocol.heldOut, releaseAccepted: false, goldConfirmedByHuman, protocolSha256, d8: config.label, caseId: fixture.id, packet: fixture.packet, status: 'succeeded', leaseObservation, load: {loadMs: modelo!.loadMs, modelId: modelo!.modelId}};
            try {
              const generationParams: Record<string, number> = {temp: 0, seed: 42, predict: config.predict, reasoning_budget: config.reasoningBudget};
              const request = {history: fixture.reviewHistory, generationParams, kvCache: false, stream: true, captureThinking: true, responseFormat: null, promptTemplateVersion: CHART_REVIEW_PROMPT_VERSION};
              const t0 = performance.now();
              let firstContentMs: number | undefined, firstThinkingMs: number | undefined, contentDeltaCount = 0, thinkingDeltaCount = 0, completionDoneObserved = false;
              const run = sdk!.completion({modelId: modelo!.modelId, stream: true, history: fixture.reviewHistory, kvCache: false, generationParams, captureThinking: true});
              const requestId = run.requestId;
              for await (const event of run.events) {
                if (event.type === 'contentDelta' && event.text) { firstContentMs ??= performance.now() - t0; contentDeltaCount++; }
                if (event.type === 'thinkingDelta' && event.text) { firstThinkingMs ??= performance.now() - t0; thinkingDeltaCount++; }
                if (event.type === 'completionDone') completionDoneObserved = true;
              }
              const final = await run.final;
              const wallMs = performance.now() - t0;
              const stats = final.stats;
              const extraction = extractChartReviewJson(final.contentText);
              record.review = {
                mode: 'direct-sdk-thinking', text: final.contentText, requestId, request,
                output: {
                  sha256: digestText(final.contentText), characters: final.contentText.length,
                  stopReason: final.stopReason ?? null,
                  thinking: {captured: true, textLength: final.thinkingText?.length ?? 0, deltaCount: thinkingDeltaCount},
                  rawFullTextSha256: digestText(final.raw.fullText),
                  contentDeltaCount, completionDoneObserved
                },
                extraction: {firstPassValid: extraction.ok, error: extraction.error ?? null},
                native: stats,
                timings: {
                  completionWall: {value: wallMs, unit: 'ms', method: 'performance.now from completion invocation through final resolution'},
                  timeToFirstContent: {value: firstContentMs, unit: 'ms', method: 'performance.now to first nonempty contentDelta; visible-answer latency when thinking is separated'},
                  timeToFirstThinking: {value: firstThinkingMs, unit: 'ms', method: 'performance.now to first nonempty thinkingDelta'},
                  nativeTimeToFirstToken: {value: stats?.timeToFirstToken, unit: 'ms', method: 'SDK CompletionStats.timeToFirstToken; native prefill time, not app TTFT'},
                  nativeThroughput: {value: stats?.tokensPerSecond, unit: 'tokens/s', method: 'SDK CompletionStats.tokensPerSecond; native decode throughput'}
                },
                model: modelIdentity, loadConfig: loadConfiguration
              };
              record.score = scoreChartReviewCase(entry, packetIds(fixture), final.contentText, final.stopReason ?? undefined);
              console.log(JSON.stringify({completed: fixture.id, requestId, casePassed: record.score.casePassed, firstPassValid: extraction.ok, thinkingLength: final.thinkingText?.length ?? 0}));
            } catch (error) {
              record.status = 'failed';
              record.score = failedCaseScore(entry, false);
              record.failure = {error: String((error as Error).message ?? error)};
              console.error(JSON.stringify({failed: fixture.id, message: String((error as Error).message ?? error)}));
            }
            outcomes.push({entry, record, score: record.score});
          }
          (loadRecord as any).endedAt = new Date().toISOString();
          pendingLoad = loadRecord;
        });
        for (const outcome of outcomes) leaseByCase.set(outcome.record.caseId, lease);
        loadLease = lease;
      } finally {
        try { if (sdk && modelo) await descargar(sdk, modelo); } catch {}
        try { await sdk?.close(); } catch {}
        await rm(tempDirectory, {recursive: true, force: true});
      }
      if (pendingLoad) {
        (pendingLoad as any).leaseAfterObservation = loadLease ? {observedForeignGpuProcesses: (loadLease as any).after.observedForeignGpuProcesses, rawGpuComputeLines: (loadLease as any).after.rawGpuComputeLines, checkedAt: (loadLease as any).after.checkedAt} : null;
        await writeFile(`${prefix}-load.json`, JSON.stringify(pendingLoad, null, 2), {flag: 'wx'});
      }
      // Question cases run through the query operation with the same model under test.
      for (const outcome of outcomes) {
        const fixture = cases.find((candidate: any) => candidate.id === outcome.record.caseId);
        outcome.record.lease = leaseByCase.get(outcome.record.caseId);
        const entry = outcome.entry;
        if (fixture.questionSources && outcome.record.status === 'succeeded') {
          try { await runQueryCase(runtime, fixture, entry, outcome.record); }
          catch (error) {
            outcome.record.query = {failed: true, error: String((error as Error).message ?? error)};
            outcome.record.score = {...outcome.record.score, abstentionCorrect: false, casePassed: false};
            outcome.score = outcome.record.score;
          }
        }
        await writeCase(fixture, outcome.record);
      }
    }
  } finally {
    await runtime.close();
  }
  const scores = scoreChartReviewSuite(outcomes.map(outcome => outcome.score));
  const summary = {
    schemaVersion: 1, synthetic: true, heldOut: protocol.heldOut, releaseAccepted: false, goldConfirmedByHuman,
    protocolSha256, id, modelLabel: label, d8: config.label, split: suite.split, completed: outcomes.every(outcome => outcome.record.status === 'succeeded'),
    targets: CHART_REVIEW_TARGETS,
    targetsMet: {
      goldRecallStrict: scores.goldRecallStrict !== null && scores.goldRecallStrict >= CHART_REVIEW_TARGETS.goldRecallStrictMin,
      prohibitedViolations: scores.casesWithViolations <= CHART_REVIEW_TARGETS.prohibitedViolationsMax,
      schemaValidRate: scores.schemaValidRate >= CHART_REVIEW_TARGETS.schemaValidRateMin,
      abstentionAccuracy: scores.abstentionAccuracy === null || scores.abstentionAccuracy >= CHART_REVIEW_TARGETS.abstentionAccuracyMin
    },
    scores,
    queryAbstention: outcomes.filter(outcome => outcome.record.query).map(outcome => ({caseId: outcome.record.caseId, abstained: outcome.record.query.abstained ?? null, correct: outcome.record.query.abstentionCorrect ?? null, failed: outcome.record.query.failed === true || undefined})),
    cases: outcomes.map(outcome => ({
      id: outcome.record.caseId, status: outcome.record.status, casePassed: outcome.score.casePassed,
      firstPassValid: outcome.record.review?.extraction?.firstPassValid,
      runId: outcome.record.review?.metrics?.runId ?? outcome.record.review?.requestId, score: outcome.score,
      metrics: outcome.record.review?.metrics, failure: outcome.record.failure ? true : undefined
    }))
  };
  await writeFile(`${prefix}-summary.json`, JSON.stringify(summary, null, 2), {flag: 'wx'});
  console.log(JSON.stringify({completed: summary.completed, cases: outcomes.length, casePassRate: scores.casePassRate, goldRecallStrict: scores.goldRecallStrict, targetsMet: summary.targetsMet}));
}
let pendingLoad: Record<string, unknown> | undefined;
let loadLease: unknown;
// Run only as a script; tests import D8_CONFIGS/extractChartReviewJson without executing main.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
