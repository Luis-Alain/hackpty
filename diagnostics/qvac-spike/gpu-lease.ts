import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile);
/** Executables that always mean a competing inference/runtime workload, never an idle GUI process. */
const RUNTIME_EXE=/^(node|electron|bare|python[^\/\\]*)\.exe$/i;
export interface GpuComputeRow{pid:number;name:string;usedMemory:string;raw:string;}
export interface GpuProcessClassification{
  aborting:Array<{pid:number;name:string;reason:string}>;
  observedForeignGpuProcesses:Array<{pid:number;name:string;usedMemory:string}>;
}
/**
 * D7 pure policy: foreign runtime executables (or the runtime worker command line, flagged by the
 * Win32 `runtime` column) still abort; any other foreign GPU compute process is only observed.
 * `owned` is the ancestry predicate for the current process tree.
 */
export function classifyGpuProcesses(rows:Array<{pid:number;name?:string;runtime?:boolean}>,computeRows:GpuComputeRow[],owned:(pid:number)=>boolean):GpuProcessClassification{
  const byPid=new Map<number,any>(rows.map(row=>[row.pid,row]));
  const result:GpuProcessClassification={aborting:[],observedForeignGpuProcesses:[]};
  for(const compute of computeRows){
    if(owned(compute.pid))continue;
    const win32=byPid.get(compute.pid);
    const exe=(win32?.name??compute.name.replace(/^.*[\/\\]/,''))||'';
    if(win32?.runtime)result.aborting.push({pid:compute.pid,name:exe,reason:'runtime-worker-command-line'});
    else if(RUNTIME_EXE.test(exe))result.aborting.push({pid:compute.pid,name:exe,reason:'runtime-executable'});
    else result.observedForeignGpuProcesses.push({pid:compute.pid,name:exe,usedMemory:compute.usedMemory});
  }
  return result;
}
/** Read-only overlap detection, not a machine-wide mutex or offline enforcement. */
export async function assertGpuLease(){
  if(process.platform!=='win32')throw new Error('This lease check is specific to the authorized Windows GPU host.');
  const script="Get-CimInstance Win32_Process | ForEach-Object { [pscustomobject]@{pid=$_.ProcessId;parent=$_.ParentProcessId;name=$_.Name;runtime=($_.Name -eq 'bare.exe' -or (($_.Name -eq 'node.exe' -or $_.Name -eq 'electron.exe') -and $_.CommandLine -match 'packages.runtime.worker[.]js'))} } | ConvertTo-Json -Compress";
  const {stdout}=await exec('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,timeout:10000,maxBuffer:1024*1024});
  const rows=JSON.parse(stdout),byPid=new Map<number,any>(rows.map(row=>[row.pid,row]));
  const owned=(pid:number)=>{const seen=new Set<number>();while(pid&&!seen.has(pid)){if(pid===process.pid)return true;seen.add(pid);pid=byPid.get(pid)?.parent;}return false;};
  const foreign=rows.filter(row=>row.runtime&&!owned(row.pid));if(foreign.length)throw new Error('Foreign QVAC/Bare runtime detected; GPU lease stopped: '+JSON.stringify(foreign));
  const compute=await exec('nvidia-smi',['--query-compute-apps=pid,process_name,used_memory','--format=csv,noheader'],{windowsHide:true,timeout:10000});
  const rawGpuComputeLines=compute.stdout.trim()?compute.stdout.trim().split(/\r?\n/):[];
  const computeRows:GpuComputeRow[]=rawGpuComputeLines.map(line=>{
    const [pidText,name,usedMemory]=line.split(',').map(part=>part.trim());
    if(!/^\d+$/.test(pidText||''))throw new Error('Native GPU process list is unavailable.');
    return {pid:Number(pidText),name:name||'',usedMemory:usedMemory||'',raw:line};
  });
  const {aborting,observedForeignGpuProcesses}=classifyGpuProcesses(rows,computeRows,owned);
  if(aborting.length)throw new Error('Foreign GPU compute process detected; GPU lease stopped: '+JSON.stringify(aborting));
  return {checkedAt:new Date().toISOString(),foreignRuntimeCount:0,foreignGpuProcessCount:observedForeignGpuProcesses.length,observedForeignGpuProcesses,rawGpuComputeLines};
}
function methodNote(leases:Array<{observedForeignGpuProcesses?:Array<{pid:number;name:string;usedMemory:string}>}>):string{
  const observed=new Map<number,{pid:number;name:string;usedMemory:string}>();
  for(const lease of leases)for(const item of lease.observedForeignGpuProcesses??[])observed.set(item.pid,item);
  if(!observed.size)return '';
  const detail=[...observed.values()].map(item=>`${item.name} (PID ${item.pid}, ${item.usedMemory})`).join(', ');
  return ` A non-runtime GUI process shared the GPU during the run: ${detail}. Every run record from this lease carries that observation and the evaluation report must disclose it.`;
}
export async function withGpuLease<T>(run:(signal:AbortSignal,beforeLease:Awaited<ReturnType<typeof assertGpuLease>>)=>Promise<T>){
  const before=await assertGpuLease(),abort=new AbortController();let check:Promise<void>|undefined,failure:unknown;
  const timer=setInterval(()=>{if(check)return;check=assertGpuLease().then(()=>{},error=>{failure=error;abort.abort();}).finally(()=>{check=undefined;});},1000);
  try{const result=await run(abort.signal,before);clearInterval(timer);await check;if(failure)throw failure;const after=await assertGpuLease();return {result,lease:{before,after,monitorIntervalMs:1000,method:'Read-only Windows runtime ancestry and nvidia-smi compute PID sampling; abort on observed foreign runtime job.'+methodNote([before,after])+' Coordinator observed idle GPU before lease and notified the user. Not a global mutex or offline-enforcement proof.'}};}finally{clearInterval(timer);await check;}
}
