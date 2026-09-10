import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { report, ffprobe, localEnv } from './lib.mjs';

// Only this key is selected. The secrets file is never sourced, copied or logged.
const awk = process.platform==='win32' ? 'C:/Program Files/Git/usr/bin/awk.exe' : 'awk';
const secretFile = process.env.PSYREC_SECRETS_FILE || 'C:/Users/jeffe/.config/adwen/secrets.env';
const selected = spawnSync(awk, ['-F=', '/^ELEVENLABS_API_KEY=/{sub(/^[^=]*=/, ""); sub(/\r$/, ""); print; exit}', secretFile], { encoding:'utf8',windowsHide:true,env:localEnv() });
if(selected.status!==0) throw new Error('Per-key awk could not read the ElevenLabs key. No secret contents logged.');
const key=selected.stdout.trim().replace(/^(["'])(.*)\1$/,'$2');
if(!key) throw new Error('ELEVENLABS_API_KEY is unavailable.');
const headers={'xi-api-key':key,'content-type':'application/json'};
async function api(path, options={}) {
  const response=await fetch(`https://api.elevenlabs.io${path}`,{...options,headers,signal:AbortSignal.timeout(180000)});
  if(!response.ok) throw new Error(`ElevenLabs HTTP ${response.status} at ${path.split('?')[0]}; response body omitted to protect account details.`);
  return response;
}
mkdirSync('audio',{recursive:true});
const list=await (await api('/v1/voices')).json();
const ranked=list.voices.map(v=>{
  const labels=JSON.stringify(v.labels||{}).toLowerCase();
  const description=(v.description||'').toLowerCase();
  const combined=`${labels} ${description}`;
  const spanish=/spanish|español|espanol|"language":"es"/.test(combined);
  const latin=/latin|mexican|mexico|colomb|argentin|peru|panam|venez|chile|neutral.*spanish/.test(combined);
  return {v,score:spanish&&latin?100+(/neutral/.test(combined)?20:0)+(/calm|narrat|warm|professional/.test(combined)?10:0)-(/peninsular|castilian|spain/.test(combined)?60:0):0};
}).filter(v=>v.score>0).sort((a,b)=>b.score-a.score);
if(process.argv.includes('--list')) {
  console.log(JSON.stringify(ranked.map(({v,score})=>({id:v.voice_id,name:v.name,labels:v.labels,description:v.description,score})),null,2));
} else {
const previous=existsSync('audio/manifest.json')?JSON.parse(readFileSync('audio/manifest.json','utf8')):null;
const chosen=process.env.PSYREC_VOICE_ID ? list.voices.find(v=>v.voice_id===process.env.PSYREC_VOICE_ID) : previous?.voice ? list.voices.find(v=>v.voice_id===previous.voice.id) : ranked[0]?.v;
if(!chosen) throw new Error('No matching Latin American Spanish voice in the account list; use --list and choose an available voice.');
const model='eleven_multilingual_v2';
const voice={id:chosen.voice_id,name:chosen.name,labels:chosen.labels,selection:'Account voice list; Latin American Spanish with neutral/calm narration preference.'};
const settings={stability:.7,similarity_boost:.75,style:0,use_speaker_boost:true,speed:.85};
const manifest={generatedAt:new Date().toISOString(),provider:'ElevenLabs',model,voice,settings,paddingSeconds:.6,timingMethod:'ffprobe format.duration seconds; scene = ceil((duration + 0.6) * 30) / 30',scenes:[]};
report(`Deliverable 3: \`npm run tts\`. Voice: **${voice.name}** (\`${voice.id}\`), model \`${model}\`, speed ${settings.speed}. Key read only by per-key awk into process memory; no secret value persisted or printed.`);
const storyboard=JSON.parse(readFileSync('data/storyboard.json','utf8'));
for(const scene of storyboard.scenes) {
  const file=`audio/${scene.id.toLowerCase()}.mp3`;
  const signature=createHash('sha256').update(JSON.stringify({text:scene.text,voice:voice.id,model,settings})).digest('hex');
  const old=previous?.scenes.find(s=>s.id===scene.id && s.signature===signature);
  if(!old || !existsSync(file)) {
    const response=await api(`/v1/text-to-speech/${encodeURIComponent(voice.id)}?output_format=mp3_44100_128`,{method:'POST',body:JSON.stringify({text:scene.text,model_id:model,language_code:'es',voice_settings:settings})});
    writeFileSync(file,Buffer.from(await response.arrayBuffer()));
  }
  const duration=Number(ffprobe(file).format.duration);
  if(!(duration>0)) throw new Error(`Invalid audio duration ${scene.id}`);
  const entry={id:scene.id,text:scene.text,file,duration,voice,signature,sha256:createHash('sha256').update(readFileSync(file)).digest('hex'),budget:scene.budget,sceneDuration:Math.ceil((duration+.6)*30)/30};
  manifest.scenes.push(entry);
  writeFileSync('audio/manifest.json',JSON.stringify(manifest,null,2)+'\n');
  console.log(`${scene.id}: ${duration.toFixed(3)} s audio; ${entry.sceneDuration.toFixed(3)} s scene${old?' (cached)':''}`);
  report(`- ${scene.id}: \`ffprobe -v error -show_format -show_streams -of json ${file}\` → ${duration.toFixed(6)} s audio; ${entry.sceneDuration.toFixed(6)} s with padding/frame rounding. ${duration>scene.budget?`**Exceeds storyboard budget ${scene.budget} s; exact audio/text preserved.**`:'Within storyboard budget.'}`);
}
const total=manifest.scenes.reduce((sum,s)=>sum+s.sceneDuration,0);
report(`TTS completed: nine MP3s, total composition duration ${total.toFixed(3)} s. The storyboard target is approximate; measured speech plus required padding controls the cut. No narration trimmed, no music.`);
if(total>300) throw new Error('Measured timeline exceeds 300 seconds; report retains timings and audio.');
}
