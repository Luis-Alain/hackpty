import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {QvacRuntime,RuntimeEvidenceError,assertCompleteMetrics} from '../../packages/runtime/index.js';
import {EXTRACTION_BASELINE,EXTRACTION_LINES,QUERY_PROMPT_VERSION,queryHistory,queryResponseFormat} from '../../packages/runtime/prompts.js';
import {SCORING_METHODS} from '../../packages/runtime/transcription-scoring.js';
import {transcriptionCases,sha256} from './transcription-cases.js';
import {scoreEvidence,summarizeScores} from './transcription-score.js';
import {withGpuLease} from './gpu-lease.js';
import {QUERY_CASES} from './query-evaluation.js';
import {scoreSourceSelection} from './source-selection-scoring.js';
const id=process.argv[2];if(!id||!/^20[0-9TZa-z-]+$/.test(id))throw new Error('Use a unique dated synthetic experiment ID.');
const root=process.cwd(),prefix=path.join(root,'artifacts/evidence','transcription-ablation-'+id),fixtures=await transcriptionCases(root);
const modelManifest=JSON.parse(await readFile(path.join(root,'MODEL-MANIFEST.json'),'utf8'));
const protocol={schemaVersion:1,synthetic:true,heldOut:false,releaseAccepted:false,createdAt:new Date().toISOString(),sdkVersion:'0.18.2',scope:'Predeclared comparison on six previously seen synthetic development images. Not model training, real handwriting reliability or physical release acceptance. Query tests exercise supplied excerpts, not end-to-end lexical retrieval.',baseline:EXTRACTION_BASELINE,candidate:EXTRACTION_LINES,modelManifest,loadConfiguration:{ctx_size:4096,device:'gpu',gpu_layers:99,'main-gpu':'dedicated',parallel:1,verbosity:0,'mmproj-use-gpu':true,image_no_upscale:'absent for the matching VisionPsy base pair'},generationConfiguration:{temp:0,seed:42,predict:768,stream:true,kvCache:false},scoringMethods:SCORING_METHODS,cases:fixtures.map(f=>({id:f.id,imageSha256:sha256(f.bytes),reference:f.reference,referenceSha256:sha256(f.reference),referenceMethod:f.referenceMethod,rules:f.rules,archivedBaselineFile:f.archivedFile})),queryProfile:{version:QUERY_PROMPT_VERSION,modelRole:'draft',reasoning_budget:0,cases:QUERY_CASES.map(f=>({...f,expectedSourceIds:f.expectedStatus==='answered'?['N1']:[],history:queryHistory(f.question,[...f.sources]),responseFormat:queryResponseFormat([...f.sources])}))},promotionRule:'No automatic production promotion. Coordinator reviews paired WER/CER, every critical rule, exact raw outputs and native metrics. Any regression blocks promotion pending an explicitly reviewed tradeoff and held-out evaluation.'};
await writeFile(prefix+'-protocol.json',JSON.stringify(protocol,null,2),{flag:'wx'});
const protocolSha256=sha256(await readFile(prefix+'-protocol.json'));
const runtime=new QvacRuntime({projectRoot:root,onStage:e=>console.log(JSON.stringify({runId:e.runId,stage:e.stage}))});
const outcomes:any[]=[],queries:any[]=[];
try{
  for(const fixture of fixtures){
    console.log(JSON.stringify({starting:fixture.id,operation:'extract',profile:EXTRACTION_LINES.version}));
    const {result,lease}=await withGpuLease(signal=>runtime.extractImageForEvaluation({bytes:fixture.bytes,mime:'image/png',signal}));
    const scored=scoreEvidence(fixture,{synthetic:true,result});
    const file=prefix+'-'+fixture.id+'.json';await writeFile(file,JSON.stringify({schemaVersion:1,synthetic:true,heldOut:false,releaseAccepted:false,protocolSha256,lease,...scored,result},null,2),{flag:'wx'});
    outcomes.push(scored);console.log(JSON.stringify({completed:fixture.id,runId:result.metrics.runId,wer:scored.score.wer.rate,cer:scored.score.cer.rate,failedRules:scored.score.clinical.filter(r=>!r.passed).map(r=>r.id),loadMs:result.metrics.loadMs,ttftMs:result.metrics.ttftMs,tokensPerSecond:result.metrics.tokensPerSecond,inputTokens:result.metrics.inputTokens,outputTokens:result.metrics.outputTokens}));
  }
  for(const fixture of QUERY_CASES){
    console.log(JSON.stringify({starting:fixture.id,operation:'query'}));
    const {result,lease}=await withGpuLease(signal=>runtime.answerApprovedNotes({question:fixture.question,sources:fixture.sources.map(s=>({...s})),signal}));assertCompleteMetrics(result.metrics);
    if(result.metrics.output.sha256!==sha256(result.text))throw new Error('Query raw output digest mismatch.');
    const score=scoreSourceSelection(result.text,{...fixture,expectedSourceIds:fixture.expectedStatus==='answered'?['N1']:[]}),record={schemaVersion:1,synthetic:true,releaseAccepted:false,protocolSha256,fixture,lease,result,score};
    await writeFile(prefix+'-query-'+fixture.id+'.json',JSON.stringify(record,null,2),{flag:'wx'});queries.push(record);console.log(JSON.stringify({completed:fixture.id,operation:'query',runId:result.metrics.runId,score,native:result.metrics.native}));
  }
}catch(error){
  const failure=error instanceof RuntimeEvidenceError?error.evidence:{error:String(error)};await writeFile(prefix+'-failure.json',JSON.stringify({synthetic:true,protocolSha256,completedExtractionCases:outcomes.map(c=>c.fixtureId),completedQueryCases:queries.map(c=>c.fixture.id),failure},null,2),{flag:'wx'});process.exitCode=1;console.error(String(error));
}finally{await runtime.close();}
await writeFile(prefix+'-summary.json',JSON.stringify({schemaVersion:1,synthetic:true,heldOut:false,releaseAccepted:false,protocolSha256,completed:outcomes.length===6&&queries.length===4,productionPromptUnchanged:true,transcription:outcomes.length?summarizeScores(outcomes):null,transcriptionCases:outcomes.map(c=>({id:c.fixtureId,runId:c.runId,score:c.score,metrics:c.metrics})),queryCases:queries.map(c=>({id:c.fixture.id,runId:c.result.metrics.runId,score:c.score,metrics:c.result.metrics})),scope:protocol.scope},null,2),{flag:'wx'});
