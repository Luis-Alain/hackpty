import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { report } from './lib.mjs';
for (const dir of ['assets/fonts', 'data', 'captures', 'audio']) mkdirSync(dir, { recursive: true });
const assetSources = [];
async function download(url, path) {
  const response = await fetch(url); if (!response.ok) throw new Error(`Asset HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer()); writeFileSync(path, bytes);
  assetSources.push({ file: path, source: url, sha256: createHash('sha256').update(bytes).digest('hex') });
}
await download('https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js', 'assets/gsap.min.js');
let css = '';
for (const [family, name, fallback] of [['Source Serif 4', 'serif', 'Georgia, serif'], ['IBM Plex Sans', 'sans', 'Arial, sans-serif'], ['IBM Plex Mono', 'mono', 'Consolas, monospace']]) {
  const url = `https://fonts.googleapis.com/css2?family=${family.replaceAll(' ', '+')}:wght@400;600&display=swap`;
  const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!response.ok) throw new Error(`Font CSS HTTP ${response.status}`);
  const fontCss = await response.text();
  let index = 0;
  for (const block of fontCss.matchAll(/@font-face\s*\{([^}]+)\}/g)) {
    const remote = block[1].match(/url\(([^)]+)\)/)?.[1]; if (!remote) continue;
    const file = `assets/fonts/${name}-${index++}.${remote.includes('.woff2') ? 'woff2' : 'ttf'}`;
    await download(remote, file);
    css += `@font-face {${block[1].replace(remote, file.replace('assets/', ''))}}\n`;
  }
  const licenseFamily=family.replaceAll(' ','').toLowerCase();
  await download(`https://raw.githubusercontent.com/google/fonts/main/ofl/${licenseFamily}/OFL.txt`, `assets/fonts/${licenseFamily}-OFL.txt`);
}
writeFileSync('assets/fonts.css', css);
writeFileSync('assets/manifest.json', JSON.stringify(assetSources, null, 2) + '\n');
const brief = readFileSync('BRIEF.md', 'utf8');
const budgets = [20,25,30,35,50,30,50,30,15];
const scenes = [...brief.matchAll(/^S([1-9]) .*?Narración: "([^"]+)"/gm)].map((m, i) => ({ id: `S${m[1]}`, budget: budgets[i], text: m[2] }));
if (scenes.length !== 9) throw new Error(`Expected nine narration strings, got ${scenes.length}`);
writeFileSync('data/storyboard.json', JSON.stringify({ source: 'BRIEF.md', scenes }, null, 2) + '\n');
if(!existsSync('captures/manifest.json')) writeFileSync('captures/manifest.json', JSON.stringify({ synthetic: true, captures: [], instructions: 'Add {scene, file, width, height, duration, synthetic: true}; files are relative to captures/. Desktop 16:9, phone 9:16. Supply cropped portrait capture if device aspect differs; no private data or pairing QR credentials.' }, null, 2) + '\n');
report(`Deliverable 2 assets: vendored GSAP 3.14.2 and requested fonts; ${assetSources.length} files hashed in assets/manifest.json. Exact nine narration strings extracted from BRIEF.md without edits. Capture manifest created with clean fallbacks.`);
