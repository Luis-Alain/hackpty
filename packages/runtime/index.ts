import { fork, execFile, type ChildProcess, type ForkOptions } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertWithin, manifest } from './models.js';
import { assertCompleteMetrics } from './metrics.js';
import { validateQueryInput } from './prompts.js';
import { validateChartReviewPacket } from './chart-review-prompts.js';
import type { ChartReviewPacket } from '../contracts/chart-review.js';
import type { QuerySource } from './types.js';
import { OWNER_MARKER, recoverAbandonedTemporaryFiles } from './temporary-files.js';
import { RuntimeEvidenceError, type RuntimeResult, type JobRequest, type Operation, type RuntimeFailure } from './types.js';
export { assertCompleteMetrics, IncompleteEvidenceError } from './metrics.js';
export { RuntimeEvidenceError } from './types.js';
export type { RunMetrics, RuntimeResult, RuntimeFailure } from './types.js';

export interface RuntimeOptions {
  projectRoot?: string; modelDirectory?: string; timeoutMs?: number; nodeExecutable?: string;
  onStage?: (event: {runId:string;stage:string;processId:number}) => void;
}
async function terminateOwnedTree(child: ChildProcess) {
  if (!child.pid || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    await new Promise<void>(resolve => execFile('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,timeout:10000},()=>resolve()));
  } else { child.kill('SIGKILL'); }
}
/** One isolated SDK process per request; the queue keeps GPU ownership serial. */
export class QvacRuntime {
  readonly projectRoot: string; readonly modelDirectory: string; readonly timeoutMs: number;
  private options: RuntimeOptions; private queue: Promise<unknown> = Promise.resolve();
  private active = new Map<string, {child:ChildProcess;stop:()=>void}>(); private generation = 0;
  constructor(options: RuntimeOptions = {}) {
    this.options = options; this.projectRoot = path.resolve(options.projectRoot ?? process.cwd());
    this.modelDirectory = path.resolve(options.modelDirectory ?? path.join(this.projectRoot,'.local','models'));
    this.timeoutMs = options.timeoutMs ?? 180000;
  }
  async getStatus() {
    await recoverAbandonedTemporaryFiles(this.projectRoot);
    const data = await manifest(this.projectRoot);
    const models = await Promise.all(data.models.map(async asset => ({id:asset.id,model:asset.constant,filename:asset.filename,expectedBytes:asset.expectedBytes,present:await stat(path.join(this.modelDirectory,asset.filename)).then(s=>s.size===asset.expectedBytes).catch(()=>false)})));
    return {sdk:'@qvac/sdk',sdkVersion:data.sdk.version,localOnly:true,ready:models.every(m=>m.present),integrityCheck:'Full SHA-256 is checked before every load',models,activeRuns:this.active.size,ragEnabled:false,voiceEnabled:false};
  }
  async extractImage(input:{bytes:Buffer | Uint8Array;mime:string;signal?:AbortSignal}): Promise<RuntimeResult> {
    return this.extractWithProfile(input);
  }
  /** Explicit diagnostic experiment; not used by the clinician capture path. */
  async extractImageForEvaluation(input:{bytes:Buffer | Uint8Array;mime:string;signal?:AbortSignal}): Promise<RuntimeResult> {
    return this.extractWithProfile(input,'psyrec-extract-lines-v3');
  }
  private async extractWithProfile({bytes,mime,signal}:{bytes:Buffer | Uint8Array;mime:string;signal?:AbortSignal},extractionPromptProfile?:'psyrec-extract-lines-v3'): Promise<RuntimeResult> {
    if (!(bytes instanceof Uint8Array) || bytes.length < 12 || bytes.length > 8*1024*1024 || !['image/png','image/jpeg'].includes(mime)) throw new Error('Use a local PNG or JPEG image no larger than 8 MB.');
    const b=Buffer.from(bytes);
    if (mime === 'image/png' ? !b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : !(b[0]===255 && b[1]===216 && b[2]===255)) throw new Error('Image signature does not match MIME type.');
    return this.enqueue({operation:'extract',imageBase64:b.toString('base64'),mime,context:[],...(extractionPromptProfile?{extractionPromptProfile}:{})},signal);
  }
  async draftFromSource({text,sourceId,context=[],signal}:{text:string;sourceId:string;context?:unknown[];signal?:AbortSignal}):Promise<RuntimeResult> {
    if (typeof text!=='string' || !text.trim() || text.length>30000 || typeof sourceId!=='string' || !sourceId.trim() || sourceId.length>300) throw new Error('A reviewed source and source ID are required.');
    if (!Array.isArray(context) || context.length) throw new Error('RAG context is disabled for this release.');
    return this.enqueue({operation:'draft',text,sourceId,context:[]},signal);
  }
  async answerApprovedNotes({question,sources,signal}:{question:string;sources:QuerySource[];signal?:AbortSignal}):Promise<RuntimeResult> {
    validateQueryInput(question,sources);
    const retained=sources.map(source=>({sourceId:source.sourceId,text:source.text}));
    return this.enqueue({operation:'query',text:question,querySources:retained,context:retained},signal);
  }
  /** MedPsy chart review over an application-bound packet. Model identity is in result.metrics (model + modelDetails). */
  async reviewChart({packet,signal}:{packet:ChartReviewPacket;signal?:AbortSignal}):Promise<RuntimeResult> {
    validateChartReviewPacket(packet);
    return this.enqueue({operation:'review',reviewPacket:packet,context:[]},signal);
  }
  private enqueue(input: Pick<JobRequest,'operation'|'context'> & Partial<JobRequest>,signal?:AbortSignal): Promise<RuntimeResult> {
    const generation=this.generation;
    const job=this.queue.then(()=> {if (generation!==this.generation || signal?.aborted) throw new Error('Runtime request cancelled.');return this.run(input,signal);});
    this.queue=job.catch(()=>{}); return job;
  }
  private async run(input: Pick<JobRequest,'operation'|'context'> & Partial<JobRequest>,signal?:AbortSignal):Promise<RuntimeResult> {
    await recoverAbandonedTemporaryFiles(this.projectRoot);
    const runId=randomUUID(),startedAt=new Date().toISOString();
    const tempDirectory=path.join(this.projectRoot,'.local','runtime-tmp',runId);
    assertWithin(path.join(this.projectRoot,'.local','runtime-tmp'),tempDirectory);
    await mkdir(tempDirectory,{recursive:true,mode:0o700});
    await writeFile(path.join(tempDirectory,OWNER_MARKER),JSON.stringify({schemaVersion:1,ownerProcessId:process.pid,runId,createdAt:startedAt}),{mode:0o600});
    const workerPath=fileURLToPath(new URL('./worker.js',import.meta.url));
    const forkOptions:ForkOptions & {windowsHide:boolean}={cwd:this.projectRoot,execPath:this.options.nodeExecutable ?? process.execPath,execArgv:[],windowsHide:true,serialization:'advanced',stdio:['ignore','pipe','pipe','ipc'],env:{...process.env,ELECTRON_RUN_AS_NODE:'1'}};
    const child=fork(workerPath,[],forkOptions);
    // Bound diagnostics in memory; returned only as failure evidence for the
    // encrypted sink. They are never written to console or plaintext by runtime.
    let diagnosticTail='';
    const capture=(chunk:Buffer)=>{diagnosticTail=(diagnosticTail+chunk.toString()).slice(-12000);};
    child.stdout?.on('data',capture);child.stderr?.on('data',capture);
    let stage='worker-startup'; let result:RuntimeResult | undefined;let failure:RuntimeFailure | undefined;
    let partialEvidence:Record<string,unknown>={};
    const job:JobRequest={...input,runId,projectRoot:this.projectRoot,modelDirectory:this.modelDirectory,tempDirectory} as JobRequest;
    try {
      await new Promise<void>((resolve,reject)=>{
        let settled=false,terminating=false;
        const finish=(error?:Error)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);this.active.delete(runId);error?reject(error):resolve();};
        const stop=async(reason:string)=>{if(terminating||settled)return;terminating=true;failure={schemaVersion:1,status:'failed',runId,operation:input.operation,stage,error:{name:reason==='timeout'?'RuntimeTimeoutError':'RuntimeCancelledError',message:reason==='timeout'?`Local runtime exceeded ${this.timeoutMs} ms.`:'Local runtime cancelled.'},startedAt,endedAt:new Date().toISOString(),partialEvidence:{...partialEvidence,timeoutMs:this.timeoutMs,diagnosticTail,evidenceAccepted:false,interruptionReason:reason}};await terminateOwnedTree(child);finish(new RuntimeEvidenceError(failure.error.message,failure));};
        const abort=()=>{void stop('cancelled');};
        const timer=setTimeout(()=>{void stop('timeout');},this.timeoutMs);
        this.active.set(runId,{child,stop:abort}); signal?.addEventListener('abort',abort,{once:true});
        child.on('message',(message:any)=>{
          if(message?.type==='evidence' && message.runId===runId && message.partialEvidence && typeof message.partialEvidence==='object')partialEvidence=message.partialEvidence;
          if(message?.type==='stage'){stage=message.stage;this.options.onStage?.({runId,stage,processId:child.pid!});}
          if(message?.type==='result'){try{assertCompleteMetrics(message.result?.metrics);result=message.result;}catch(error){failure={schemaVersion:1,status:'failed',runId,operation:input.operation,stage:'client-evidence-gate',error:{name:(error as Error).name,message:(error as Error).message},startedAt,endedAt:new Date().toISOString(),partialEvidence:{candidate:message.result?.metrics}};}}
          if(message?.type==='failure'){failure=message.evidence;if(failure)failure.partialEvidence={...partialEvidence,...failure.partialEvidence};}
        });
        child.once('error',error=>finish(error));
        child.once('exit',(code,exitSignal)=>{
          if(terminating)return;
          if(failure){failure.partialEvidence.diagnosticTail=diagnosticTail;finish(new RuntimeEvidenceError('Local inference failed; no incomplete result was accepted.',failure));return;}
          if(code!==0||!result){const evidence:RuntimeFailure={schemaVersion:1,status:'failed',runId,operation:input.operation,stage,error:{name:'WorkerExitedError',message:`Isolated worker exited (${code}, ${exitSignal}) without validated evidence.`},startedAt,endedAt:new Date().toISOString(),partialEvidence:{...partialEvidence,diagnosticTail}};finish(new RuntimeEvidenceError(evidence.error.message,evidence));return;}
          finish();
        });
        child.send(job,error=>{if(error)finish(error);});
        if(signal?.aborted)abort();
      });
      return result!;
    } finally {
      await terminateOwnedTree(child);
      assertWithin(path.join(this.projectRoot,'.local','runtime-tmp'),tempDirectory);
      await rm(tempDirectory,{recursive:true,force:true});
    }
  }
  async cancelAll() {this.generation++;for(const {stop} of this.active.values())stop();await this.queue;}
  async close() {await this.cancelAll();}
}
