import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { QvacRuntime, RuntimeEvidenceError, assertCompleteMetrics } from '../../packages/runtime/index.js';

// One bounded follow-up. Always label the actual runtime prompt version and
// refuse overwrites so a retry cannot erase an earlier failed attempt.
const root=process.cwd(),fixture=path.join(root,'diagnostics/qvac-spike/fixtures/unreadable.png');
const preexistingTemporaryEntries=await readdir(path.join(root,'.local/runtime-tmp')).catch(()=>[]);
const runtime=new QvacRuntime({projectRoot:root,onStage:event=>console.log(JSON.stringify(event))});
try{
  const result=await runtime.extractImage({bytes:await readFile(fixture),mime:'image/png'});
  assertCompleteMetrics(result.metrics);
  const promptVersion=result.metrics.request.promptTemplateVersion;
  const targetChecks={marksOccludedLine:/\[unclear\]/i.test(result.text),doesNotInventInvisibleDuration:!(/three|nights/i.test(result.text))};
  const evidence={schemaVersion:1,synthetic:true,purpose:'One prompt improvement attempt for the fixed fully occluded printed line; not physical photo or full UI evidence',originalFailure:'artifacts/evidence/quality-unreadable-extract.json',fixture:'diagnostics/qvac-spike/fixtures/unreadable.png',metricsGate:'passed',targetChecks,qualityStatus:Object.values(targetChecks).every(Boolean)?'target-checks-passed-agent-review-required':'failed',preexistingTemporaryEntries,result};
  await writeFile(path.join(root,`artifacts/evidence/quality-unreadable-${promptVersion}-${result.metrics.runId}.json`),JSON.stringify(evidence,null,2),{flag:'wx'});
  console.log(JSON.stringify({runId:result.metrics.runId,promptVersion:result.metrics.request.promptTemplateVersion,text:result.text,targetChecks,native:result.metrics.native}));
}catch(error){
  await writeFile(path.join(root,`artifacts/evidence/quality-unreadable-failure-${Date.now()}.json`),JSON.stringify({synthetic:true,failure:error instanceof RuntimeEvidenceError?error.evidence:{error:String(error)}},null,2),{flag:'wx'});
  process.exitCode=1;
}finally{await runtime.close();const remaining=await readdir(path.join(root,'.local/runtime-tmp'));if(remaining.some(name=>!preexistingTemporaryEntries.includes(name)))throw new Error('New temporary files remain after occlusion probe.');}
