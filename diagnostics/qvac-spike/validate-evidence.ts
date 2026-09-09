import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import { assertCompleteMetrics } from '../../packages/runtime/metrics.js';

/** Hard integration gate. Missing artifacts NEVER become skipped or passing. */
export async function validateNativeEvidence(directory=path.resolve('artifacts','evidence')) {
  const verified=[];
  for(const operation of ['extract','draft'] as const){
    const file=path.join(directory,`synthetic-${operation}.json`);
    const artifact=JSON.parse(await readFile(file,'utf8'));
    if(artifact.synthetic!==true||!artifact.result?.text?.trim())throw new Error(`Missing actual synthetic output: ${file}`);
    assertCompleteMetrics(artifact.result.metrics);
    const m=artifact.result.metrics;
    if(m.operation!==operation||m.sdkVersion!=='0.18.2'||m.runtime.platform!=='win32'||m.native.backendDevice!=='gpu')throw new Error(`Native Windows/GPU/version evidence mismatch: ${file}`);
    if(createHash('sha256').update(artifact.result.text).digest('hex')!==m.output.sha256)throw new Error(`Output digest mismatch: ${file}`);
    verified.push({operation,runId:m.runId,file,native:m.native});
  }
  return {status:'passed',scope:'Native SDK feasibility only; full UI workflow requires its own evidence',verified};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{console.log(JSON.stringify(await validateNativeEvidence(),null,2));}
  catch(error){console.error(`Runtime release evidence gate FAILED: ${(error as Error).message}`);process.exitCode=1;}
}
