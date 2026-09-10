import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { root, ffprobe } from './lib.mjs';

const read = path => JSON.parse(readFileSync(path, 'utf8'));
export const escape = value => String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
export async function build({ draft = false, resultsOverride } = {}) {
  const storyboard = read('data/storyboard.json');
  if (!draft && !existsSync('audio/manifest.json')) throw new Error('Run npm run tts first: audio/manifest.json is required.');
  const manifest = existsSync('audio/manifest.json') ? read('audio/manifest.json') : { scenes: storyboard.scenes.map(s => ({...s, duration:s.budget - .6})) };
  const results = resultsOverride ?? (existsSync('data/results.json') ? read('data/results.json') : {pending:true, configurations:[], hardware:'',disclosure:''});
  if (results.pending !== true && results.pending !== false) throw new Error('Results must explicitly specify pending.');
  const cases = read('data/clinical-examples.json');
  const captures = read('captures/manifest.json');
  const broll = existsSync('broll/manifest.json') ? read('broll/manifest.json') : {clips:[]};
  const boxes = [], traces = [], assets = [], timeline = []; let offset = 0, serial = 0;
  function box(scene, text, x,y,w,h, cls='body', extra='') {
    const id = `box-${++serial}`; boxes.push({id, scene, x,y,w,h, text:String(text)});
    return `<div id="${id}" class="box ${cls}" data-text-box="true" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px" ${extra}>${escape(text)}</div>`;
  }
  function panel(x,y,w,h, cls='') { return `<div class="box panel ${cls}" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px"></div>`; }
  function media(file,scene,x,y,w,h,duration,cls='') {
    const full=resolve(file); if (!relative(root, full) || relative(root,full).startsWith('..')) throw new Error('Media must stay inside project.');
    const id=`media-${++serial}`;
    assets.push({file,scene,duration});
    return `<video id="${id}" class="clip media ${cls}" src="${escape(file)}" muted playsinline preload="auto" data-start="${offset}" data-duration="${duration}" data-media-start="0" data-volume="0" data-track-index="1" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px"></video>`;
  }
  function capture(scene,x,y,w,h,kind,duration) {
    const found=captures.captures.find(c=>c.scene===scene && existsSync(`captures/${c.file}`));
    if (found) {
      if (!captures.synthetic || found.synthetic!==true) throw new Error('Capture requires explicit synthetic attestation.');
      const probe=ffprobe(`captures/${found.file}`), stream=probe.streams.find(s=>s.codec_type==='video');
      if (Math.abs(stream.width/stream.height-w/h)>.03) throw new Error(`Capture ${scene} aspect does not match its slot.`);
      if (Number(probe.format.duration)<duration) throw new Error(`Capture ${scene} too short; supply a full-scene capture.`);
      return media(`captures/${found.file}`,scene,x,y,w,h,duration,'capture-video');
    }
    return `<div class="box capture" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px"></div>`+box(scene,kind,x+26,y+32,w-52,40,'eyebrow')+box(scene,'captura de pantalla pendiente',x+26,y+h/2-44,w-52,110,'capture-label')+box(scene,w<400?'SYNTHETIC':'SYNTHETIC WORKFLOW',x+26,y+h-62,w-52,35,'small mono muted');
  }
  function ambient(scene,x,y,w,h,duration) {
    const item=broll.clips.find(c=>c.scene===scene && existsSync(`broll/${c.file}`));
    if (!item || broll.synthetic!==true) return panel(x,y,w,h,'tint')+box(scene,'B-roll pendiente',x+32,y+h/2-20,w-64,50,'subtitle');
    // Use the supplied clip once; flat diagram/title remains for the rest of the scene.
    const seconds=Math.min(duration,Number(ffprobe(`broll/${item.file}`).format.duration));
    return media(`broll/${item.file}`,scene,x,y,w,h,seconds)+box(scene,'AMBIENTE GENERADO · SINTÉTICO',x+20,y+h-64,w-40,50,'small chip');
  }
  function binding(scene,path,x,y,w,h,cls='small') {
    const value=path.split('.').reduce((o,k)=>o?.[k],results);
    if (value===undefined || value===null) throw new Error(`Missing results value: ${path}`);
    traces.push({path,text:String(value)});
    return box(scene,value,x,y,w,h,cls,`data-result-path="${escape(path)}"`);
  }
  const titles=['PsyRec','¿Qué cambió desde la visita anterior y qué falta aclarar?','De la captura al recibo','Leer. Comparar. Corregir.','Un historial, evidencia acotada.','Aprobar el texto exacto.','Resultados medidos','Lo que no afirmamos','PsyRec'];
  const sections=['Nota → registro','La pregunta clínica','Captura y transferencia','VisionPsy · fuente revisada','MedPsy · revisión del historial','Borrador, aprobación y cifrado',results.pending?'Evaluación · pendiente':'Evaluación · evidencia','Límites de la evidencia','Local. Verificable. Humano.'];
  const scenes=storyboard.scenes.map((s,index)=>{
    const audio=manifest.scenes.find(a=>a.id===s.id); if (!audio || audio.text!==s.text) throw new Error(`Audio text mismatch ${s.id}`);
    const duration=Math.ceil((audio.duration+.6)*30)/30;
    const dark=[0,6,8].includes(index); const id=s.id;
    timeline.push({id,start:offset,duration,audioDuration:audio.duration,budget:s.budget});
    let html=box(id,sections[index],108,64,1000,44,'eyebrow');
    html+=box(id,'SINTÉTICO · NO ES UN PACIENTE REAL',1260,62,552,50,'chip');
    if(index!==6 || results.pending) html+=box(id,titles[index],108,index===0||index===8?200:140,index===0?900:1704,index===0||index===8?195:index===1?165:140,`title ${index===0||index===8?'hero':''} ${index===1?'question-title':''}`);
    if(index===0) {
      html+=box(id,'De una foto de una nota a un registro revisado. Todo local.',116,423,850,210,'subtitle');
      html+=panel(1100,265,712,440,'tint')+box(id,'Android → Windows PC',1140,420,632,100,'subtitle ink');
      html+=ambient(id,1100,265,712,440,duration);
      html+=box(id,'Flujo implementado · demostración física pendiente',116,773,1520,74,'body muted');
    } else if(index===1) {
      const c=cases.find(c=>c.id==='CR-05');
      html+=panel(108,326,782,490)+panel(1030,326,782,490,'tint');
      html+=`<div id="notes-left">`+box(id,c.historical[0].sourceDate,144,363,700,45,'mono small')+box(id,'Previous approved note',144,436,700,55,'subtitle')+box(id,c.historical[0].text.split('\n').find(l=>l.startsWith('Medication: amlodipine')),144,548,682,155,'body')+'</div>';
      html+=`<div id="notes-right">`+box(id,c.current.sourceDate,1066,363,700,45,'mono small')+box(id,'Current reviewed source',1066,436,700,55,'subtitle')+box(id,c.current.text.split('\n').find(l=>l.startsWith('Medication: amlodipine')),1066,548,682,155,'body')+'</div>';
      html+=box(id,'→',922,505,82,100,'title')+box(id,'Unknown · requires clarification',1066,739,700,55,'small');
    } else if(index===2) {
      html+=capture(id,126,300,306,544,'Android · 9:16',duration);
      html+=box(id,'Captura cifrada · Emparejamiento por QR',505,302,1275,64,'subtitle');
      html+=box(id,'TLS fijado · Recibo duradero',505,382,1275,64,'subtitle');
      const steps=[['Phone','Capture'],['Encrypted queue','Retain'],['Windows PC','Durable receipt']];
      steps.forEach(([a,b],i)=>{let x=505+i*438;html+=panel(x,499,397,146,'tint')+box(id,a,x+20,521,357,50,'body')+box(id,b,x+20,585,357,40,'small muted');if(i<2)html+=box(id,'→',x+401,543,37,64,'body');});
      html+='<div id="receipt-step">'+box(id,'Matching receipt → remove queued photo',505,704,1275,70,'body')+'</div>';
      html+=box(id,'Diagrama del flujo · aceptación física pendiente',505,794,1275,60,'small muted');
    } else if(index===3) {
      html+=box(id,'VisionPsy extrae · El profesional corrige · Referencia humana y WER/CER',108,250,1704,44,'small');
      html+=capture(id,108,303,960,540,'Desktop · 16:9',duration);
      html+=panel(1110,303,702,540,'tint');
      html+=box(id,'Human reference',1146,335,624,60,'subtitle');
      html+=box(id,'Original extraction ↔ human reference',1146,427,624,85,'body');
      html+=box(id,'WER  —     CER  —',1146,556,624,60,'subtitle mono');
      html+=box(id,'Valores pendientes de evidencia',1146,641,624,60,'small muted');
      html+=box(id,'[unclear] = requiere revisión',1146,734,624,65,'body');
    } else if(index===4) {
      html+=capture(id,108,307,480,270,'Chart review · 16:9',duration);
      html+=box(id,'Sólo lectura\nSin aprobar\nCobertura declarada',108,620,480,170,'body');
      ['Cambiado','Sin cambio','Nuevo','Resuelto','Conflicto','Desconocido'].forEach((kind,i)=>{html+=`<div id="finding-kind-${i}">`+box(id,kind,640+i*194,296,182,48,'small')+'</div>';});
      html+=box(id,'REFERENCIA HUMANA · EJEMPLOS DE LA SUITE',640,390,1172,40,'eyebrow');
      const cr09=cases.find(c=>c.id==='CR-09'), cr05=cases.find(c=>c.id==='CR-05');
      const line=(text,term)=>text.split('\n').find(l=>l.startsWith(term));
      html+='<div id="example-conflict">'+panel(640,454,1172,400,'error');
      html+=box(id,'CR-09 · Conflicto de alergias',674,480,1100,56,'subtitle');
      cr09.historical.forEach((h,i)=>{html+=box(id,`H${i+1} · ${h.sourceDate}`,674,555+i*100,320,42,'small mono')+box(id,line(h.text,'Allergies:'),1010,550+i*100,754,78,'small');});
      html+=box(id,`C1 · ${cr09.current.sourceDate} · La nota actual no resuelve el conflicto.`,674,765,1100,67,'small');
      html+='</div><div id="example-unknown">'+panel(640,454,1172,400,'tint');
      html+=box(id,'CR-05 · Dosis actual desconocida',674,480,1100,56,'subtitle');
      html+=box(id,`H1 · ${cr05.historical[0].sourceDate}`,674,555,320,42,'small mono')+box(id,line(cr05.historical[0].text,'Medication: amlodipine'),1010,550,754,92,'small');
      html+=box(id,`C1 · ${cr05.current.sourceDate}`,674,671,320,42,'small mono')+box(id,line(cr05.current.text,'Medication: amlodipine'),1010,655,754,130,'small');
      html+=box(id,'La dosis histórica no establece la dosis actual.',674,793,1100,42,'small');
      html+='</div>';
    } else if(index===5) {
      html+=box(id,'Borrador acotado · Aprobación exacta · Guardado cifrado · Historial por paciente',108,250,1704,44,'small');
      html+=capture(id,108,303,960,540,'Desktop · 16:9',duration);
      const labels=['Source-only draft','Review exact text','Approve & encrypt','Lock → reload'];
      labels.forEach((text,i)=>{html+=`<div id="approval-${i}">`+panel(1110,303+i*132,702,108,i===2?'tint':'')+box(id,text,1140,328+i*132,642,58,'body')+'</div>';});
      html+=box(id,'Historial por paciente · aceptación física y humana pendiente',108,859,1704,45,'small muted');
    } else if(index===6) {
      if(results.pending) {
        html+=box(id,'Resultados pendientes de la evaluación',108,336,1704,165,'title');
        if(results.suiteLabel) html+=binding(id,'suiteLabel',116,552,1650,60,'body');
        html+=box(id,'Cobertura · Afirmaciones no respaldadas · Validez JSON',116,651,1650,58,'body muted');
        html+=box(id,'TTFT nativo · Tokens/s · Tiempo de carga',116,735,1650,60,'body muted');
        if(results.hardware) html+=binding(id,'hardware',116,836,1680,80,'small mono muted');
      } else {
        if(!results.source?.length || results.configurations?.length!==4) throw new Error('Completed results require evidence sources and four configurations.');
        if(!Number.isFinite(results.strictGoldRecallTarget) || results.strictGoldRecallTarget<0 || results.strictGoldRecallTarget>1) throw new Error('Completed results require the declared strictGoldRecallTarget.');
        const bestIndex=results.configurations.reduce((best,c,i)=>c.strictGoldRecall>results.configurations[best].strictGoldRecall?i:best,0);
        const meetsTarget=results.configurations.some(c=>c.strictGoldRecall>=results.strictGoldRecallTarget);
        const bestTied=results.configurations.filter(c=>c.strictGoldRecall===results.configurations[bestIndex].strictGoldRecall).length>1;
        timeline[timeline.length-1].resultsSwitch=offset+duration*.52;
        html+='<div id="results-accuracy">';
        html+=box(id,meetsTarget?'El objetivo se alcanza en la evaluación':'Ninguna configuración alcanza el objetivo',108,140,1704,80,'title results-title','data-results-headline="true"');
        html+=binding(id,'suiteLabel',116,234,1680,42,'small');
        html+=box(id,bestTied?'Mayor cobertura estricta · empate':'Mayor cobertura estricta',116,284,1250,40,'small');
        html+=box(id,'Objetivo ≥',1450,284,185,40,'small');
        html+=binding(id,'strictGoldRecallTarget',1645,284,150,40,'metric-value');
        html+=binding(id,`configurations.${bestIndex}.label`,116,326,1680,42,'small');
        const accuracy=[['Cobertura\nestricta','strictGoldRecall',734,236],['Sólo\ntérminos','termOnlyRecall',1000,236],['Términos\nprohibidos','forbiddenHits',1266,236],['JSON válido\nal primer intento','firstPassValidity',1532,252]];
        html+=box(id,'Configuración',136,392,550,64,'small');
        accuracy.forEach(([label,key,x,w])=>{html+=box(id,label,x,386,w,72,'small');});
        results.configurations.forEach((c,i)=>{
          const y=474+i*104;
          html+=panel(108,y,1704,94,'tint');
          html+=binding(id,`configurations.${i}.label`,136,y+12,550,72,'small ink');
          accuracy.forEach(([label,key,x,w])=>{html+=binding(id,`configurations.${i}.${key}`,x,y+29,w,40,`metric-value ink ${key==='forbiddenHits'||key==='firstPassValidity'?'compact-metric':''}`);});
        });
        html+=box(id,'Proporciones de cobertura y validez · términos prohibidos: conteo de coincidencias',116,890,1680,34,'metric-label muted');
        html+='</div><div id="results-performance">';
        html+=box(id,'Rendimiento nativo por configuración',108,140,1704,80,'title results-title');
        html+=box(id,'Promedios por caso · carga medida alrededor de loadModel',116,234,1680,42,'small');
        const performance=[['TTFT nativo\nms','nativeTtftMs',720,192],['Generación\ntokens/s','tokensPerSecond',940,192],['Carga\nms','loadMs',1160,160],['Entrada\ntokens','promptTokens',1350,190],['Salida\ntokens','generatedTokens',1570,210]];
        html+=box(id,'Configuración',136,294,550,66,'small');
        performance.forEach(([label,key,x,w])=>{html+=box(id,label,x,284,w,72,'small');});
        results.configurations.forEach((c,i)=>{
          const y=366+i*92;
          html+=panel(108,y,1704,84,'tint');
          html+=binding(id,`configurations.${i}.label`,136,y+7,550,72,'small ink');
          performance.forEach(([label,key,x,w])=>{html+=binding(id,`configurations.${i}.${key}`,x,y+25,w,40,'metric-value ink');});
        });
        if(results.hardware) html+=binding(id,'hardware',116,746,1680,62,'results-hardware mono muted');
        if(results.disclosure) html+=binding(id,'disclosure',116,809,1680,115,'results-disclosure muted');
        html+='</div>';
      }
    } else if(index===7) {
      const items=[['Suite pequeña y sintética','Sin validación clínica.'],[results.pending?'Comparación de modelos pendiente':'MedPsy · sin ventaja demostrada en esta suite',results.pending?'Los resultados medidos aún no están disponibles.':'El modelo genérico logra la mayor cobertura estricta entre las configuraciones evaluadas.'],['SDK 0.18.2 · razonamiento y esquema estricto','Combinación no viable en la prueba documentada.'],['Evidencia física y aceptación humana','Pendientes según el estado del repositorio.']];
      items.forEach(([title,desc],i)=>{html+=panel(108,292+i*155,1704,142,i===3?'tint':'')+box(id,title,140,307+i*155,1620,54,'limits-title')+box(id,desc,140,365+i*155,1610,58,'limits-body muted');});
    } else {
      html+=box(id,'Local. Verificable.\nRevisado por humanos.',116,430,1590,210,'title');
      html+=box(id,'Luis-Alain/hackpty · QVAC-Psy',116,729,1600,62,'body mono');
      html+=box(id,'MIT · @qvac/sdk 0.18.2',116,815,1600,60,'body mono muted');
    }
    // Full exact Spanish narration, sentence captions in their own reserved rail.
    const sentences=s.text.match(/[^.!?]+[.!?]+|[^.!?]+$/g).map(t=>t.trim());
    const totalChars=sentences.reduce((sum,v)=>sum+v.length,0); let capOffset=offset;
    let captions=''; sentences.forEach((sentence,i)=>{
      const capDuration=audio.duration*sentence.length/totalChars;
      const captionId=`caption-${id}-${i}`;
      captions+=`<div id="${captionId}" class="caption-cue">`+box(id,sentence,108,936,1704,90,'caption')+'</div>';
      timeline[timeline.length-1].captions ??= [];
      timeline[timeline.length-1].captions.push({id:captionId,start:capOffset,duration:capDuration,text:sentence});
      capOffset+=capDuration;
    });
    html+=captions;
    const audioHtml=audio.file?`<audio id="audio-${id}" src="${escape(audio.file)}" data-start="${offset}" data-duration="${audio.duration}" data-track-index="3" data-volume="1"></audio>`:'';
    const result=`<section id="${id}" class="scene ${dark?'dark':''}" data-scene="${id}">${html}</section>${audioHtml}`;
    offset+=duration;return result;
  });
  const gsap=`window.__timelines=window.__timelines||{};const tl=gsap.timeline({paused:true});\n`+timeline.map((s,i)=>{
    let code=`tl.set('#${s.id}',{display:'block'},${s.start});tl.set('#${s.id}',{display:'none'},${s.start+s.duration});\n`;
    if(!s.resultsSwitch)code+=`tl.fromTo('#${s.id} > .title',{opacity:0,y:15},{opacity:1,y:0,duration:.6},${s.start});\n`;
    for(const c of s.captions) code+=`tl.set('#${c.id}',{visibility:'hidden'},0);tl.set('#${c.id}',{visibility:'visible'},${c.start});tl.set('#${c.id}',{visibility:'hidden'},${c.start+c.duration});\n`;
    if(i===1)code+=`tl.fromTo('#notes-left',{x:-22},{x:0,duration:.8},${s.start});tl.fromTo('#notes-right',{x:22},{x:0,duration:.8},${s.start});\n`;
    if(i===2)code+=`tl.fromTo('#receipt-step',{opacity:0},{opacity:1,duration:.6},${s.start+s.duration*.7});\n`;
    if(i===4)code+=`tl.set('#example-unknown',{visibility:'hidden'},0);tl.set('#example-conflict',{visibility:'hidden'},${s.start+s.duration*.52});tl.set('#example-unknown',{visibility:'visible'},${s.start+s.duration*.52});\n`;
    if(i===4)for(let j=0;j<6;j++)code+=`tl.fromTo('#finding-kind-${j}',{opacity:0},{opacity:1,duration:.5},${s.start+.6+j*.45});\n`;
    if(i===5)for(let j=1;j<4;j++)code+=`tl.fromTo('#approval-${j}',{opacity:.25},{opacity:1,duration:.5},${s.start+s.duration*j*.2});\n`;
    if(s.resultsSwitch)code+=`tl.set('#results-performance',{visibility:'hidden'},0);tl.set('#results-accuracy',{visibility:'hidden'},${s.resultsSwitch});tl.set('#results-performance',{visibility:'visible'},${s.resultsSwitch});\n`;
    return code;
  }).join('')+`tl.to({}, {duration:.001},${offset-.001});window.__timelines['psyrec']=tl;window.PSYREC_TIMELINE=${JSON.stringify(timeline)};`;
  const fontFaces=readFileSync('assets/fonts.css','utf8').replaceAll('url(fonts/','url(assets/fonts/');
  const html=`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=1920, height=1080"><title>PsyRec · first cut</title><style>${fontFaces}</style><link rel="stylesheet" href="scenes.css"><script src="assets/gsap.min.js"></script></head><body><div id="root" data-composition-id="psyrec" data-width="1920" data-height="1080" data-start="0" data-duration="${offset}" data-fps="30">${scenes.join('\n')}</div><script>${gsap}</script></body></html>`;
  writeFileSync('index.html',html);
  mkdirSync('data',{recursive:true});
  writeFileSync('data/build.json',JSON.stringify({width:1920,height:1080,fps:30,duration:offset,draft,scenes:timeline,boxes,resultsTrace:traces,assets},null,2)+'\n');
  console.log(`Built nine scenes: ${offset.toFixed(3)} s (${draft?'draft timing':'audio + 0.6 s, rounded up to frame'}).`);
}
if (process.argv[1] && resolve(process.argv[1])===fileURL()) await build({draft:process.argv.includes('--draft')});
function fileURL() { return fileURLToPath(import.meta.url); }
