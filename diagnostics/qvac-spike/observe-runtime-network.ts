import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access, writeFile } from 'node:fs/promises';
import path from 'node:path';

const exec=promisify(execFile);
const desktopPid=Number(process.argv.find(arg=>arg.startsWith('--desktop-pid='))?.split('=')[1]);
const durationSeconds=Number(process.argv.find(arg=>arg.startsWith('--seconds='))?.split('=')[1]??600);
if(!Number.isSafeInteger(desktopPid)||desktopPid<1||!Number.isSafeInteger(durationSeconds)||durationSeconds<1||durationSeconds>1800)throw new Error('Use --desktop-pid=<owned Electron root> and --seconds=1..1800.');
const startedAt=new Date().toISOString(),deadline=Date.now()+durationSeconds*1000;
const stopFile=path.resolve('.local',`network-observation-stop-${desktopPid}-${Date.now()}`);
const observed=new Map<number,{processId:number;parentProcessId:number;name:string;role:string;firstSeen:string;lastSeen:string}>();
const inferencePids=new Set<number>(),sockets:Record<string,unknown>[]=[],errors:string[]=[];
let running=true,samples=0;
process.on('SIGINT',()=>{running=false;});process.on('SIGTERM',()=>{running=false;});
function endpoint(value:string){
  const split=value.lastIndexOf(':'),address=value.slice(0,split).replace(/^\[|\]$/g,''),port=value.slice(split+1);
  const scope=['0.0.0.0','::','*'].includes(address)?'wildcard':address==='::1'||address.startsWith('127.')?'loopback':/^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(address)?'private-ipv4':address.startsWith('fe80:')?'link-local-ipv6':'other';
  return {scope,port};
}
console.log(JSON.stringify({status:'observing',desktopPid,startedAt,durationSeconds,stopFile,stopMethod:'Create the stopFile to flush evidence gracefully; Windows tool termination may bypass signal handlers.',scope:'Read-only process/socket sampling, not network isolation; no inference launched'}));
while(running&&Date.now()<deadline){
  if(await access(stopFile).then(()=>true).catch(()=>false))break;
  try{
    // Command lines are inspected only inside PowerShell to identify runtime
    // workers; neither command lines nor socket IP addresses are published.
    const command=`$allProcesses=Get-CimInstance Win32_Process;$owned=@{${desktopPid}=$true};$changed=$true;while($changed){$changed=$false;foreach($entry in $allProcesses){if($owned.ContainsKey([int]$entry.ParentProcessId)-and -not $owned.ContainsKey([int]$entry.ProcessId)){$owned[[int]$entry.ProcessId]=$true;$changed=$true}}};@($allProcesses|Where-Object{$owned.ContainsKey([int]$_.ProcessId)}|ForEach-Object{[pscustomobject]@{processId=[int]$_.ProcessId;parentProcessId=[int]$_.ParentProcessId;name=$_.Name;inferenceWorker=[bool]([string]$_.CommandLine).Replace([char]92,[char]47).Contains('packages/runtime/worker.js')}})|ConvertTo-Json -Compress`;
    const {stdout}=await exec('powershell.exe',['-NoProfile','-Command',command],{windowsHide:true,maxBuffer:1024*1024});
    const parsed=JSON.parse(stdout||'[]');
    const rows=(Array.isArray(parsed)?parsed:[parsed]) as {processId:number;parentProcessId:number;name:string;inferenceWorker:boolean}[];
    for(const p of rows)if(p.inferenceWorker)inferencePids.add(p.processId);
    let changed=true;while(changed){changed=false;for(const p of rows)if(inferencePids.has(p.parentProcessId)&&!inferencePids.has(p.processId)){inferencePids.add(p.processId);changed=true;}}
    const at=new Date().toISOString();
    for(const p of rows){const old=observed.get(p.processId);observed.set(p.processId,{processId:p.processId,parentProcessId:p.parentProcessId,name:p.name,role:inferencePids.has(p.processId)?'inference-worker-tree':p.processId===desktopPid?'desktop-root-lan-receiver':'desktop-other',firstSeen:old?.firstSeen??at,lastSeen:at});}
    const {stdout:network}=await exec('netstat.exe',['-ano'],{windowsHide:true});samples++;
    const currentPids=new Set(rows.map(p=>p.processId));
    for(const line of network.split(/\r?\n/)){
      const parts=line.trim().split(/\s+/);if(!['TCP','UDP'].includes(parts[0]))continue;
      const processId=Number(parts.at(-1)),owner=observed.get(processId);if(!owner||!currentPids.has(processId))continue;
      sockets.push({at,processId,role:owner.role,protocol:parts[0],local:endpoint(parts[1]),remote:endpoint(parts[2]),state:parts[0]==='TCP'?parts[3]:'not-applicable'});
    }
  }catch(error){errors.push(String(error));}
  await new Promise(resolve=>setTimeout(resolve,250));
}
const output=path.resolve('artifacts/evidence',`physical-network-observation-${Date.now()}.json`);
const evidence={schemaVersion:1,synthetic:true,startedAt,endedAt:new Date().toISOString(),desktopPid,samples,method:'Read-only Win32_Process descendant snapshots, runtime worker command-line classification and netstat -ano; 250 ms delay after each completed sample. IP addresses and command lines intentionally not retained.',enforcedIsolation:false,limitations:['Short-lived processes or sockets between samples may be missed.','The PC remains network-connected. Desktop private-LAN TLS receiver sockets are separate from inference worker sockets.','A process/socket observation alone is not full workflow acceptance or proof of enforced offline isolation.'],processes:[...observed.values()],sampledInferenceProcessIds:[...inferencePids],socketObservations:sockets,inferenceSocketObservations:sockets.filter(s=>s.role==='inference-worker-tree'),errors};
await writeFile(output,JSON.stringify(evidence,null,2),{flag:'wx'});
console.log(JSON.stringify({status:'finished',output,samples,sampledInferenceProcessIds:[...inferencePids],inferenceSocketCount:evidence.inferenceSocketObservations.length,errors:errors.length}));
