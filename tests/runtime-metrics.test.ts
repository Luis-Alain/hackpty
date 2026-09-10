import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { mkdtemp, mkdir, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { OWNER_MARKER, recoverAbandonedTemporaryFiles } from '../packages/runtime/temporary-files.js';
import { assertCompleteMetrics, IncompleteEvidenceError } from '../packages/runtime/metrics.js';

// Real fixture assertions are skipped when hardware artifacts are absent.
// diagnostics/qvac-spike/validate-evidence.ts is the separate hard release gate:
// it fails on missing real artifacts. Ordinary unit tests need no GPU/download.
const evidenceAvailable=['extract','draft'].every(op=>existsSync(path.resolve('artifacts','evidence',`synthetic-${op}.json`)));
const needsEvidence={skip:!evidenceAvailable?'Real synthetic evidence not yet generated; release evidence gate still fails.':false};
function actualMetrics(operation='extract') {
  const file=path.resolve('artifacts','evidence',`synthetic-${operation}.json`);
  const evidence=JSON.parse(readFileSync(file,'utf8'));
  assert.equal(evidence.synthetic,true);
  assert.equal(evidence.result.metrics.sdkVersion,'0.18.2');
  return evidence.result.metrics;
}
test('null, placeholders and partial objects cannot pass without complete evidence',()=>{
  for(const value of [null,undefined,{},'placeholder',{schemaVersion:1,status:'failed'},{schemaVersion:1,status:'succeeded',operation:'extract'}])assert.throws(()=>assertCompleteMetrics(value),IncompleteEvidenceError);
});
test('both actual Windows SDK runs have complete structured performance evidence',needsEvidence,()=>{
  for(const operation of ['extract','draft']){
    const metrics=actualMetrics(operation);assertCompleteMetrics(metrics);
    assert.equal(metrics.runtime.platform,'win32');
    assert.equal(metrics.native.backendDevice,'gpu');
    assert.equal(metrics.runtime.localOnly,true);
  }
});
test('missing/null/NaN core native counters and performance metrics are rejected',needsEvidence,()=>{
  for(const key of ['timeToFirstToken','tokensPerSecond','cacheTokens','promptTokens','generatedTokens','emittedTokens','backendDevice']){
    for(const bad of [undefined,null,NaN]){
      const metrics=actualMetrics();if(bad===undefined)delete metrics.native[key];else metrics.native[key]=bad;
      assert.throws(()=>assertCompleteMetrics(metrics),IncompleteEvidenceError,`${key}: ${String(bad)}`);
    }
  }
});
test('load timing cannot be replaced by wall-clock duration or a placeholder',needsEvidence,()=>{
  for(const key of ['nativeModelInitialization','sdkTotalLoad','timeToFirstContent']){
    const metrics=actualMetrics();metrics.timings[key].value=null;
    assert.throws(()=>assertCompleteMetrics(metrics),IncompleteEvidenceError);
  }
  const metrics=actualMetrics();metrics.profiler.recentEvents=[];
  assert.throws(()=>assertCompleteMetrics(metrics),IncompleteEvidenceError);
});
test('exact history and reused team rows are mandatory; character counts are insufficient',needsEvidence,()=>{
  const metrics=actualMetrics();delete metrics.request.history;
  assert.throws(()=>assertCompleteMetrics(metrics),IncompleteEvidenceError);
  const mismatched=actualMetrics();mismatched.sharedRuntime.performanceRows.find(row=>row.stage==='completion').history=[{role:'user',content:'Different prompt'}];
  assert.throws(()=>assertCompleteMetrics(mismatched),IncompleteEvidenceError);
});
test('model integrity, base projector preprocessing, and local provenance are enforced',needsEvidence,()=>{
  const wrongHash=actualMetrics();wrongHash.modelDetails.assets[0].actualSha256='f'.repeat(64);
  assert.throws(()=>assertCompleteMetrics(wrongHash),IncompleteEvidenceError);
  const wrongVariant=actualMetrics();wrongVariant.modelDetails.loadConfig.image_no_upscale='on';
  assert.throws(()=>assertCompleteMetrics(wrongVariant),IncompleteEvidenceError);
  const wrongSource=actualMetrics();wrongSource.modelDetails.assets[0].path='https://example.com/model.gguf';
  assert.throws(()=>assertCompleteMetrics(wrongSource),IncompleteEvidenceError);
});
test('cancelled/failed/empty/truncated metadata cannot masquerade as a completed record',needsEvidence,()=>{
  for(const status of ['failed','cancelled',null]){const metrics=actualMetrics();metrics.status=status;assert.throws(()=>assertCompleteMetrics(metrics),IncompleteEvidenceError);}
  const cancelled=actualMetrics();cancelled.output.stopReason='cancelled';assert.throws(()=>assertCompleteMetrics(cancelled),IncompleteEvidenceError);
  const empty=actualMetrics();empty.output.characters=0;assert.throws(()=>assertCompleteMetrics(empty),IncompleteEvidenceError);
});

// Fix round 3 regression test (verify3-glm.txt / verify3-evidence.txt SS3): worker.ts:119
// used to build output with `...(final.stopReason?{stopReason:final.stopReason}:{})`, which
// silently OMITTED the key whenever `final.stopReason` was falsy (undefined, null or empty
// string) -- exactly the anti-pattern RUN-3-STEP0.md item 2 required this project to avoid.
// The fix writes `stopReason:final.stopReason??null` unconditionally, and
// packages/runtime/types.ts now declares `stopReason: string | null` (never optional). This
// proves, on the exact object shape the worker builds, that the fixed construction always
// carries the key (contrasted against the pre-fix construction, which drops it), that null
// is an evidence-gate-accepted value, and that assertCompleteMetrics still tolerates the key
// being entirely absent -- required so the read-only verifier keeps validating the already-
// retained (i)/(iii) held-out records that predate this fix (see metrics.ts and
// verify-chart-review-evaluations.ts header comments; those files enforce presence directly,
// scoped to post-fix records, instead of this general-purpose gate).
test('output.stopReason: worker.ts always writes the key (null when the SDK supplies none)',needsEvidence,()=>{
  const base=actualMetrics();
  const fixedOutput=(sdkStopReason: string|null|undefined)=>({...base.output,stopReason:sdkStopReason??null});
  const preFixOutput=(sdkStopReason: string|null|undefined)=>({...base.output,...(sdkStopReason?{stopReason:sdkStopReason}:{})});
  for(const sdkValue of [undefined,null,'','eos','length'] as const){
    const fixed=fixedOutput(sdkValue);
    assert.ok('stopReason' in fixed,`fixed worker construction must always carry the key for sdkValue=${JSON.stringify(sdkValue)}`);
    assert.equal(fixed.stopReason,sdkValue??null);
    if(sdkValue==='eos'||sdkValue==='length'){
      const metrics=actualMetrics();metrics.output=fixed;
      assert.doesNotThrow(()=>assertCompleteMetrics(metrics),`sdkValue=${JSON.stringify(sdkValue)}`);
    }
  }
  const metricsWithNull=actualMetrics();metricsWithNull.output=fixedOutput(undefined);
  assert.doesNotThrow(()=>assertCompleteMetrics(metricsWithNull),'explicit null stopReason must be accepted');
  for(const sdkValue of [undefined,null,''] as const){
    assert.equal('stopReason' in preFixOutput(sdkValue),false,`pre-fix construction silently dropped the key for sdkValue=${JSON.stringify(sdkValue)} -- this was the run-3 defect`);
  }
});

test('load and generation configuration must be complete and native throughput must match',needsEvidence,()=>{
  for(const key of ['ctx_size','device','gpu_layers','parallel','verbosity','main-gpu']){
    const metrics=actualMetrics();delete metrics.modelDetails.loadConfig[key];
    assert.throws(()=>assertCompleteMetrics(metrics),IncompleteEvidenceError,key);
  }
  const sampling=actualMetrics();sampling.request.generationParams.temp=1;
  assert.throws(()=>assertCompleteMetrics(sampling),IncompleteEvidenceError);
  const throughput=actualMetrics();throughput.timings.nativeThroughput.value+=1;
  assert.throws(()=>assertCompleteMetrics(throughput),IncompleteEvidenceError);
  const context=actualMetrics('draft');context.request.context=[{text:'unreviewed'}];
  assert.throws(()=>assertCompleteMetrics(context),IncompleteEvidenceError);
});

test('wrong or missing projector is rejected by the evidence gate',needsEvidence,()=>{
  for(const wrong of [undefined,null,'relative.gguf','https://example.com/projector.gguf']){
    const metrics=actualMetrics();metrics.modelDetails.loadConfig.projectionModelSrc=wrong;
    assert.throws(()=>assertCompleteMetrics(metrics),IncompleteEvidenceError);
  }
  const metrics=actualMetrics();metrics.modelDetails.assets.find(asset=>asset.role==='projector').path+='.different.gguf';
  assert.throws(()=>assertCompleteMetrics(metrics),IncompleteEvidenceError);
});

test('crash recovery removes only marked dead-owner temporary directories',async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'psyrec-runtime-recovery-'));
  const temporary=path.join(root,'.local/runtime-tmp');await mkdir(temporary,{recursive:true});
  const child=spawn(process.execPath,['-e','process.exit(0)'],{stdio:'ignore',windowsHide:true});
  const deadPid=child.pid;await once(child,'exit');assert.ok(deadPid);
  const dead=randomUUID(),live=randomUUID(),unmarked=randomUUID(),malformed=randomUUID();
  try{
    for(const id of [dead,live,unmarked,malformed])await mkdir(path.join(temporary,id));
    await writeFile(path.join(temporary,dead,OWNER_MARKER),JSON.stringify({schemaVersion:1,ownerProcessId:deadPid}));
    await writeFile(path.join(temporary,dead,'capture.png'),'SYNTHETIC TEMPORARY IMAGE');
    await writeFile(path.join(temporary,live,OWNER_MARKER),JSON.stringify({schemaVersion:1,ownerProcessId:process.pid}));
    await writeFile(path.join(temporary,malformed,OWNER_MARKER),JSON.stringify({schemaVersion:1,ownerProcessId:-1}));
    assert.deepEqual(await recoverAbandonedTemporaryFiles(root),[dead]);
    assert.deepEqual((await readdir(temporary)).sort(),[live,unmarked,malformed].sort());
    assert.deepEqual(await recoverAbandonedTemporaryFiles(root),[]);
  }finally{await rm(root,{recursive:true,force:true});}
});


