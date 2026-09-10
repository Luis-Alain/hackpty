import assert from 'node:assert/strict';
import {queryHistory,queryResponseFormat,validateQueryInput} from '../../packages/runtime/prompts.js';
export function assertCanonicalQueryInputs(protocol:any,inputs:any,validation:any){
  assert.equal(validation.synthetic,true);assert.equal(protocol.developmentCases.length,4);assert.equal(validation.cases.length,6);
  const original=[...protocol.developmentCases,...validation.cases.map(c=>({...c,split:'fresh-validation'}))];
  assert.equal(new Set(original.map(c=>c.id)).size,10,'Canonical cases require ten unique IDs.');
  const expected=original.map(c=>{assert.match(c.id,/^[-a-zA-Z0-9]+$/);validateQueryInput(c.question,c.sources);assert.ok(Array.isArray(c.expectedSourceIds));assert.equal(new Set(c.expectedSourceIds).size,c.expectedSourceIds.length);assert.ok(c.expectedSourceIds.every(id=>c.sources.some(source=>source.sourceId===id)));return {...c,history:queryHistory(c.question,c.sources,protocol.version),responseFormat:queryResponseFormat(c.sources,protocol.version)};});
  assert.deepEqual(inputs.cases,expected,'Derived inputs must preserve every canonical question, passage and gold ID, with only frozen prompt/schema derivation.');
}
export function assertCanonicalModelComparison(protocol:any,inputs:any){
  assert.equal(new Set(inputs.cases.map(c=>c.id)).size,10);assert.equal(inputs.cases.length,10);
  assert.deepEqual(protocol.cases,inputs.cases.map(c=>({...c,split:'model-selection-'+c.split})),'Model comparison must preserve the exact frozen cases; only the explicit split label may change.');
}
export function assertProtocolModel(metrics:any,manifest:any,operation:'extract'|'query'|'review'){
  assert.equal(metrics.operation,operation);assert.equal(metrics.sdkVersion,manifest.sdk.version);
  const roles=operation==='extract'?['extract','projector']:operation==='review'?['review']:['draft'];const expected=manifest.models.filter(asset=>roles.includes(asset.role));assert.equal(expected.length,roles.length);assert.equal(metrics.modelDetails.assets.length,roles.length);
  for(const asset of metrics.modelDetails.assets){const canonical=expected.find(a=>a.role===asset.role);assert.ok(canonical,'Asset role must be in the frozen protocol.');for(const key of ['id','role','constant','filename','modelType','expectedBytes','sha256'])assert.equal(asset[key],canonical[key],'Frozen model asset '+key);}
  assert.equal(metrics.model,expected.find(a=>a.role===roles[0]).constant);
}
