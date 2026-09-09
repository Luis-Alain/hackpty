export type ClinicalCategory = 'negation' | 'number' | 'uncertainty' | 'omission' | 'hallucination';
export interface ClinicalRule { id:string; category:ClinicalCategory; required?:string[]; forbidden?:string[]; }
export interface EditScore { referenceUnits:number; outputUnits:number; substitutions:number; deletions:number; insertions:number; errors:number; rate:number; alignment:{kind:'substitution'|'deletion'|'insertion';reference?:string;output?:string;referenceIndex:number;outputIndex:number}[]; }
export const SCORING_METHODS = {
  wer:'Unicode NFC, lowercase, Unicode letter/number runs; punctuation and whitespace are separators. Levenshtein (substitutions + deletions + insertions) / reference words. Deterministic traceback prefers match, substitution, deletion, insertion. These are evaluation words, never native model tokens.',
  cer:'Unicode NFC, lowercase, whitespace runs collapsed to one space, trim; Unicode code points including punctuation and spaces. Levenshtein edits / reference code points.',
  exact:'Raw output string exactly equals frozen reference, including case, punctuation, and line breaks.',
  clinical:'Manually specified fixture phrase checks after the WER normalization. Every required phrase must occur contiguously and every forbidden phrase must be absent. Category failure rate is failed rules / rules; null when no rules apply. These bounded checks are not an automated clinical safety judgment.',
  lexicalOmission:'Deleted reference words / reference words. Substitutions are separately reported, so a missing clinical phrase is also tested by explicit rules.',
  unsupportedLexical:'Inserted plus substituted output words / output words (zero when output is empty). Alignment spans flag source-unsupported lexical changes for human review; spelling/case/punctuation and paraphrase behavior limit this proxy. It is not a semantic hallucination rate.',
} as const;
export const normalizedWords=(text:string)=>text.normalize('NFC').toLowerCase().match(/[\p{L}\p{N}]+/gu)??[];
export const normalizedCharacters=(text:string)=>Array.from(text.normalize('NFC').toLowerCase().replace(/\s+/gu,' ').trim());
export function editScore(reference:string[],output:string[]):EditScore {
  if(!reference.length)throw new Error('An independently authored nonempty reference is required.');
  if(reference.length*output.length>16000000)throw new Error('Evaluation alignment exceeds the bounded document size.');
  const matrix=Array.from({length:reference.length+1},()=>new Uint32Array(output.length+1));
  for(let i=0;i<=reference.length;i++)matrix[i][0]=i;
  for(let j=0;j<=output.length;j++)matrix[0][j]=j;
  for(let i=1;i<=reference.length;i++)for(let j=1;j<=output.length;j++)matrix[i][j]=Math.min(matrix[i-1][j]+1,matrix[i][j-1]+1,matrix[i-1][j-1]+(reference[i-1]===output[j-1]?0:1));
  let i=reference.length,j=output.length,substitutions=0,deletions=0,insertions=0;const alignment:EditScore['alignment']=[];
  while(i||j){
    if(i&&j&&reference[i-1]===output[j-1]&&matrix[i][j]===matrix[i-1][j-1]){i--;j--;}
    else if(i&&j&&matrix[i][j]===matrix[i-1][j-1]+1){i--;j--;substitutions++;alignment.push({kind:'substitution',reference:reference[i],output:output[j],referenceIndex:i,outputIndex:j});}
    else if(i&&matrix[i][j]===matrix[i-1][j]+1){i--;deletions++;alignment.push({kind:'deletion',reference:reference[i],referenceIndex:i,outputIndex:j});}
    else{j--;insertions++;alignment.push({kind:'insertion',output:output[j],referenceIndex:i,outputIndex:j});}
  }
  return {referenceUnits:reference.length,outputUnits:output.length,substitutions,deletions,insertions,errors:substitutions+deletions+insertions,rate:(substitutions+deletions+insertions)/reference.length,alignment:alignment.reverse()};
}
function contains(words:string[],phrase:string){const needle=normalizedWords(phrase);if(!needle.length)throw new Error('Clinical rule phrase cannot be empty.');return words.some((_,i)=>needle.every((word,j)=>words[i+j]===word));}
export function scoreTranscription(reference:string,output:string,rules:ClinicalRule[]=[]){
  if(typeof reference!=='string'||typeof output!=='string')throw new Error('Reference and raw output must be strings.');
  const words=normalizedWords(output),wer=editScore(normalizedWords(reference),words),cer=editScore(normalizedCharacters(reference),normalizedCharacters(output));
  const clinical=rules.map(rule=>{
    if(!rule.id||!['negation','number','uncertainty','omission','hallucination'].includes(rule.category)||!(rule.required?.length||rule.forbidden?.length))throw new Error('Clinical checks require an identified category and at least one phrase.');
    const missing=(rule.required??[]).filter(phrase=>!contains(words,phrase)),unsupported=(rule.forbidden??[]).filter(phrase=>contains(words,phrase));
    return {...rule,missing,unsupported,passed:missing.length===0&&unsupported.length===0};
  });
  const categories=Object.fromEntries((['negation','number','uncertainty','omission','hallucination'] as const).map(category=>{const checks=clinical.filter(c=>c.category===category),failed=checks.filter(c=>!c.passed).length;return[category,{rules:checks.length,failed,failureRate:checks.length?failed/checks.length:null}];}));
  return {exactTextMatch:reference===output,wer,cer,clinical,categories,lexicalOmissionRate:wer.deletions/wer.referenceUnits,unsupportedLexicalRate:wer.outputUnits?(wer.insertions+wer.substitutions)/wer.outputUnits:0,humanReviewRequired:true};
}