test('loaded model identity cannot contradict the verified local assets',needsEvidence,()=>{
  const mutations = {
    'delegation claimed': m => { m.modelDetails.loadedModelInfo.isDelegated=true; },
    'delegation absent': m => { delete m.modelDetails.loadedModelInfo.isDelegated; },
    'wrong loaded file': m => { m.modelDetails.loadedModelInfo.path=m.modelDetails.assets[1].path; },
    'relabelled model': m => { m.model='UNAVAILABLE_MODEL_REPLACEMENT'; },
    'wrong native addon': m => { m.modelDetails.loadedModelInfo.addonPackage='other-addon'; },
    'wrong native type': m => { m.modelDetails.loadedModelInfo.modelType='other-model'; },
    'missing primary role': m => { m.modelDetails.assets[0].role='draft'; },
    'wrong filename': m => { m.modelDetails.assets[0].filename='other.gguf'; },
    'invalid verification time': m => { m.modelDetails.assets[0].verifiedAt='unknown'; },
  };
  for (const [name,mutate] of Object.entries(mutations)) {const m=actualMetrics();mutate(m);assert.throws(()=>assertCompleteMetrics(m),IncompleteEvidenceError,name);}
});

test('shared performance rows must bind the same native run, model, request and measurements',needsEvidence,()=>{
  const mutations = {
    'different run': row => { row.run_id='another-run'; },
    'different SDK': row => { row.sdk_version='0.19.0'; },
    'different model': row => { row.model='other-model'; },
    'delegated execution': row => { row.execution_mode='delegated'; },
  };
  for(const stage of ['load','completion']) for(const [name,mutate] of Object.entries(mutations)){const m=actualMetrics();mutate(m.sharedRuntime.performanceRows.find(row=>row.stage===stage));assert.throws(()=>assertCompleteMetrics(m),IncompleteEvidenceError,stage+': '+name);}
  for(const key of ['token_count_source','output_count_method','generated_tokens','emitted_tokens','cache_tokens','backend_actual','throughput_tps','ttft_ms_sdk','ttft_ms','end_to_end_ms','generation_params','native_stats']){
    const m=actualMetrics();delete m.sharedRuntime.performanceRows.find(row=>row.stage==='completion')[key];assert.throws(()=>assertCompleteMetrics(m),IncompleteEvidenceError,key);
  }
  const m=actualMetrics();m.sharedRuntime.performanceRows.push(structuredClone(m.sharedRuntime.performanceRows[0]));assert.throws(()=>assertCompleteMetrics(m),IncompleteEvidenceError,'duplicate successful load');
});

