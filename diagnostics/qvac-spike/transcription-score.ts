import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {assertCompleteMetrics} from '../../packages/runtime/metrics.js';
import {SCORING_METHODS,scoreTranscription} from '../../packages/runtime/transcription-scoring.js';
import {transcriptionCases,sha256,type TranscriptionCase} from './transcription-cases.js';
export function scoreEvidence(fixture:TranscriptionCase,evidence:any){
  if(evidence.synthetic!==true||typeof evidence.result?.text!=='string')throw new Error('Only retained reviewed synthetic outputs may be scored.');
  const {metrics,text}=evidence.result;assertCompleteMetrics(metrics);
  if(metrics.operation!=='extract'||metrics.request.attachment?.sha256!==sha256(fixture.bytes)||metrics.request.attachment.bytes!==fixture.bytes.length||metrics.output.sha256!==sha256(text)||metrics.output.characters!==text.length)throw new Error('Raw output, exact attachment and complete native metrics must bind the same retained run.');
  return {fixtureId:fixture.id,medium:fixture.medium,reference:fixture.reference,referenceSha256:sha256(fixture.reference),referenceMethod:fixture.referenceMethod,imageSha256:sha256(fixture.bytes),runId:metrics.runId,metricsGate:'passed',rawOutputSha256:metrics.output.sha256,rawOutput:text,metrics,score:scoreTranscription(fixture.reference,text,fixture.rules)};
}
export function summarizeScores(cases:ReturnType<typeof scoreEvidence>[]){
  const aggregate=(kind:'wer'|'cer')=>{const totals=cases.reduce((a,c)=>{for(const k of ['referenceUnits','outputUnits','substitutions','deletions','insertions','errors'])a[k]+=c.score[kind][k];return a;},{referenceUnits:0,outputUnits:0,substitutions:0,deletions:0,insertions:0,errors:0});return {...totals,rate:totals.errors/totals.referenceUnits};};
  return {caseCount:cases.length,wer:aggregate('wer'),cer:aggregate('cer'),exactMatches:cases.filter(c=>c.score.exactTextMatch).length,clinicalRules:cases.flatMap(c=>c.score.clinical).length,failedClinicalRules:cases.flatMap(c=>c.score.clinical).filter(c=>!c.passed).length};
}
export async function scoreArchived(root=process.cwd()){
  const outcomes=[];
  for(const fixture of await transcriptionCases(root)){const bytes=await readFile(path.join(root,fixture.archivedFile));const result=scoreEvidence(fixture,JSON.parse(bytes.toString('utf8')));outcomes.push({...result,archivedFile:fixture.archivedFile,archivedFileSha256:sha256(bytes)});}
  return {schemaVersion:1,synthetic:true,classification:'retrospective-development-fixture-scores',heldOut:false,releaseAccepted:false,realHandwritingAccuracyClaim:false,createdAt:new Date().toISOString(),scope:'Six already-seen synthetic development images, including two generated handwriting-style images. No patient data, model training, new inference, physical workflow acceptance or general handwriting reliability claim.',methods:SCORING_METHODS,summary:summarizeScores(outcomes),cases:outcomes};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const output=process.argv[2];if(!output||path.dirname(output).replaceAll('\\','/')!=='artifacts/evidence'||!/^transcription-dev-baseline-[a-zA-Z0-9-]+\.json$/.test(path.basename(output)))throw new Error('Use a new artifacts/evidence/transcription-dev-baseline-<reviewed-id>.json path.');
  const report=await scoreArchived();await writeFile(output,JSON.stringify(report,null,2),{flag:'wx'});console.log(JSON.stringify({file:output,classification:report.classification,summary:report.summary,cases:report.cases.map(c=>({id:c.fixtureId,wer:c.score.wer.rate,cer:c.score.cer.rate,failedRules:c.score.clinical.filter(r=>!r.passed).map(r=>r.id)}))}));
}
