import { basename, isAbsolute } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import type { RunMetrics } from './types.js';
import { QUERY_PROMPT_VERSION, QUERY_LEGACY_PROMPT_VERSION, QUERY_STRUCTURED_PROMPT_VERSION, queryResponseFormat, queryHistory, validateQueryInput } from './prompts.js';
import { CHART_REVIEW_PROMPT_VERSION, CHART_REVIEW_GENERATION, CHART_REVIEW_CAPTURE_THINKING } from './chart-review-prompts.js';

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
  if (!['extract', 'draft', 'query', 'review'].includes(m.operation)) fail('operation');
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
  const primary = assets.filter(asset => asset.role === (m.operation === 'query' ? 'draft' : m.operation));
  const projectors = assets.filter(asset => asset.role === 'projector');
  if (primary.length !== 1 || projectors.length !== (m.operation === 'extract' ? 1 : 0) || new Set(assets.map(asset => asset.path)).size !== assets.length) fail('modelDetails.assets.roles');
  if (m.model !== primary[0].constant || loaded.path !== primary[0].path) fail('loadedModelInfo.assetBinding');
  object(m.request, 'request');
  if (m.request.kvCache !== false || m.request.stream !== true || !Array.isArray(m.request.context) || (m.operation!=='query'&&m.request.context.length!==0)) fail('request.configuration');
  text(m.request.promptTemplateVersion, 'request.promptTemplateVersion');
  if (!Array.isArray(m.request.history) || !m.request.history.length) fail('request.history');
  for (const message of m.request.history) {
    object(message, 'request.history.message'); text(message.role, 'message.role'); text(message.content, 'message.content');
    if (message.attachments) for (const a of message.attachments) if (!a || !isAbsolute(a.path)) fail('message.attachment.path');
  }
  if (!m.request.history.some(message => message.role === 'user')) fail('request.history.user');
  object(m.request.generationParams, 'request.generationParams');
  for (const key of ['temp','seed','predict']) number(m.request.generationParams[key], `generationParams.${key}`);
  if(m.request.generationParams.temp!==0||m.request.generationParams.seed!==42)fail('generationParams.configuration');
  if(m.operation==='review'){if(!isDeepStrictEqual(m.request.generationParams,{...CHART_REVIEW_GENERATION}))fail('generationParams.reviewConfiguration');}
  else if(m.request.generationParams.predict!==768)fail('generationParams.configuration');
  if (m.operation === 'extract') {
    object(m.request.attachment, 'request.attachment'); digest(m.request.attachment.sha256, 'attachment.sha256'); number(m.request.attachment.bytes, 'attachment.bytes', 1, true);
    if (!['image/png','image/jpeg'].includes(m.request.attachment.mime) || !m.request.history.some(message => message.attachments?.length)) fail('attachment');
    if ('image_no_upscale' in config || typeof config.projectionModelSrc!=='string' || !isAbsolute(config.projectionModelSrc) || config['mmproj-use-gpu']!==true || !assets.some(asset=>asset.role==='projector'&&asset.path===config.projectionModelSrc)) fail('base.projector.config');
  } else if (m.operation === 'review') {
    if(m.request.captureThinking!==CHART_REVIEW_CAPTURE_THINKING)fail('review.captureThinking');
    if(m.request.promptTemplateVersion!==CHART_REVIEW_PROMPT_VERSION||m.request.history.length!==2)fail('review.profile');
    const user=m.request.history[1];
    if(user.role!=='user'||!user.content.startsWith('Evidence JSON (permitted evidenceIds: '))fail('review.history');
    const format:any=m.request.responseFormat;
    if(format?.type!=='json_schema'||format?.json_schema?.name!=='chart_review'||format?.json_schema?.strict!==true)fail('review.responseFormat');
    const permitted=user.content.slice('Evidence JSON (permitted evidenceIds: '.length,user.content.indexOf('):')).split(', ');
    const enumIds=format?.json_schema?.schema?.properties?.findings?.items?.properties?.evidenceIds?.items?.enum;
    if(!Array.isArray(permitted)||!permitted.length||!isDeepStrictEqual(enumIds,permitted))fail('review.evidenceIdBinding');
    const thinking=m.output?.thinking;
    if(!thinking||thinking.captured!==true)fail('review.thinking');
    number(thinking.textLength,'review.thinking.textLength',0,true);number(thinking.deltaCount,'review.thinking.deltaCount',0,true);
  } else if (m.operation === 'draft') {
    if(config.reasoning_budget!==0||m.request.generationParams.reasoning_budget!==0)fail('text.reasoning_budget');
    if(m.request.attachment||m.request.history.some(message=>message.attachments?.length))fail('text.attachment');
    text(m.request.sourceId, 'request.sourceId');
  }
  if(m.operation==='query') {
    if(config.reasoning_budget!==0||m.request.generationParams.reasoning_budget!==0)fail('text.reasoning_budget');
    if(m.request.attachment||m.request.history.some(message=>message.attachments?.length))fail('text.attachment');
    if(![QUERY_PROMPT_VERSION,QUERY_STRUCTURED_PROMPT_VERSION,QUERY_LEGACY_PROMPT_VERSION].includes(m.request.promptTemplateVersion)||m.request.sourceId!==undefined||m.request.history.length!==2)fail('query.profile');
    const user=m.request.history[1];
    const prefix='Select exact supporting quotations for this JSON-encoded question and source data:\n';
    const suffix='\n/no_think';
    let payload:any;
    try {if(user.role!=='user'||!user.content.startsWith(prefix)||!user.content.endsWith(suffix))fail('query.history');payload=JSON.parse(user.content.slice(prefix.length,-suffix.length));validateQueryInput(payload.question,payload.sources);} catch {fail('query.sources');}
    if(!isDeepStrictEqual(m.request.responseFormat,queryResponseFormat(payload.sources,m.request.promptTemplateVersion)))fail('query.responseFormat');
    if(!isDeepStrictEqual(payload.sources,m.request.context)||!isDeepStrictEqual(queryHistory(payload.question,payload.sources,m.request.promptTemplateVersion),m.request.history))fail('query.contextBinding');
  }
  if(m.operation!=='query'&&m.operation!=='review'&&m.request.responseFormat!==undefined)fail('request.unexpectedResponseFormat');
  object(m.native, 'native');
  for (const key of ['promptTokens','generatedTokens','emittedTokens']) number(m.native[key], `native.${key}`, 1, true);
  number(m.native.cacheTokens, 'native.cacheTokens', 0, true);
  for (const key of ['timeToFirstToken','tokensPerSecond']) number(m.native[key], `native.${key}`, Number.MIN_VALUE);
  if (!['cpu','gpu'].includes(m.native.backendDevice)) fail('native.backendDevice');
  if (m.inputTokens !== m.native.promptTokens || m.outputTokens !== m.native.emittedTokens || m.tokensPerSecond !== m.native.tokensPerSecond || m.ttftMs !== m.native.timeToFirstToken) fail('native.aliases');
  if(m.operation==='query'&&(m.native.promptTokens+m.request.generationParams.predict>config.ctx_size||m.output?.stopReason==='length'))fail('query.contextOrOutputTruncated');
  object(m.output, 'output'); digest(m.output.sha256, 'output.sha256'); number(m.output.characters, 'output.characters', 1, true); number(m.output.contentDeltaCount, 'output.contentDeltaCount', 1, true);
  // Fix round 3: worker.ts now always writes this key (null when the SDK supplied none;
  // verify3-evidence.txt SS3), so null is an explicitly accepted value here. Presence itself
  // stays optional in this gate (not required) because the read-only verifier must keep
  // validating the already-retained (i)/(iii) held-out records, which predate the fix and
  // genuinely lack the key (artifacts/evidence/ is never edited); the verifier enforces
  // presence directly, scoped to records produced after the fix (see its header comment).
  if (m.output.stopReason !== undefined && m.output.stopReason !== null && !['eos','length','stopSequence'].includes(m.output.stopReason)) fail('output.stopReason');
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
  if(!isDeepStrictEqual(completion.response_format,m.request.responseFormat??'text'))fail('sharedRuntime.responseFormatBinding');
  text(completion.output_count_method,'sharedRuntime.output_count_method');
}
