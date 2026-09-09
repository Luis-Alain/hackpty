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
