import {readFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {assertCompleteMetrics} from '../../packages/runtime/metrics.js';
import {transcriptionCases,sha256} from './transcription-cases.js';
import {scoreArchived,scoreEvidence,summarizeScores} from './transcription-score.js';
import {scoreQuerySelection} from './query-evaluation.js';
import {scoreSourceSelection} from './source-selection-scoring.js';
import {assertCanonicalQueryInputs,assertCanonicalModelComparison,assertProtocolModel} from './query-evidence-bindings.js';
const [baselinePath,ablationPrefix,queryPrefix,selectionPrefix,comparisonPrefix]=process.argv.slice(2);
for(const file of [baselinePath,ablationPrefix,queryPrefix])if(!file||path.dirname(file).replaceAll('\\','/')!=='artifacts/evidence')throw new Error('Verification only reads explicitly selected reviewed synthetic artifacts/evidence paths.');
const json=async(file:string)=>JSON.parse(await readFile(file,'utf8'));
const baseline=await json(baselinePath),fresh=await scoreArchived();assert.equal(baseline.synthetic,true);assert.equal(baseline.heldOut,false);assert.equal(baseline.releaseAccepted,false);assert.deepEqual(baseline.cases,fresh.cases);assert.deepEqual(baseline.summary,fresh.summary);
const protocol=await json(ablationPrefix+'-protocol.json'),protocolSha=sha256(await readFile(ablationPrefix+'-protocol.json'));
const evaluated=[];
for(const fixture of await transcriptionCases()){
  const record=await json(ablationPrefix+'-'+fixture.id+'.json'),frozen=protocol.cases.find(c=>c.id===fixture.id);assert.equal(record.synthetic,true);assert.equal(record.releaseAccepted,false);assert.equal(record.protocolSha256,protocolSha);assert.equal(frozen.imageSha256,sha256(fixture.bytes));assert.equal(frozen.referenceSha256,sha256(fixture.reference));assert.deepEqual(frozen.rules,fixture.rules);
  const scored=scoreEvidence(fixture,record);assertProtocolModel(record.result.metrics,protocol.modelManifest,'extract');assert.deepEqual(record.score,scored.score);assert.equal(record.result.metrics.request.promptTemplateVersion,protocol.candidate.version);assert.equal(record.result.metrics.request.history[0].content,protocol.candidate.prompt);evaluated.push(scored);
}
const ablationSummary=await json(ablationPrefix+'-summary.json');assert.equal(ablationSummary.protocolSha256,protocolSha);assert.deepEqual(ablationSummary.transcription,summarizeScores(evaluated));assert.equal(ablationSummary.productionPromptUnchanged,true);
async function checkQueries(prefix:string,p:any,protocolDigest:string,legacy:boolean){
  const outcomes=[];const cases=legacy?p.queryProfile.cases:p.cases;
  for(const fixture of cases){
    const record=await json(prefix+(legacy?'-query-':'-')+fixture.id+'.json'),m=record.result.metrics;assert.equal(record.synthetic,true);assert.equal(record.releaseAccepted,false);assert.equal(record.protocolSha256,protocolDigest);assertCompleteMetrics(m);assertProtocolModel(m,p.modelManifest,'query');assert.equal(m.operation,'query');assert.equal(m.request.promptTemplateVersion,legacy?p.queryProfile.version:p.version);assert.deepEqual(m.request.history,fixture.history);assert.deepEqual(m.request.context,fixture.sources);assert.equal(sha256(record.result.text),m.output.sha256);assert.equal(record.result.text.length,m.output.characters);assert.deepEqual(m.request.responseFormat,legacy?undefined:p.responseFormat);
    const score=scoreQuerySelection(record.result.text,fixture);assert.deepEqual(record.score,score);outcomes.push({id:fixture.id,runId:m.runId,score,metrics:m});
  }
  return outcomes;
}
const legacy=await checkQueries(ablationPrefix,protocol,protocolSha,true);assert.deepEqual(ablationSummary.queryCases,legacy);
const structuredProtocol=await json(queryPrefix+'-protocol.json'),structuredSha=sha256(await readFile(queryPrefix+'-protocol.json'));
const structured=await checkQueries(queryPrefix,structuredProtocol,structuredSha,false),structuredSummary=await json(queryPrefix+'-summary.json');assert.equal(structuredSummary.protocolSha256,structuredSha);assert.deepEqual(structuredSummary.cases,structured);assert.equal(structuredSummary.completed,structured.length===4);assert.equal(structuredSummary.qualityPassed,structured.length===4&&structured.every(c=>c.score.passed));
let selection:any[]=[];
if(selectionPrefix){
  if(path.dirname(selectionPrefix).replaceAll('\\','/')!=='artifacts/evidence')throw new Error('Selection verification is limited to reviewed synthetic artifacts.');
  const p=await json(selectionPrefix+'-protocol.json'),pSha=sha256(await readFile(selectionPrefix+'-protocol.json')),inputs=await json(selectionPrefix+'-inputs.json'),inputSha=sha256(await readFile(selectionPrefix+'-inputs.json'));
  assert.equal(inputs.protocolSha256,pSha);if(path.dirname(inputs.validationFile).replaceAll('\\','/')!=='artifacts/evidence')throw new Error('Validation input is outside reviewed synthetic evidence.');assert.equal(inputs.validationFileSha256,sha256(await readFile(inputs.validationFile)));assert.equal(inputs.cases.length,10);assertCanonicalQueryInputs(p,inputs,await json(inputs.validationFile));
  for(const fixture of inputs.cases){const r=await json(selectionPrefix+'-'+fixture.id+'.json'),m=r.result.metrics;assert.equal(r.synthetic,true);assert.equal(r.releaseAccepted,false);assert.equal(r.protocolSha256,pSha);assert.equal(r.inputsSha256,inputSha);assertCompleteMetrics(m);assertProtocolModel(m,p.modelManifest,'query');assert.equal(m.request.promptTemplateVersion,p.version);assert.equal(m.request.history[0].content,p.systemPrompt);assert.deepEqual(m.request.history,fixture.history);assert.deepEqual(m.request.context,fixture.sources);assert.deepEqual(m.request.responseFormat,fixture.responseFormat);assert.equal(m.output.sha256,sha256(r.result.text));assert.equal(m.output.characters,r.result.text.length);const score=scoreSourceSelection(r.result.text,fixture);assert.deepEqual(r.score,score);selection.push({id:fixture.id,split:fixture.split,runId:m.runId,score,metrics:m});}
  const s=await json(selectionPrefix+'-summary.json');assert.deepEqual(s.cases,selection);assert.equal(s.completed,selection.length===10);assert.equal(s.qualityPassed,selection.length===10&&selection.every(c=>c.score.passed));
}
let comparison:any[]=[];
if(comparisonPrefix){
  if(path.dirname(comparisonPrefix).replaceAll('\\','/')!=='artifacts/evidence')throw new Error('Model comparison verification is limited to reviewed synthetic evidence.');
  const p=await json(comparisonPrefix+'-protocol.json'),pSha=sha256(await readFile(comparisonPrefix+'-protocol.json'));
  for(const f of [p.sourceProtocolFile,p.sourceInputsFile])if(path.dirname(f).replaceAll('\\','/')!=='artifacts/evidence')throw new Error('Model comparison source is outside reviewed synthetic evidence.');
  assert.equal(p.sourceProtocolSha256,sha256(await readFile(p.sourceProtocolFile)));assert.equal(p.sourceInputsSha256,sha256(await readFile(p.sourceInputsFile)));assert.equal(p.cases.length,10);assert.equal(p.heldOut,false);const original=await json(p.sourceProtocolFile),originalInputs=await json(p.sourceInputsFile);if(path.dirname(originalInputs.validationFile).replaceAll('\\','/')!=='artifacts/evidence')throw new Error('Canonical model validation manifest is outside reviewed synthetic evidence.');assert.equal(originalInputs.validationFileSha256,sha256(await readFile(originalInputs.validationFile)));assertCanonicalQueryInputs(original,originalInputs,await json(originalInputs.validationFile));assertCanonicalModelComparison(p,originalInputs);
  for(const fixture of p.cases){const r=await json(comparisonPrefix+'-'+fixture.id+'.json'),m=r.result.metrics;assert.equal(r.synthetic,true);assert.equal(r.releaseAccepted,false);assert.equal(r.protocolSha256,pSha);assertCompleteMetrics(m);assertProtocolModel(m,p.modelManifest,'query');assert.equal(m.model,'QWEN3_4B_INST_Q4_K_M');assert.equal(m.sdkVersion,'0.18.2');assert.equal(m.modelDetails.assets[0].sha256,'7485fe6f11af29433bc51cab58009521f205840f5b4ae3a32fa7f92e8534fdf5');assert.equal(m.modelDetails.assets[0].actualBytes,2497280256);assert.equal(m.request.promptTemplateVersion,p.version);assert.deepEqual(m.request.history,fixture.history);assert.deepEqual(m.request.context,fixture.sources);assert.deepEqual(m.request.responseFormat,fixture.responseFormat);assert.equal(m.output.sha256,sha256(r.result.text));assert.equal(m.output.characters,r.result.text.length);const score=scoreSourceSelection(r.result.text,fixture);assert.deepEqual(r.score,score);comparison.push({id:fixture.id,split:fixture.split,runId:m.runId,score,metrics:m});}
  const summary=await json(comparisonPrefix+'-summary.json');assert.deepEqual(summary.cases,comparison);assert.equal(summary.completed,comparison.length===10);assert.equal(summary.qualityPassed,comparison.length===10&&comparison.every(c=>c.score.passed));
}
console.log(JSON.stringify({status:'passed-evidence-bindings',newRealRunsChecked:evaluated.length+legacy.length+structured.length+selection.length+comparison.length,baselineRunsChecked:baseline.cases.length,heldOut:false,releaseAccepted:false,baseline:baseline.summary,extractCandidate:ablationSummary.transcription,legacyQueryPassed:legacy.filter(c=>c.score.passed).length,structuredQueryPassed:structured.filter(c=>c.score.passed).length,sourceSelection:selection.map(c=>({id:c.id,split:c.split,passed:c.score.passed})),modelComparison:comparison.map(c=>({id:c.id,passed:c.score.passed})),scope:'Verifies exact retained synthetic outputs, attachment hashes, frozen protocols, scoring and all mandatory native metrics. Does not convert quality failures to success, establish handwriting accuracy, or certify a human workflow.'}));
