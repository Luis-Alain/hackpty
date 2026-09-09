/**
 * Adapted from team cargar/completar/descargar contract at
 * 21f7f40736c201f8d3c14a36ced4cdb426639122: real native metrics, explicit
 * sampling parameters, exact prompts, final-promise validation, and local-only
 * execution. Dynamic SDK is injected so worker config is set before import.
 */
import path from 'node:path';
import { registrar, ms, type EvidenceSink } from './performance-record.js';
import type { PromptMessage } from './types.js';
type SDK = typeof import('@qvac/sdk');
interface CargarInput {modelSrc:string;etiqueta:string;hardware:string;runId:string;sdkVersion:string;device?:'gpu'|'cpu';ctx?:number;modelConfig?:Record<string,any>;proveedor?:never;fallbackSrc?:never;}
export async function cargar(sdk:SDK, options:CargarInput, sink:EvidenceSink) {
  if (options.proveedor !== undefined || options.fallbackSrc !== undefined || !path.isAbsolute(options.modelSrc)) throw new Error('Clinical runtime requires local absolute paths and prohibits delegation/fallback sources.');
  const {etiqueta,hardware,runId,sdkVersion}=options;
  const config:Record<string,any>={device:options.device??'gpu',gpu_layers:options.device==='cpu'?0:99,ctx_size:options.ctx??4096,...options.modelConfig};
  if(config.projectionModelSrc && !path.isAbsolute(config.projectionModelSrc))throw new Error('The projector must be a local absolute path.');
  const t0=performance.now();
  const base={stage:'load' as const,sdk_version:sdkVersion,model:etiqueta,hardware_id:hardware,execution_mode:'local',model_source:options.modelSrc,model_config:config};
  try {
    const load=sdk.loadModel({modelSrc:options.modelSrc,modelType:'llamacpp-completion',modelConfig:config});
    const modelId=await load;const loadMs=ms(t0);const info=await sdk.getLoadedModelInfo({modelId});
    if((info as any).isDelegated===true)throw new Error('Unexpected delegated inference refused.');
    const fila=registrar({...base,status:'ok',load_ms:loadMs,model_id:modelId,load_request_id:load.requestId,loaded_model_info:info,fallback_a_local:false},runId,sink);
    return {modelId,etiqueta,hardware,device:config.device,delegado:false,loadMs,info,fila,config,runId,sdkVersion};
  }catch(error){registrar({...base,status:'error',error:String((error as Error).message),load_ms:ms(t0)},runId,sink);throw error;}
}
export async function completar(sdk:SDK, modelo:Awaited<ReturnType<typeof cargar>>, {history,generationParams}:{history:PromptMessage[];generationParams:Record<string,number>},sink:EvidenceSink) {
  const t0=performance.now();let tPrimero:number|undefined;let contentDeltaCount=0;let completionDoneObserved=false;
  const run=sdk.completion({modelId:modelo.modelId,stream:true,history,kvCache:false,generationParams});
  const base={stage:'completion' as const,request_id:run.requestId,sdk_version:modelo.sdkVersion,model:modelo.etiqueta,hardware_id:modelo.hardware,execution_mode:'local',history,generation_params:generationParams,kv_cache:false,prompt_chars:history.reduce((n,m)=>n+m.content.length,0),response_format:'text'};
  try {
    for await(const event of run.events){
      if(event.type==='contentDelta'&&event.text){tPrimero??=performance.now();contentDeltaCount++;}
      if(event.type==='completionDone')completionDoneObserved=true;
    }
    const final=await run.final;const total=ms(t0);const stats=final.stats;
    const fila=registrar({...base,status:'ok',ttft_ms:tPrimero===undefined?undefined:tPrimero-t0,ttft_ms_sdk:stats?.timeToFirstToken,input_tokens:stats?.promptTokens,output_tokens:stats?.emittedTokens,generated_tokens:stats?.generatedTokens,emitted_tokens:stats?.emittedTokens,cache_tokens:stats?.cacheTokens,token_count_source:'sdk',output_count_method:'SDK emittedTokens (nonempty addon pieces); generatedTokens retained separately',throughput_tps:stats?.tokensPerSecond,backend_actual:stats?.backendDevice,end_to_end_ms:total,native_stats:stats,stop_reason:final.stopReason},modelo.runId,sink);
    return {id:run.requestId,texto:final.contentText,stats,ms:total,fila,final,firstContentMs:tPrimero===undefined?undefined:tPrimero-t0,contentDeltaCount,completionDoneObserved};
  }catch(error){registrar({...base,status:'error',error:String((error as Error).message),end_to_end_ms:ms(t0)},modelo.runId,sink);throw error;}
}
export async function descargar(sdk:SDK, modelo:{modelId:string}) {
  await sdk.unloadModel({modelId:modelo.modelId,clearStorage:false,autoClose:false});
}
export const sinThink=(value:string)=>value.replace(/<think>[\s\S]*?<\/think>/g,'').trim();