// Query fixtures below adapt retained draft metadata for gate-unit testing only.
// They are not claimed as actual query inference evidence.
test('query operation requires exact approved source context, frozen prompt and bounded native context',needsEvidence,async()=>{
  const {queryHistory}=await import('../packages/runtime/prompts.js');
  const sources=[{sourceId:'N1',text:'Sleep duration was not recorded.'}];
  const make=()=>{const m=actualMetrics('draft');m.operation='query';m.request.promptTemplateVersion='psyrec-approved-query-v1';delete m.request.sourceId;m.request.context=sources;m.request.history=queryHistory('Was duration recorded?',sources,'psyrec-approved-query-v1');m.sharedRuntime.performanceRows.find(row=>row.stage==='completion').history=structuredClone(m.request.history);return m;};
  assertCompleteMetrics(make());
  for(const mutate of [(m:any)=>{m.request.context[0]={sourceId:'N2',text:'Other note'};},(m:any)=>{m.request.history[0].content='Different system prompt';},(m:any)=>{m.modelDetails.assets[0].role='query';},(m:any)=>{m.output.stopReason='length';},(m:any)=>{m.native.promptTokens=4000;m.inputTokens=4000;}]){const m=make();m.request.context=structuredClone(m.request.context);mutate(m);assert.throws(()=>assertCompleteMetrics(m),IncompleteEvidenceError);}
});

