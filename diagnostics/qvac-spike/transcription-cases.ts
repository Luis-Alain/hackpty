import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { SYNTHETIC_SOURCE,QUALITY_FIXTURES } from './fixture.js';
import type { ClinicalRule } from '../../packages/runtime/transcription-scoring.js';
export const sha256=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
export interface TranscriptionCase {id:string;medium:'printed'|'generated-handwriting-style';bytes:Buffer;reference:string;referenceMethod:string;rules:ClinicalRule[];archivedFile:string;}
const rule=(id:string,category:ClinicalRule['category'],required:string[]):ClinicalRule=>({id,category,required});
export async function transcriptionCases(root=process.cwd()):Promise<TranscriptionCase[]> {
  const cases:TranscriptionCase[]=[{id:'DEMO-001',medium:'printed',bytes:await readFile(path.join(root,'diagnostics/qvac-spike/fixtures/synthetic-note.png')),reference:SYNTHETIC_SOURCE,referenceMethod:'Original authored bitmap text; previously seen development fixture.',archivedFile:'artifacts/evidence/synthetic-extract.json',rules:[rule('negative-diagnosis','negation',['no diagnosis recorded']),rule('duration-three-nights','number',['three nights']),rule('follow-up','omission',['review sleep log'])]}];
  for(const fixture of QUALITY_FIXTURES){
    const obscure='obscureLine' in fixture?fixture.obscureLine:undefined;
    const lines=fixture.source.split('\n');if(obscure!==undefined)lines[obscure]='[unclear]';
    const rules:ClinicalRule[]=fixture.id==='ambiguous'?[rule('uncertain-duration','uncertainty',['duration may be three nights','patient is unsure']),rule('possible-three-nights','number',['three nights'])]:[rule('negative-diagnosis','negation',['no diagnosis recorded'])];
    if(fixture.id==='missing')rules.push(rule('absent-duration','uncertainty',['duration not recorded']));
    if(fixture.id==='unreadable')rules.push(rule('masked-line-abstention','omission',['unclear']));
    if(fixture.id!=='ambiguous')rules.push({id:'unsupported-duration',category:'hallucination',forbidden:['three nights','3 nights','two nights','2 nights','one night','1 night']});
    cases.push({id:fixture.id,medium:'printed',bytes:await readFile(path.join(root,'diagnostics/qvac-spike/fixtures',fixture.id+'.png')),reference:lines.join('\n'),referenceMethod:obscure===undefined?'Original authored bitmap text; previously seen development fixture.':'Visible authored lines plus required [unclear] abstention marker for a completely masked line. Hidden duration is excluded from the reference.',rules,archivedFile:'artifacts/evidence/quality-'+fixture.id+'-extract.json'});
  }
  const manifest=JSON.parse(await readFile(path.join(root,'artifacts/fixtures/handwriting/manifest.json'),'utf8'));
  if(manifest.syntheticOnly!==true||manifest.groundTruthReview?.passed!==true||manifest.fixtures?.length!==2)throw new Error('Reviewed synthetic handwriting manifest is required.');
  for(const fixture of manifest.fixtures){
    if(!/^SYN-HW-00[12]$/.test(fixture.id)||path.basename(fixture.file)!==fixture.file||!fixture.groundTruth?.trim())throw new Error('Unexpected reviewed handwriting fixture.');
    const bytes=await readFile(path.join(root,'artifacts/fixtures/handwriting',fixture.file));if(sha256(bytes)!==fixture.sha256)throw new Error('Handwriting fixture differs from reviewed image hash.');
    const rules=[rule('negative-diagnosis','negation',['no diagnosis is recorded']),rule('synthetic-boundary','omission',['not a real patient'])];
    if(fixture.id==='SYN-HW-001')rules.push(rule('duration-three-nights','number',['three nights']),rule('mood-fact','omission',['mood was described as tired']));
    else rules.push(rule('absent-duration','uncertainty',['sleep duration was not recorded']),{id:'unsupported-duration',category:'hallucination',forbidden:['three nights','3 nights','two nights','2 nights']});
    cases.push({id:fixture.id,medium:'generated-handwriting-style',bytes,reference:fixture.groundTruth,referenceMethod:'Previously visually reviewed independent text from the synthetic image manifest. Previously seen development fixture; no general handwriting inference.',rules,archivedFile:'artifacts/evidence/handwriting-exploratory-'+fixture.id+'.json'});
  }
  if(new Set(cases.map(c=>c.id)).size!==6)throw new Error('Six unique development fixtures are required.');
  return cases;
}
