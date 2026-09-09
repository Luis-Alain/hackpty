import { basename, isAbsolute } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import type { RunMetrics } from './types.js';

export class IncompleteEvidenceError extends Error {
  constructor(public field: string) {
    super(`Mandatory runtime evidence is missing or invalid: ${field}`);
    this.name = 'IncompleteEvidenceError';
  }
}
const fail = (field: string): never => { throw new IncompleteEvidenceError(field); };
function number(value: unknown, field: string, minimum = 0, integer = false) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || (integer && !Number.isInteger(value))) fail(field);
}
function text(value: unknown, field: string) {
  if (typeof value !== 'string' || !value.trim() || /^(unknown|unavailable|placeholder|null|n\/a)$/i.test(value.trim())) fail(field);
}
function digest(value: unknown, field: string) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value) || /^0+$/.test(value)) fail(field);
}
function object(value: unknown, field: string): asserts value is Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(field);
}
/** Reject incomplete successes. Failure evidence is recorded separately and cannot pass. */
export function assertCompleteMetrics(candidate: unknown): asserts candidate is RunMetrics {
  object(candidate, 'metrics'); const m = candidate;
  if (m.schemaVersion !== 1 || m.status !== 'succeeded') fail('schemaVersion/status');
  if (!['extract', 'draft'].includes(m.operation)) fail('operation');
  for (const key of ['runId', 'requestId', 'model', 'sdkVersion', 'measurementMethod', 'startedAt', 'endedAt']) text(m[key], key);
  if (!Number.isFinite(Date.parse(m.startedAt)) || !Number.isFinite(Date.parse(m.endedAt)) || Date.parse(m.endedAt) < Date.parse(m.startedAt)) fail('timestamps');
  for (const key of ['loadMs', 'durationMs', 'ttftMs', 'tokensPerSecond']) number(m[key], key, Number.MIN_VALUE);
  for (const key of ['inputTokens', 'outputTokens']) number(m[key], key, 1, true);
  object(m.runtime, 'runtime');
  for (const key of ['sdkVersion', 'inferenceVersion', 'addonVersion', 'nodeVersion', 'platform', 'arch', 'workerEntry']) text(m.runtime[key], `runtime.${key}`);
  if (m.runtime.sdk !== '@qvac/sdk' || m.runtime.sdkVersion !== m.sdkVersion || m.runtime.localOnly !== true || !['windows-named-pipe','unix-domain-socket'].includes(m.runtime.transport)) fail('runtime.identity');
  number(m.runtime.processId, 'runtime.processId', 1, true);
  if (!isAbsolute(m.runtime.workerEntry)) fail('runtime.workerEntry');
  object(m.modelDetails, 'modelDetails');
  text(m.modelDetails.modelId, 'modelDetails.modelId');
  if (m.modelDetails.type !== 'llamacpp-completion') fail('modelDetails.type');
  object(m.modelDetails.loadConfig, 'modelDetails.loadConfig');
  const config=m.modelDetails.loadConfig;
  if(config.device!=='gpu'||config.gpu_layers!==99||config.ctx_size!==4096||config.parallel!==1||config.verbosity!==0||config['main-gpu']!=='dedicated')fail('modelDetails.loadConfig.configuration');
  object(m.modelDetails.loadedModelInfo, 'modelDetails.loadedModelInfo');
  const loaded = m.modelDetails.loadedModelInfo;
  if (loaded.modelId !== m.modelDetails.modelId) fail('loadedModelInfo.modelId');
  if (loaded.isDelegated !== false || loaded.modelType !== m.modelDetails.type || loaded.addonPackage !== '@qvac/llm-llamacpp') fail('loadedModelInfo.localRuntime');
  const assets = m.modelDetails.assets;
  if (!Array.isArray(assets) || assets.length !== (m.operation === 'extract' ? 2 : 1)) fail('modelDetails.assets');
  for (const [index, asset] of assets.entries()) {
    object(asset, `assets[${index}]`);
    for (const key of ['id','constant','filename','path','verifiedAt']) text(asset[key], `assets[${index}].${key}`);
    if (!isAbsolute(asset.path) || !asset.path.endsWith('.gguf') || basename(asset.path) !== asset.filename) fail(`assets[${index}].path`);
    if (asset.modelType !== m.modelDetails.type || !Number.isFinite(Date.parse(asset.verifiedAt)) || Date.parse(asset.verifiedAt) > Date.parse(m.endedAt)) fail(`assets[${index}].identity`);
    number(asset.expectedBytes, 'asset.expectedBytes', 1, true); number(asset.actualBytes, 'asset.actualBytes', 1, true);
    digest(asset.sha256, 'asset.sha256'); digest(asset.actualSha256, 'asset.actualSha256');
    if (asset.sha256 !== asset.actualSha256 || asset.expectedBytes !== asset.actualBytes) fail('asset.integrity');
  }
  const primary = assets.filter(asset => asset.role === m.operation);
  const projectors = assets.filter(asset => asset.role === 'projector');
  if (primary.length !== 1 || projectors.length !== (m.operation === 'extract' ? 1 : 0) || new Set(assets.map(asset => asset.path)).size !== assets.length) fail('modelDetails.assets.roles');
  if (m.model !== primary[0].constant || loaded.path !== primary[0].path) fail('loadedModelInfo.assetBinding');
  object(m.request, 'request');
  if (m.request.kvCache !== false || m.request.stream !== true || !Array.isArray(m.request.context) || m.request.context.length!==0) fail('request.configuration');
  text(m.request.promptTemplateVersion, 'request.promptTemplateVersion');
  if (!Array.isArray(m.request.history) || !m.request.history.length) fail('request.history');
  for (const message of m.request.history) {
    object(message, 'request.history.message'); text(message.role, 'message.role'); text(message.content, 'message.content');
    if (message.attachments) for (const a of message.attachments) if (!a || !isAbsolute(a.path)) fail('message.attachment.path');
  }
  if (!m.request.history.some(message => message.role === 'user')) fail('request.history.user');
  object(m.request.generationParams, 'request.generationParams');
  for (const key of ['temp','seed','predict']) number(m.request.generationParams[key], `generationParams.${key}`);
  if(m.request.generationParams.temp!==0||m.request.generationParams.seed!==42||m.request.generationParams.predict!==768)fail('generationParams.configuration');
  if (m.operation === 'extract') {
    object(m.request.attachment, 'request.attachment'); digest(m.request.attachment.sha256, 'attachment.sha256'); number(m.request.attachment.bytes, 'attachment.bytes', 1, true);
    if (!['image/png','image/jpeg'].includes(m.request.attachment.mime) || !m.request.history.some(message => message.attachments?.length)) fail('attachment');
    if ('image_no_upscale' in config || typeof config.projectionModelSrc!=='string' || !isAbsolute(config.projectionModelSrc) || config['mmproj-use-gpu']!==true || !assets.some(asset=>asset.role==='projector'&&asset.path===config.projectionModelSrc)) fail('base.projector.config');
  } else {text(m.request.sourceId, 'request.sourceId');if(config.reasoning_budget!==0||m.request.generationParams.reasoning_budget!==0)fail('draft.reasoning_budget');}
  object(m.native, 'native');
  for (const key of ['promptTokens','generatedTokens','emittedTokens']) number(m.native[key], `native.${key}`, 1, true);
  number(m.native.cacheTokens, 'native.cacheTokens', 0, true);
  for (const key of ['timeToFirstToken','tokensPerSecond']) number(m.native[key], `native.${key}`, Number.MIN_VALUE);
  if (!['cpu','gpu'].includes(m.native.backendDevice)) fail('native.backendDevice');
  if (m.inputTokens !== m.native.promptTokens || m.outputTokens !== m.native.emittedTokens || m.tokensPerSecond !== m.native.tokensPerSecond || m.ttftMs !== m.native.timeToFirstToken) fail('native.aliases');
  object(m.output, 'output'); digest(m.output.sha256, 'output.sha256'); number(m.output.characters, 'output.characters', 1, true); number(m.output.contentDeltaCount, 'output.contentDeltaCount', 1, true);
  if (m.output.stopReason !== undefined && !['eos','length','stopSequence'].includes(m.output.stopReason)) fail('output.stopReason');
  if(m.output.completionDoneObserved!==true || m.output.finalPromiseResolved!==true)fail('output.termination');
  text(m.output.terminationMethod,'output.terminationMethod');
  object(m.timings, 'timings');
  for (const key of ['modelLoadWall','nativeModelInitialization','sdkTotalLoad','completionWall','timeToFirstContent','nativeTimeToFirstToken','nativeThroughput']) {
    object(m.timings[key], `timings.${key}`); number(m.timings[key].value, `timings.${key}.value`, Number.MIN_VALUE);
    text(m.timings[key].method, `timings.${key}.method`);
    if (m.timings[key].unit !== (key === 'nativeThroughput' ? 'tokens/s' : 'ms')) fail(`timings.${key}.unit`);
  }
  if (m.loadMs !== m.timings.modelLoadWall.value || m.durationMs !== m.timings.completionWall.value || m.ttftMs !== m.timings.nativeTimeToFirstToken.value || m.tokensPerSecond!==m.timings.nativeThroughput.value) fail('timing.aliases');
  object(m.profiler, 'profiler');
  if (!Array.isArray(m.profiler.recentEvents) || !m.profiler.recentEvents.some(event => event.op === 'loadModel' && event.gauges?.modelInitializationTime === m.timings.nativeModelInitialization.value && event.gauges?.totalLoadTime === m.timings.sdkTotalLoad.value)) fail('profiler.loadModel');
  object(m.sharedRuntime, 'sharedRuntime');
  if(m.sharedRuntime.commit !== '21f7f40736c201f8d3c14a36ced4cdb426639122' || !Array.isArray(m.sharedRuntime.performanceRows)) fail('sharedRuntime.provenance');
  const rows=m.sharedRuntime.performanceRows;
  const loads=rows.filter(row=>row.stage==='load'&&row.status==='ok');
  const completions=rows.filter(row=>row.stage==='completion'&&row.status==='ok');
  if (loads.length!==1 || completions.length!==1) fail('sharedRuntime.performanceRows');
  const load=loads[0], completion=completions[0];
  for (const row of [load,completion]) if(row.run_id!==m.runId || row.sdk_version!==m.sdkVersion || row.model!==m.model || row.execution_mode!=='local') fail('sharedRuntime.runBinding');
  if (load.load_ms!==m.loadMs || load.model_id!==m.modelDetails.modelId || load.model_source!==primary[0].path || load.fallback_a_local!==false || !isDeepStrictEqual(load.model_config,config) || !isDeepStrictEqual(load.loaded_model_info,loaded)) fail('sharedRuntime.loadBinding');
  if (completion.request_id!==m.requestId || completion.input_tokens!==m.inputTokens || completion.output_tokens!==m.outputTokens || completion.generated_tokens!==m.native.generatedTokens || completion.emitted_tokens!==m.native.emittedTokens || completion.cache_tokens!==m.native.cacheTokens || completion.token_count_source!=='sdk' || completion.backend_actual!==m.native.backendDevice || completion.throughput_tps!==m.tokensPerSecond || completion.ttft_ms_sdk!==m.ttftMs || completion.ttft_ms!==m.timings.timeToFirstContent.value || completion.end_to_end_ms!==m.durationMs || completion.kv_cache!==false || !isDeepStrictEqual(completion.native_stats,m.native) || !isDeepStrictEqual(completion.generation_params,m.request.generationParams) || !isDeepStrictEqual(completion.history,m.request.history)) fail('sharedRuntime.completionBinding');
  text(completion.output_count_method,'sharedRuntime.output_count_method');
}