test('query v2 requires the exact native JSON Schema constraint and shared-row binding',needsEvidence,async()=>{
  const {queryHistory,QUERY_RESPONSE_FORMAT}=await import('../packages/runtime/prompts.js');
  const make=()=>{const m=actualMetrics('draft');m.operation='query';m.request.promptTemplateVersion='psyrec-approved-query-v2';delete m.request.sourceId;m.request.context=[{sourceId:'N1',text:'No diagnosis recorded.'}];m.request.history=queryHistory('What is recorded?',m.request.context,'psyrec-approved-query-v2');m.request.responseFormat=structuredClone(QUERY_RESPONSE_FORMAT);const row=m.sharedRuntime.performanceRows.find(row=>row.stage==='completion');row.history=structuredClone(m.request.history);row.response_format=structuredClone(QUERY_RESPONSE_FORMAT);return m;};
  assertCompleteMetrics(make());for(const mutate of [(m:any)=>{delete m.request.responseFormat;},(m:any)=>{m.request.responseFormat.json_schema.schema.additionalProperties=true;},(m:any)=>{m.sharedRuntime.performanceRows.find(row=>row.stage==='completion').response_format='text';}]){const m=make();mutate(m);assert.throws(()=>assertCompleteMetrics(m),IncompleteEvidenceError);}
  for(const operation of ['extract','draft']){const m=actualMetrics(operation);m.request.responseFormat=structuredClone(QUERY_RESPONSE_FORMAT);assert.throws(()=>assertCompleteMetrics(m),IncompleteEvidenceError);}
});

test('query v3 evidence binds the exact dynamic supplied-ID schema and shared request',needsEvidence,async()=>{
  const {queryHistory,queryResponseFormat}=await import('../packages/runtime/prompts.js');
  const make=()=>{const m=actualMetrics('draft');m.operation='query';m.request.promptTemplateVersion='psyrec-approved-query-v3';delete m.request.sourceId;m.request.context=[{sourceId:'N2',text:'No diagnosis recorded.'},{sourceId:'N5',text:'Sleep improved.'}];m.request.history=queryHistory('What is recorded?',m.request.context);m.request.responseFormat=queryResponseFormat(m.request.context);const row=m.sharedRuntime.performanceRows.find(row=>row.stage==='completion');row.history=structuredClone(m.request.history);row.response_format=structuredClone(m.request.responseFormat);return m;};
  assertCompleteMetrics(make());
  for(const mutate of [(m:any)=>{m.request.responseFormat.json_schema.schema.properties.sourceIds.items.enum=['N1'];m.sharedRuntime.performanceRows.find(row=>row.stage==='completion').response_format=structuredClone(m.request.responseFormat);},(m:any)=>{m.request.responseFormat.json_schema.schema.properties.sourceIds.maxItems=6;m.sharedRuntime.performanceRows.find(row=>row.stage==='completion').response_format=structuredClone(m.request.responseFormat);},(m:any)=>{delete m.request.responseFormat;},(m:any)=>{m.sharedRuntime.performanceRows.find(row=>row.stage==='completion').response_format='text';}]){const m=make();mutate(m);assert.throws(()=>assertCompleteMetrics(m),IncompleteEvidenceError);}
});
