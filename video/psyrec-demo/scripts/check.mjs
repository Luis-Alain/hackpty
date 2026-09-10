import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import puppeteer from 'puppeteer-core';
import { build } from './build.mjs';
import { localEnv, report, ffprobe, command, cli } from './lib.mjs';

const pendingPreview=process.argv.includes('--pending');
const reviewPrefix=pendingPreview?'pending-':'';
const results=JSON.parse(readFileSync('data/results.json','utf8'));
if(pendingPreview) {
  results.pending=true;
  results.configurations=[];
  results.suiteLabel='Suite sintética · evaluación pendiente';
  delete results.strictGoldRecallTarget;
}
await build({resultsOverride:results});
const metadata=JSON.parse(readFileSync('data/build.json','utf8'));
const audio=JSON.parse(readFileSync('audio/manifest.json','utf8'));
const failures=[];
const assert=(condition,message)=>{if(!condition)failures.push(message);};
const palette=new Set(['#1b3035','#18625f','#174e4b','#f3f5f5','#ffffff','#e8f2ee','#93b9ac','#657775','#974d39','#fbece8','#000000','#000','#fff']);
const css=readFileSync('scenes.css','utf8');
for(const match of css.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) assert(palette.has(match[0].toLowerCase()),`Banned CSS hex: ${match[0]}`);
assert(!/gradient\(|rgba?\(|hsla?\(/i.test(css),'Gradients or alternative color literals are not allowed in scene CSS.');
assert(metadata.scenes.length===9,'Exactly nine scenes required.');
assert(!metadata.draft && metadata.duration<=300 && metadata.duration>0,'Duration must be audio-derived and at most 300 seconds.');
for(const scene of metadata.scenes) {
  const a=audio.scenes.find(a=>a.id===scene.id);
  assert(Math.abs(scene.duration-Math.ceil((a.duration+.6)*30)/30)<.0001,`${scene.id}: wrong audio padding.`);
  assert(Math.abs(Number(ffprobe(a.file).format.duration)-a.duration)<.001,`${scene.id}: audio duration differs from manifest.`);
  assert(createHash('sha256').update(readFileSync(a.file)).digest('hex')===a.sha256,`${scene.id}: audio hash differs.`);
}
for(const b of metadata.boxes) assert(b.x>=96 && b.y>=54 && b.x+b.w<=1824 && b.y+b.h<=1026,`${b.scene}/${b.id}: declared box outside 5% safe zone.`);
if(results.pending===false) {
  assert(Number.isFinite(results.strictGoldRecallTarget)&&results.strictGoldRecallTarget>=0&&results.strictGoldRecallTarget<=1,'Completed results require a fractional strictGoldRecallTarget.');
  assert(!!results.generatedAt && results.source.length>0 && results.configurations.length===4,'Completed results require timestamp, sources and four configurations.');
  for(const [i,c] of results.configurations.entries()) {
    for(const key of ['strictGoldRecall','termOnlyRecall','forbiddenHits','firstPassValidity','abstentionCorrect','loadMs','nativeTtftMs','tokensPerSecond','promptTokens','generatedTokens']) assert(typeof c[key]==='number'&&Number.isFinite(c[key])&&c[key]>=0,`Configuration ${i}: missing real numeric ${key}.`);
    for(const key of ['label','model','quantization']) assert(typeof c[key]==='string'&&c[key].length>0,`Configuration ${i}: missing ${key}.`);
    for(const key of ['reasoning','schema']) assert(typeof c[key]==='boolean',`Configuration ${i}: ${key} must be boolean.`);
  }
}
const env=localEnv();
if(!env.HYPERFRAMES_BROWSER_PATH)throw new Error('No local browser found. Set HYPERFRAMES_BROWSER_PATH.');
mkdirSync('review',{recursive:true});
const browser=await puppeteer.launch({executablePath:env.HYPERFRAMES_BROWSER_PATH,headless:true,userDataDir:resolve('.cache/check-browser'),env,args:['--no-sandbox','--disable-gpu','--disable-background-networking','--disable-breakpad','--no-first-run'],defaultViewport:{width:1920,height:1080}});
const observations=[];
try {
  const page=await browser.newPage();
  page.on('pageerror',e=>failures.push(`Browser error: ${e.message}`));
  page.on('requestfailed',r=>{if(!(r.failure()?.errorText==='net::ERR_ABORTED' && /\/audio\/s[1-9]\.mp3$/.test(r.url())))failures.push(`Asset load failed: ${r.url()} (${r.failure()?.errorText})`);});
  await page.goto(pathToFileURL(resolve('index.html')).href,{waitUntil:'networkidle0'});
  await page.evaluate(()=>document.fonts.ready);
  const trace=await page.evaluate(()=>[...document.querySelectorAll('#S7 [data-text-box]')].map(el=>({text:el.textContent,path:el.dataset.resultPath||null})).filter(x=>/\d/.test(x.text)));
  for(const t of trace) {
    assert(!!t.path,`Unbound results numeral in: ${t.text}`);
    const value=t.path?.split('.').reduce((o,k)=>o?.[k],results);
    assert(String(value)===t.text,`Results trace mismatch: ${t.path}`);
  }
  assert(results.pending===false || !await page.$('#S7 .metric-value'),'Pending results cannot show metric values.');
  if(!results.pending) {
    const expected=results.configurations.some(c=>c.strictGoldRecall>=results.strictGoldRecallTarget)?'El objetivo se alcanza en la evaluación':'Ninguna configuración alcanza el objetivo';
    assert(await page.$eval('[data-results-headline]',el=>el.textContent)===expected,'Results headline contradicts target comparison.');
    const best=results.configurations.reduce((best,c,i)=>c.strictGoldRecall>results.configurations[best].strictGoldRecall?i:best,0);
    assert(await page.$eval('#results-accuracy [data-result-path][style*="top:326px"]',el=>el.dataset.resultPath)===`configurations.${best}.label`,'Strongest configuration label does not match strict recall.');
    for(const [i,c] of results.configurations.entries())for(const key of ['strictGoldRecall','termOnlyRecall','forbiddenHits','firstPassValidity','nativeTtftMs','tokensPerSecond','loadMs','promptTokens','generatedTokens'])assert(!!await page.$(`#S7 [data-result-path="configurations.${i}.${key}"]`),`Missing displayed metric: configurations.${i}.${key}`);
  }
  writeFileSync(`review/${reviewPrefix}results-trace.json`,JSON.stringify({source:'data/results.json',pending:results.pending,previewOverride:pendingPreview,numericText:trace,allBindings:metadata.resultsTrace},null,2)+'\n');
  for(const scene of metadata.scenes) {
    const times=[scene.start+.8,scene.start+scene.duration*.55,...scene.captions.map(c=>c.start+Math.min(.3,c.duration/2))];
    if(scene.resultsSwitch)times.push(scene.resultsSwitch-1/30,scene.resultsSwitch,scene.resultsSwitch+1/30,scene.start+scene.duration-.1);
    for(const t of times) {
      await page.evaluate(t=>{window.__timelines.psyrec.seek(t,false);},t);
      if(scene.resultsSwitch) {
        const visible=await page.evaluate(()=>['results-accuracy','results-performance'].filter(id=>getComputedStyle(document.getElementById(id)).visibility!=='hidden'));
        assert(visible.length===1&&visible[0]===(t<scene.resultsSwitch?'results-accuracy':'results-performance'),`S7@${t.toFixed(3)}: results screens overlap or wrong screen visible.`);
      }
      const issues=await page.evaluate(()=>{
        const issues=[];
        const visible=el=>{
          for(let p=el;p&&p!==document.body;p=p.parentElement){const s=getComputedStyle(p);if(s.display==='none'||s.visibility==='hidden'||Number(s.opacity)===0)return false;}
          return true;
        };
        for(const el of document.querySelectorAll('[data-text-box]')) {
          if(!visible(el))continue;
          const rect=el.getBoundingClientRect();
          const range=document.createRange();range.selectNodeContents(el);const glyphs=range.getBoundingClientRect();
          if(Math.min(rect.x,glyphs.x)<95.5||Math.min(rect.y,glyphs.y)<53.5||Math.max(rect.right,glyphs.right)>1824.5||Math.max(rect.bottom,glyphs.bottom)>1026.5)issues.push({id:el.id,kind:'safe-zone',text:el.textContent});
          if(el.scrollHeight>el.clientHeight+2 || el.scrollWidth>el.clientWidth+2)issues.push({id:el.id,kind:'overflow',text:el.textContent,scroll:el.scrollHeight,height:el.clientHeight});
          if(el.classList.contains('caption'))for(const media of document.querySelectorAll('.media,.capture')) {
            if(!visible(media))continue;const m=media.getBoundingClientRect();
            if(rect.x<m.right && rect.right>m.x && rect.y<m.bottom && rect.bottom>m.y)issues.push({id:el.id,kind:'caption-over-media'});
          }
        }
        return issues;
      });
      observations.push({scene:scene.id,time:t,issues});
      for(const issue of issues)failures.push(`${scene.id}@${t.toFixed(3)} ${JSON.stringify(issue)}`);
    }
    if(!process.argv.includes('--no-layout-previews') && (!process.argv.includes('--results-layout') || (scene.id==='S7'&&!results.pending))) {
      await page.evaluate(t=>{window.__timelines.psyrec.seek(t,false);},scene.start+scene.duration*(process.argv.includes('--results-layout')?.75:.35));
      await page.screenshot({path:process.argv.includes('--results-layout')?'review/S7-results-layout.png':`review/${scene.id}-layout.png`});
    }
  }
}finally{await browser.close();}
writeFileSync(`review/${reviewPrefix}check.json`,JSON.stringify({passed:failures.length===0,pending:results.pending,previewOverride:pendingPreview,totalDuration:metadata.duration,palette:[...palette],observations,failures},null,2)+'\n');
console.log(`Palette checked; ${metadata.boxes.length} safe-zone boxes; ${observations.length} browser samples; ${metadata.duration.toFixed(3)} seconds; results numeric trace written.`);
if(failures.length){report(`\`npm run check ${process.argv.slice(2).join(' ')}\` failed: ${[...new Set(failures)].join('\n\n')}`);throw new Error(`${failures.length} check failures; see review/${reviewPrefix}check.json`);}
console.log('All checks passed.');
report(`\`npm run check -- ${process.argv.slice(2).join(' ')}\`: PASS. Palette, ${metadata.boxes.length} declared text boxes, ${observations.length} browser samples (actual glyph bounds, overflow, caption/media separation), nine audio hashes/durations, ${metadata.duration.toFixed(3)} s <= 300 s, and every results-scene numeral traced to data/results.json${pendingPreview?' with an in-memory pending preview override':''}. Details: review/${reviewPrefix}check.json and review/${reviewPrefix}results-trace.json.`);
