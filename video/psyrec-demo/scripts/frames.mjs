import { mkdirSync, writeFileSync, readdirSync, unlinkSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { command, ffprobe, report } from './lib.mjs';
const file='out/psyrec-demo-cut1.mp4';
if(!existsSync(file))throw new Error('Render first with npm run render.');
mkdirSync('review',{recursive:true});
// Remove only this script's previous numbered PNGs, within the resolved review directory.
const review=resolve('review');
for(const name of readdirSync(review).filter(name=>/^frame-\d{3}\.png$/.test(name))) {
  const target=resolve(review,name);if(dirname(target)!==review)throw new Error('Unsafe frame path.');unlinkSync(target);
}
const info=ffprobe(file),video=info.streams.find(s=>s.codec_type==='video'),audio=info.streams.find(s=>s.codec_type==='audio');
if(video.width!==1920 || video.height!==1080 || video.r_frame_rate!=='30/1' || !audio)throw new Error('Output must be 1920x1080, 30 fps, with narration audio.');
const duration=Number(info.format.duration);
if(duration>300)throw new Error('Rendered duration exceeds 300 seconds.');
writeFileSync('review/output-probe.json',JSON.stringify(info,null,2)+'\n');
const extract=['-hide_banner','-loglevel','error','-y','-i',file,'-vf','select=not(mod(n\\,150))','-fps_mode','vfr','review/frame-%03d.png'];
const quoted=args=>args.map(arg=>`'${arg.replaceAll("'","''")}'`).join(' ');
report(`\`ffmpeg ${quoted(extract)}\``);command('ffmpeg',extract);
const frames=readdirSync(review).filter(name=>/^frame-\d{3}\.png$/.test(name)).sort();
const columns=4,rows=Math.ceil(frames.length/columns);
const tile=['-hide_banner','-loglevel','error','-y','-framerate','1','-i','review/frame-%03d.png','-vf',`scale=480:270,tile=${columns}x${rows}:nb_frames=${frames.length}:padding=8:margin=8:color=0xf3f5f5`,'-frames:v','1','-update','1','review/contact-sheet.png'];
report(`\`ffmpeg ${quoted(tile)}\``);command('ffmpeg',tile);
writeFileSync('review/frames.json',JSON.stringify({source:file,intervalSeconds:5,frames:frames.map((file,i)=>({file,seconds:i*5})),contactSheet:'review/contact-sheet.png',columns,rows},null,2)+'\n');
console.log(`${frames.length} frames; contact sheet review/contact-sheet.png; MP4 ${duration.toFixed(3)} s, 1920x1080, 30 fps, ${audio.codec_name} audio.`);
report(`\`npm run frames\`: PASS. ${frames.length} frames at five-second intervals; contact sheet \`review/contact-sheet.png\`. ffprobe: ${duration.toFixed(3)} s, ${video.width}x${video.height}, ${video.r_frame_rate} fps, video ${video.codec_name}, audio ${audio.codec_name}. Metadata: review/output-probe.json; frame/time index: review/frames.json.`);
