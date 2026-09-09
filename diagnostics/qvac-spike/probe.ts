import { mkdir, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { QvacRuntime, RuntimeEvidenceError, assertCompleteMetrics } from '../../packages/runtime/index.js';
import { syntheticImage, SYNTHETIC_SOURCE } from './fixture.js';

const root=path.resolve(process.cwd()),evidenceDirectory=path.join(root,'artifacts','evidence');
const fixtureDirectory=path.join(root,'diagnostics','qvac-spike','fixtures');
await mkdir(evidenceDirectory,{recursive:true});await mkdir(fixtureDirectory,{recursive:true});
const image=syntheticImage();await writeFile(path.join(fixtureDirectory,'synthetic-note.png'),image);
const runtime=new QvacRuntime({projectRoot:root,timeoutMs:180000,onStage:event=>console.log(JSON.stringify({runId:event.runId,stage:event.stage}))});
const outcomes:Record<string,unknown>[]=[];
try {
  for(const operation of ['extract','draft'] as const){
    const startedAt=new Date().toISOString();
    console.log(`Starting real local ${operation} on explicitly synthetic input.`);
    try{
      const result=operation==='extract'?await runtime.extractImage({bytes:image,mime:'image/png'}):await runtime.draftFromSource({text:SYNTHETIC_SOURCE,sourceId:'synthetic-demo-001:1',context:[]});
      assertCompleteMetrics(result.metrics);
      const evidence={schemaVersion:1,synthetic:true,purpose:'Native Windows feasibility; not a full clinical workflow test',expectedSource:SYNTHETIC_SOURCE,result};
      await writeFile(path.join(evidenceDirectory,`synthetic-${operation}.json`),JSON.stringify(evidence,null,2));
      outcomes.push({operation,status:'succeeded',runId:result.metrics.runId,model:result.metrics.model,native:result.metrics.native,loadMs:result.metrics.loadMs,durationMs:result.metrics.durationMs,output:result.text});
      console.log(JSON.stringify(outcomes.at(-1)));
    }catch(error){
      const failure=error instanceof RuntimeEvidenceError?error.evidence:{status:'failed',operation,stage:'probe',error:{name:(error as Error).name,message:(error as Error).message},startedAt,endedAt:new Date().toISOString()};
      const file=`synthetic-${operation}-failure-${Date.now()}.json`;
      await writeFile(path.join(evidenceDirectory,file),JSON.stringify({synthetic:true,purpose:'Failed feasibility attempt, never passing evidence',failure},null,2));
      outcomes.push({operation,status:'failed',file,error:failure.error,stage:failure.stage});console.log(JSON.stringify(outcomes.at(-1)));
    }
  }
}finally{await runtime.close();}
const tempEntries=await readdir(path.join(root,'.local','runtime-tmp')).catch(()=>[]);
const summary={schemaVersion:1,synthetic:true,checkedAt:new Date().toISOString(),status:outcomes.every(o=>o.status==='succeeded')&&tempEntries.length===0?'passed':'failed',scope:'Real SDK extraction and drafting feasibility only; full UI workflow must be validated separately',outcomes,temporaryFilesRemaining:tempEntries};
await writeFile(path.join(evidenceDirectory,'feasibility-summary.json'),JSON.stringify(summary,null,2));
if(summary.status!=='passed')process.exitCode=1;
