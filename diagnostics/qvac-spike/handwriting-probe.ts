import { readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { QvacRuntime, RuntimeEvidenceError, assertCompleteMetrics } from '../../packages/runtime/index.js';

const root=process.cwd(),fixtureRoot=path.join(root,'artifacts/fixtures/handwriting');
const manifest=JSON.parse(await readFile(path.join(fixtureRoot,'manifest.json'),'utf8'));
if(manifest.syntheticOnly!==true||manifest.groundTruthReview?.passed!==true)throw new Error('Only visually reviewed, explicitly synthetic fixtures may be probed.');
const baseline=await readdir(path.join(root,'.local/runtime-tmp')).catch(()=>[]);
const runtime=new QvacRuntime({projectRoot:root,onStage:event=>console.log(JSON.stringify(event))});
const outcomes:Record<string,unknown>[]=[];
const words=(text:string)=>text.toLowerCase().match(/[\p{L}\p{N}]+/gu)??[];
function distance(a:string[],b:string[]){let row=b.map((_,i)=>i+1);row.unshift(0);for(let i=0;i<a.length;i++){const next=[i+1];for(let j=0;j<b.length;j++)next.push(Math.min(next[j]+1,row[j+1]+1,row[j]+(a[i]===b[j]?0:1)));row=next;}return row[b.length];}
try{
  for(const fixture of manifest.fixtures){
    if(!/^SYN-HW-00[12]$/.test(fixture.id)||path.basename(fixture.file)!==fixture.file)throw new Error('Unexpected handwriting fixture.');
    const file=path.join(root,'artifacts/evidence',`handwriting-exploratory-${fixture.id}.json`);
    const bytes=await readFile(path.join(fixtureRoot,fixture.file)),imageSha256=createHash('sha256').update(bytes).digest('hex');
    try{
      const result=await runtime.extractImage({bytes,mime:'image/png'});assertCompleteMetrics(result.metrics);
      if(result.metrics.request.attachment?.sha256!==imageSha256)throw new Error('Actual inferred attachment differs from fixture.');
      const referenceWords=words(fixture.groundTruth),outputWords=words(result.text),wordEditDistance=distance(referenceWords,outputWords);
      const quality={referenceWordCount:referenceWords.length,outputWordCount:outputWords.length,wordEditDistance,normalizedWordErrorRate:wordEditDistance/referenceWords.length,method:'Levenshtein word edits divided by reference word count after lowercasing and Unicode letter/number tokenization. This is a text-quality comparison, never an inference token estimate.',exactTextMatch:result.text===fixture.groundTruth,agentReviewRequired:true};
      const evidence={schemaVersion:1,synthetic:true,scope:'AI-generated handwriting-style synthetic image exploration only; no real handwriting reliability, training/fine-tuning, physical Fold workflow or release acceptance claimed',fixture,fixtureManifest:'artifacts/fixtures/handwriting/manifest.json',generator:manifest.generator,imageSha256,independentImageReview:'Runtime evidence agent visually verified both fixture images against manifest ground truth before inference',metricsGate:'passed',quality,result};
      await writeFile(file,JSON.stringify(evidence,null,2),{flag:'wx'});
      outcomes.push({fixtureId:fixture.id,file:path.relative(root,file),runId:result.metrics.runId,metricsGate:'passed',quality,text:result.text,native:result.metrics.native});
      console.log(JSON.stringify(outcomes.at(-1)));
    }catch(error){
      const failure=error instanceof RuntimeEvidenceError?error.evidence:{error:String(error)};
      await writeFile(file.replace('.json',`-failure-${Date.now()}.json`),JSON.stringify({synthetic:true,fixtureId:fixture.id,imageSha256,failure},null,2),{flag:'wx'});
      outcomes.push({fixtureId:fixture.id,status:'failed'});process.exitCode=1;
    }
  }
}finally{
  await runtime.close();const remaining=await readdir(path.join(root,'.local/runtime-tmp'));
  const newTemporaryDirectoriesRemaining=remaining.filter(id=>!baseline.includes(id));
  await writeFile(path.join(root,'artifacts/evidence/handwriting-exploratory-summary.json'),JSON.stringify({schemaVersion:1,synthetic:true,checkedAt:new Date().toISOString(),scope:manifest.scope,classification:manifest.classification,noTrainingOrFineTuning:true,productionPromptUnchanged:true,outcomes,preexistingTemporaryDirectories:baseline,newTemporaryDirectoriesRemaining},null,2),{flag:'wx'});
  if(newTemporaryDirectoriesRemaining.length)throw new Error('Handwriting probe left new temporary files.');
}
