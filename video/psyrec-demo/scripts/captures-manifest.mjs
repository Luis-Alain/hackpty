// Inventory only: never records, transcodes, trims or renders. See captures/README.md.
import { readFileSync, writeFileSync, readdirSync, existsSync, createReadStream, lstatSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { join, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const dir = join(root, 'captures');
const manifestPath = join(dir, 'manifest.json');
const dryRun = process.argv.includes('--dry-run');
if (process.argv.slice(2).some(arg => arg !== '--dry-run')) throw new Error('Usage: node scripts/captures-manifest.mjs [--dry-run]');
const read = path => JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
const inside = path => { const r = relative(realpathSync(root), realpathSync(path)); return r !== '..' && !r.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) && !isAbsolute(r); };
if (!inside(dir) || (existsSync(manifestPath) && !inside(manifestPath))) throw new Error('Captures and manifest must resolve inside this project.');
const previous = existsSync(manifestPath) ? read(manifestPath) : {};
if ((previous.captures && !Array.isArray(previous.captures)) || (previous.recordings && !Array.isArray(previous.recordings))) throw new Error('Manifest captures/recordings must be arrays.');
const audio = read(join(root, 'audio/manifest.json'));
const sceneSpecs = { S3: ['phone',9,16], S4: ['desktop',16,9], S5: ['desktop',16,9], S6: ['desktop',16,9] };
const slots = Object.fromEntries(Object.entries(sceneSpecs).map(([scene,[kind,w,h]]) => {
  const narration = audio.scenes.find(s => s.id === scene);
  if (!narration || !Number.isFinite(narration.duration) || narration.duration <= 0) throw new Error(`Missing measured audio duration: ${scene}`);
  return [scene, { kind, aspect: `${w}:${h}`, width: kind === 'phone' ? 1080 : 1920, height: kind === 'phone' ? 1920 : 1080,
    duration: Math.ceil((narration.duration + .6) * 30) / 30,
    selectedFile: previous.slots?.[scene]?.selectedFile ?? null,
    notes: previous.slots?.[scene]?.notes ?? '' }];
}));
const oldEntries = new Map();
for (const item of [...(previous.archivedEntries ?? []), ...(previous.captures ?? []), ...(previous.recordings ?? [])]) {
  if (typeof item.file !== 'string') throw new Error('Manifest entry missing file.');
  oldEntries.set(item.file, {...oldEntries.get(item.file), ...item});
}
const recordings = [];
for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a,b) => a.name.localeCompare(b.name))) {
  if (!/\.mp4$/i.test(entry.name)) continue;
  const file = join(dir, entry.name);
  if (!entry.isFile() || lstatSync(file).isSymbolicLink() || !inside(file)) throw new Error(`Capture must be a regular local file: ${entry.name}`);
  const result = spawnSync('ffprobe', ['-v','error','-show_format','-show_streams','-of','json',file], { cwd: root, windowsHide: true, encoding:'utf8' });
  if (result.error || result.status !== 0) throw new Error(`ffprobe failed for ${entry.name}; manifest unchanged. ${result.error?.message ?? result.stderr}`);
  const probe = JSON.parse(result.stdout);
  const stream = probe.streams?.find(s => s.codec_type === 'video');
  const duration = Number(probe.format?.duration);
  if (!stream || !Number.isFinite(duration) || duration <= 0 || !Number.isInteger(stream.width) || !Number.isInteger(stream.height) || stream.width <= 0 || stream.height <= 0) throw new Error(`Invalid video metadata: ${entry.name}`);
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  const sha256 = hash.digest('hex');
  const old = oldEntries.get(entry.name) ?? {};
  const match = /^(phone|desktop)-(S[3-6])-.+\.mp4$/i.exec(entry.name);
  const scene = match?.[2].toUpperCase() ?? null;
  const kind = match?.[1].toLowerCase() ?? null;
  const slot = slots[scene];
  const problems = [];
  const rotation = Number(stream.tags?.rotate ?? stream.side_data_list?.find(s => s.rotation !== undefined)?.rotation ?? 0);
  const synthetic = old.sha256 === sha256 && old.synthetic === true;
  if (!slot || slot.kind !== kind) problems.push('Filename must map phone-S3-* or desktop-S4/S5/S6-*.mp4.');
  if (slot && Math.abs(stream.width / stream.height - slot.width / slot.height) > .001) problems.push(`Prepare ${slot.aspect} geometry in one trim/scale/pad pass.`);
  if (slot && duration < slot.duration) problems.push(`Too short: need at least ${slot.duration} seconds.`);
  if (rotation % 360 !== 0) problems.push('Bake rotation into the prepared clip.');
  if (stream.sample_aspect_ratio && !['1:1','0:1','N/A'].includes(stream.sample_aspect_ratio)) problems.push('Normalize sample aspect ratio with setsar=1.');
  if (probe.streams.some(s => s.codec_type === 'audio')) problems.push('Remove audio in the preparation pass (-an).');
  if (!synthetic) problems.push('Human review required: set synthetic:true on this hash-bound recording after checking every frame for synthetic-only content, no passphrase or pairing credentials.');
  recordings.push({...old, scene, kind, file:entry.name, width:stream.width, height:stream.height, duration, sha256, synthetic,
    notes:old.notes ?? '', ready:problems.length === 0, problems});
}
const captures = [];
for (const [scene,slot] of Object.entries(slots)) {
  const eligible = recordings.filter(r => r.scene === scene && r.ready);
  const selected = slot.selectedFile ? eligible.find(r => r.file === slot.selectedFile) : eligible.at(-1);
  if (slot.selectedFile && !selected) console.warn(`${scene}: selectedFile is missing or not ready; keeping placeholder.`);
  if (selected) captures.push({...selected});
}
// Keep notes for temporarily absent recordings, without making them active inputs.
const present = new Set(recordings.map(r => r.file));
const archivedEntries = [...oldEntries.values()].filter(r => !present.has(r.file));
const manifest = {...previous, synthetic:true, generatedAt:new Date().toISOString(),
  instructions:'recordings inventories every MP4; captures selects one ready synthetic-reviewed clip per slot. Name phone-S3-* or desktop-S4/S5/S6-*.mp4. Review and set recordings[].synthetic=true for the measured sha256, then rescan. Latest eligible filename wins unless slots[scene].selectedFile pins a take. Preserve raw takes; see README.md for one-pass trim/fit/pad.',
  timingMethod:'Seconds; ceil((ffprobe narration duration + 0.6) * 30) / 30, matching scripts/build.mjs.',
  trimMethod:'ffmpeg -ss START -i RAW -t SLOT_DURATION -an -vf scale=...:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=...:(ow-iw)/2:(oh-ih)/2,setsar=1 -r 30 -c:v libx264 -crf 18 -pix_fmt yuv420p -movflags +faststart PREPARED. One additional encode from raw; never chain encodes or use -c copy for frame-exact cuts.',
  slots, captures, recordings, archivedEntries:[...new Map(archivedEntries.map(r => [r.file,r])).values()] };
if (!dryRun) writeFileSync(manifestPath, JSON.stringify(manifest,null,2) + '\n');
console.log(`${dryRun ? 'Dry run; manifest unchanged' : 'Wrote captures/manifest.json'}: ${recordings.length} recordings, ${captures.length} selected capture entries.`);
for (const r of recordings) console.log(`${r.file}: ${r.ready ? 'ready' : r.problems.join(' ')}`);
