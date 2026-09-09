import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {QvacRuntime,RuntimeEvidenceError,assertCompleteMetrics} from '../../packages/runtime/index.js';
import {QUERY_PROMPT_VERSION,QUERY_RESPONSE_FORMAT,queryHistory} from '../../packages/runtime/prompts.js';
import {QUERY_CASES,scoreQuerySelection} from './query-evaluation.js';
import {withGpuLease} from './gpu-lease.js';
import {sha256} from './transcription-cases.js';
if(QUERY_PROMPT_VERSION as string !== 'psyrec-approved-query-v2')throw new Error('Historical quote-selection probe is retired. Use query-source-selection for the current runtime; archived v2 evidence remains verifiable.');
const id=process.argv[2];if(!id||!/^20[0-9TZa-z-]+$/.test(id))throw new Error('Use a unique dated synthetic experiment ID.');
const root=process.cwd(),prefix=path.join(root,'artifacts/evidence','query-structured-'+id),modelManifest=JSON.parse(await readFile(path.join(root,'MODEL-MANIFEST.json'),'utf8'));
const protocol={schemaVersion:1,synthetic:true,heldOut:false,releaseAccepted:false,createdAt:new Date().toISOString(),scope:'Four already-seen synthetic supplied-excerpt query development tests. No lexical retrieval or human workflow acceptance.',version:QUERY_PROMPT_VERSION,responseFormat:QUERY_RESPONSE_FORMAT,modelManifest,loadConfiguration:{ctx_size:4096,device:'gpu',gpu_layers:99,'main-gpu':'dedicated',parallel:1,verbosity:0,reasoning_budget:0},generationConfiguration:{temp:0,seed:42,predict:768,reasoning_budget:0,stream:true,kvCache:false},cases:QUERY_CASES.map(f=>({...f,history:queryHistory(f.question,[...f.sources])})),qualityMethods:'Strict raw JSON parse and schema shape; exact supplied source substring membership; relevant full-sentence quote precision; expected-quote recall; absent-fact abstention. Model free-text answer is never displayed. Runtime fields are native and independently required.'};
await writeFile(prefix+'-protocol.json',JSON.stringify(protocol,null,2),{flag:'wx'});const protocolSha256=sha256(await readFile(prefix+'-protocol.json'));
const runtime=new QvacRuntime({projectRoot:root,onStage:e=>console.log(JSON.stringify({runId:e.runId,stage:e.stage}))}),outcomes:any[]=[];
try{for(const fixture of QUERY_CASES){
  console.log(JSON.stringify({starting:fixture.id,operation:'query',profile:QUERY_PROMPT_VERSION}));
  const {result,lease}=await withGpuLease(signal=>runtime.answerApprovedNotes({question:fixture.question,sources:fixture.sources.map(s=>({...s})),signal}));assertCompleteMetrics(result.metrics);
  if(result.metrics.output.sha256!==sha256(result.text))throw new Error('Query raw output digest mismatch.');
  const score=scoreQuerySelection(result.text,fixture),record={schemaVersion:1,synthetic:true,heldOut:false,releaseAccepted:false,protocolSha256,fixture,lease,result,score};
  await writeFile(prefix+'-'+fixture.id+'.json',JSON.stringify(record,null,2),{flag:'wx'});outcomes.push(record);console.log(JSON.stringify({completed:fixture.id,runId:result.metrics.runId,score,native:result.metrics.native}));
}}catch(error){const failure=error instanceof RuntimeEvidenceError?error.evidence:{error:String(error)};await writeFile(prefix+'-failure.json',JSON.stringify({synthetic:true,protocolSha256,completedCases:outcomes.map(c=>c.fixture.id),failure},null,2),{flag:'wx'});process.exitCode=1;console.error(String(error));}finally{await runtime.close();}
await writeFile(prefix+'-summary.json',JSON.stringify({schemaVersion:1,synthetic:true,heldOut:false,releaseAccepted:false,protocolSha256,completed:outcomes.length===4,qualityPassed:outcomes.length===4&&outcomes.every(c=>c.score.passed),cases:outcomes.map(c=>({id:c.fixture.id,runId:c.result.metrics.runId,score:c.score,metrics:c.result.metrics})),scope:protocol.scope},null,2),{flag:'wx'});
