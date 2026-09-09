import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile);
/** Read-only overlap detection, not a machine-wide mutex or offline enforcement. */
export async function assertGpuLease(){
  if(process.platform!=='win32')throw new Error('This lease check is specific to the authorized Windows GPU host.');
  const script="Get-CimInstance Win32_Process | ForEach-Object { [pscustomobject]@{pid=$_.ProcessId;parent=$_.ParentProcessId;name=$_.Name;runtime=($_.Name -eq 'bare.exe' -or (($_.Name -eq 'node.exe' -or $_.Name -eq 'electron.exe') -and $_.CommandLine -match 'packages.runtime.worker[.]js'))} } | ConvertTo-Json -Compress";
  const {stdout}=await exec('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,timeout:10000,maxBuffer:1024*1024});
  const rows=JSON.parse(stdout),byPid=new Map<number,any>(rows.map(row=>[row.pid,row]));
  const owned=(pid:number)=>{const seen=new Set<number>();while(pid&&!seen.has(pid)){if(pid===process.pid)return true;seen.add(pid);pid=byPid.get(pid)?.parent;}return false;};
  const foreign=rows.filter(row=>row.runtime&&!owned(row.pid));if(foreign.length)throw new Error('Foreign QVAC/Bare runtime detected; GPU lease stopped: '+JSON.stringify(foreign));
  const compute=await exec('nvidia-smi',['--query-compute-apps=pid','--format=csv,noheader,nounits'],{windowsHide:true,timeout:10000});
  const gpuPids=compute.stdout.trim()?compute.stdout.trim().split(/\r?\n/).map(line=>{if(!/^\d+$/.test(line.trim()))throw new Error('Native GPU process list is unavailable.');return Number(line.trim());}):[];
  if(gpuPids.some(pid=>!owned(pid)))throw new Error('Foreign GPU compute process detected; GPU lease stopped.');
  return {checkedAt:new Date().toISOString(),foreignRuntimeCount:0,foreignGpuProcessCount:0};
}
export async function withGpuLease<T>(run:(signal:AbortSignal)=>Promise<T>){
  const before=await assertGpuLease(),abort=new AbortController();let check:Promise<void>|undefined,failure:unknown;
  const timer=setInterval(()=>{if(check)return;check=assertGpuLease().then(()=>{},error=>{failure=error;abort.abort();}).finally(()=>{check=undefined;});},1000);
  try{const result=await run(abort.signal);clearInterval(timer);await check;if(failure)throw failure;const after=await assertGpuLease();return {result,lease:{before,after,monitorIntervalMs:1000,method:'Read-only Windows runtime ancestry and nvidia-smi compute PID sampling; abort on observed foreign job. Coordinator observed idle GPU before lease and notified the user. Not a global mutex or offline-enforcement proof.'}};}finally{clearInterval(timer);await check;}
}
