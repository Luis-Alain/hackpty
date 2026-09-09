import test from 'node:test';
import assert from 'node:assert/strict';
import {queryHistory,queryResponseFormat} from '../packages/runtime/prompts.js';
import {assertCanonicalQueryInputs,assertCanonicalModelComparison,assertProtocolModel} from '../diagnostics/qvac-spike/query-evidence-bindings.js';
function canonical(){const fixture=(id:string)=>({id,question:'What was recorded?',sources:[{sourceId:'N1',text:'Synthetic observation.'}],expectedSourceIds:['N1']});const protocol={version:'psyrec-approved-query-v3',developmentCases:Array.from({length:4},(_,i)=>({...fixture('dev-'+i),split:'development'}))},validation={synthetic:true,cases:Array.from({length:6},(_,i)=>fixture('validation-'+i))};const inputs={cases:[...protocol.developmentCases,...validation.cases.map(c=>({...c,split:'fresh-validation'}))].map(c=>({...c,history:queryHistory(c.question,c.sources),responseFormat:queryResponseFormat(c.sources)}))};return{protocol,validation,inputs};}
test('derived input and comparison cases cannot silently replace canonical questions, text, gold or identity',()=>{
  const {protocol,validation,inputs}=canonical();assertCanonicalQueryInputs(protocol,inputs,validation);
  for(const mutate of [(v:any)=>{v.cases[5].question='Changed question';},(v:any)=>{v.cases[5].sources[0].text='Changed source';},(v:any)=>{v.cases[5].expectedSourceIds=[];},(v:any)=>{v.cases[5].id=v.cases[4].id;}]){const changed=structuredClone(inputs);mutate(changed);assert.throws(()=>assertCanonicalQueryInputs(protocol,changed,validation));}
  const comparison={cases:inputs.cases.map(c=>({...c,split:'model-selection-'+c.split}))};assertCanonicalModelComparison(comparison,inputs);const changed=structuredClone(comparison);changed.cases[0].expectedSourceIds=[];assert.throws(()=>assertCanonicalModelComparison(changed,inputs));
});
test('complete internal model metadata still must identify the model frozen in the protocol',()=>{
  // Synthetic metadata for identity validation only; no native inference claim.
  const asset={id:'query-model',role:'draft',constant:'QWEN3_1_7B_INST_Q4',filename:'model.gguf',modelType:'llamacpp-completion',expectedBytes:100,sha256:'a'.repeat(64)};
  const manifest={sdk:{version:'0.18.2'},models:[asset]},metrics={operation:'query',sdkVersion:'0.18.2',model:asset.constant,modelDetails:{assets:[structuredClone(asset)]}};assertProtocolModel(metrics,manifest,'query');
  for(const mutate of [(m:any)=>{m.model='OTHER_MODEL';m.modelDetails.assets[0].constant='OTHER_MODEL';},(m:any)=>{m.modelDetails.assets[0].sha256='b'.repeat(64);},(m:any)=>{m.sdkVersion='0.19.0';},(m:any)=>{m.operation='extract';}]){const changed=structuredClone(metrics);mutate(changed);assert.throws(()=>assertProtocolModel(changed,manifest,'query'));}
});
