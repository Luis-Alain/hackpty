import { readdir, readFile, realpath, rm } from 'node:fs/promises';
import path from 'node:path';
import { assertWithin } from './models.js';

export const OWNER_MARKER='psyrec-runtime-owner.json';
/** Recover only our marked directories after their parent runtime process died.
 * A live/unknown owner, malformed marker, symlink, or unmarked directory is
 * never removed. An abrupt OS kill can leave plaintext until the next launch. */
export async function recoverAbandonedTemporaryFiles(projectRoot:string):Promise<string[]> {
  const root=path.join(path.resolve(projectRoot),'.local','runtime-tmp');
  const resolvedRoot=await realpath(root).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
  if(!resolvedRoot)return [];
  assertWithin(projectRoot,resolvedRoot);
  const removed:string[]=[];
  for(const entry of await readdir(root,{withFileTypes:true})){
    if(!entry.isDirectory()||entry.isSymbolicLink()||!/^[-a-f0-9]{36}$/i.test(entry.name))continue;
    const directory=path.join(root,entry.name);
    const resolved=await realpath(directory).catch(()=>null);if(!resolved)continue;
    assertWithin(resolvedRoot,resolved);
    const owner=await readFile(path.join(directory,OWNER_MARKER),'utf8').then(JSON.parse).catch(()=>null);
    if(owner?.schemaVersion!==1||!Number.isSafeInteger(owner.ownerProcessId)||owner.ownerProcessId<1||owner.ownerProcessId===process.pid)continue;
    let dead=false;
    try{process.kill(owner.ownerProcessId,0);}catch(error){dead=(error as NodeJS.ErrnoException).code==='ESRCH';}
    if(!dead)continue;
    await rm(directory,{recursive:true,force:true});removed.push(entry.name);
  }
  return removed;
}
