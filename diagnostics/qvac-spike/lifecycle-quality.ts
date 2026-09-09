import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { QvacRuntime, RuntimeEvidenceError, assertCompleteMetrics } from '../../packages/runtime/index.js';
import { syntheticImage, QUALITY_FIXTURES } from './fixture.js';

const exec=promisify(execFile),root=process.cwd(),directory=path.join(root,'artifacts/evidence');
await mkdir(directory,{recursive:true});
const stages:unknown[]=[],ownedPids=new Set<number>(),socketObservations:unknown[]=[],samplingErrors:string[]=[];
let samples=0,monitoring=true;
// Sampling is observational, not a claim of firewall-enforced isolation.
const monitor=(async()=>{while(monitoring){
  try{
    const {stdout:tree}=await exec('powershell.exe',['-NoProfile','-Command','Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId | ConvertTo-Json -Compress'],{windowsHide:true,maxBuffer:2*1024*1024});
    const processes=JSON.parse(tree);let changed=true;
    while(changed){changed=false;for(const p of processes)if(ownedPids.has(p.ParentProcessId)&&!ownedPids.has(p.ProcessId)){ownedPids.add(p.ProcessId);changed=true;}}
    const {stdout}=await exec('netstat.exe',['-ano'],{windowsHide:true});samples++;
    const rows=stdout.split(/\r?\n/).map(line=>line.trim()).filter(line=>/^(TCP|UDP)\s/.test(line));
    for(const row of rows){const pid=Number(row.split(/\s+/).at(-1));if(ownedPids.has(pid))socketObservations.push({at:new Date().toISOString(),processId:pid,row});}
  }catch(error){samplingErrors.push(String(error));}
  await new Promise(resolve=>setTimeout(resolve,250));
}})();
const onStage=(event:{runId:string;stage:string;processId:number})=>{ownedPids.add(event.processId);stages.push({...event,at:new Date().toISOString()});console.log(JSON.stringify(event));};
const outcomes:Record<string,unknown>[]=[];
const assertClean=async()=>{const remaining=await readdir(path.join(root,'.local/runtime-tmp')).catch(()=>[]);assert.deepEqual(remaining,[]);return remaining;};
try{
  for(const mode of ['cancel','timeout'] as const){
    const controller=new AbortController();
    const runtime=new QvacRuntime({projectRoot:root,timeoutMs:mode==='timeout'?3000:180000,onStage:event=>{onStage(event);if(mode==='cancel'&&event.stage==='completion')controller.abort();}});
    const start=performance.now();let evidence:unknown;
    try{await runtime.extractImage({bytes:syntheticImage(),mime:'image/png',signal:controller.signal});throw new Error(`Expected ${mode} to fail`);}
    catch(error){assert(error instanceof RuntimeEvidenceError);assert.equal(error.evidence.error.name,mode==='timeout'?'RuntimeTimeoutError':'RuntimeCancelledError');assert.throws(()=>assertCompleteMetrics(error.evidence));evidence=error.evidence;}
    finally{await runtime.close();}
    const result={synthetic:true,purpose:'Real SDK lifecycle rejection; incomplete interrupted runs are never accepted inference evidence',status:'passed',mode,wallMs:performance.now()-start,temporaryFilesRemaining:await assertClean(),failure:evidence};
    await writeFile(path.join(directory,`lifecycle-${mode}.json`),JSON.stringify(result,null,2));outcomes.push({mode,status:'passed'});
  }
  const runtime=new QvacRuntime({projectRoot:root,onStage});
  try{for(const fixture of QUALITY_FIXTURES){
    const image=syntheticImage(fixture.source,'obscureLine' in fixture?fixture.obscureLine:undefined);
    await writeFile(path.join(root,'diagnostics/qvac-spike/fixtures',`${fixture.id}.png`),image);
    for(const operation of ['extract','draft'] as const){
      try{
        const result=operation==='extract'?await runtime.extractImage({bytes:image,mime:'image/png'}):await runtime.draftFromSource({text:fixture.reviewedSource,sourceId:`synthetic-quality-${fixture.id}:1`});
        assertCompleteMetrics(result.metrics);
        const evidence={schemaVersion:1,synthetic:true,purpose:'Fixed quality fixture; draft uses explicit reviewed canonical source, not automatic extraction approval or full UI workflow',fixture,operation,result,temporaryFilesRemaining:await assertClean()};
        await writeFile(path.join(directory,`quality-${fixture.id}-${operation}.json`),JSON.stringify(evidence,null,2));
        outcomes.push({fixture:fixture.id,operation,status:'metrics-accepted-quality-review-required',output:result.text,runId:result.metrics.runId});
        console.log(JSON.stringify(outcomes.at(-1)));
      }catch(error){const failure=error instanceof RuntimeEvidenceError?error.evidence:{error:String(error)};await writeFile(path.join(directory,`quality-${fixture.id}-${operation}-failure.json`),JSON.stringify({synthetic:true,failure},null,2));outcomes.push({fixture:fixture.id,operation,status:'failed'});process.exitCode=1;}
    }
  }}finally{await runtime.close();}
}finally{
  monitoring=false;await monitor;
  const {stdout:finalProcesses}=await exec('powershell.exe',['-NoProfile','-Command','@(Get-CimInstance Win32_Process | Select-Object -ExpandProperty ProcessId) | ConvertTo-Json -Compress'],{windowsHide:true});
  const finalIds:number[]=JSON.parse(finalProcesses),remainingOwnedProcessIds=[...ownedPids].filter(pid=>finalIds.includes(pid));
  const summary={schemaVersion:1,synthetic:true,checkedAt:new Date().toISOString(),scope:'Lifecycle, fixed synthetic quality outputs, and sampled runtime network sockets; not full UI/phone acceptance or enforced network isolation',outcomes,stages,network:{method:'Win32_Process parent-descendant snapshots followed by netstat -ano; 250 ms delay between completed samples; short-lived activity between samples may be missed',samples,ownedProcessIds:[...ownedPids],socketObservations,samplingErrors,enforcedIsolation:false},processCleanup:{method:'Win32_Process snapshot after runtime.close and monitor completion, matched against every observed runtime descendant PID',remainingOwnedProcessIds},temporaryFilesRemaining:await assertClean()};
  await writeFile(path.join(directory,'lifecycle-quality-summary.json'),JSON.stringify(summary,null,2));
  assert.deepEqual(remainingOwnedProcessIds,[]);
}
