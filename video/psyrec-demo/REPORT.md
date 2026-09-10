# PsyRec first-cut execution report

**Complete — final corrected first cut:** [out/psyrec-demo-cut1.mp4](out/psyrec-demo-cut1.mp4). H.264 video, AAC narration, **1920×1080, 30 fps, 177.700 seconds (2:57.7)**, 10,015,010 bytes. [Contact sheet](review/contact-sheet.png): 36 frames at exact five-second intervals, left-to-right then top-to-bottom. Final artifact hashes are in [data/delivery.json](data/delivery.json). Results remain `pending: true`.

The final `npm run render` and `npm run frames` both exited 0 after the contrast correction. The final render took 7m 27.0s. All 133 text boxes passed the declared safe-zone checks and 41 browser samples; HyperFrames strict lint passed. Final MP4/contact-sheet visual review is recorded at the end of this report.

Work is confined to `video/psyrec-demo/`. No Git mutations are permitted or used. Repository documents are read-only; no private vaults or clinical records are accessed.

## Ordered progress

1. Read `CODEX-TASK.md`, `BRIEF.md`, and all eight working-agreement checkpoints. Read-only parallel evidence reviews assigned to runtime, transport and clinical cells. Existing three B-roll MP4s and manifest detected; captures not yet present.
2. Deliverable 1: created private package metadata with HyperFrames exactly 0.8.33, five requested scripts, local ignore/cache configuration and README. Installation and actual package convention review follow before composition authoring.

## Commands and results

- `Get-Content -LiteralPath CODEX-TASK.md; Get-Content -LiteralPath BRIEF.md`: read task and storyboard. Subsequent reads use UTF-8 explicitly for Spanish.
- `Get-Content -LiteralPath <eight required checkpoint paths> -Encoding utf8`: required context read; historical implementation checkpoints do not establish physical acceptance.
- `Get-Command node,npm,ffmpeg,ffprobe,awk -ErrorAction SilentlyContinue`: all available. Node is installed at `C:/Program Files/nodejs`; awk is Git's `usr/bin/awk.exe`.
- `Get-ChildItem -LiteralPath broll -Force`: three coordinator clips plus manifest already available.

Further commands, results, review and final handoff are appended as work proceeds.

Deliverable 7, actual MP4 review: first completed encode passed 1920x1080, 30 fps, 177.700 seconds, H.264/AAC; 36 exact five-second frames and contact sheet were generated. Visual inspection of the contact sheet found low-contrast inherited mint text on S1's mint fallback panel after B-roll ended. Fixed that text to palette ink, and applied explicit ink text to future completed-results light cards as well. A fresh full render/check/frames pass follows this material visual fix. Other scene layouts, captions below UI, clinical-reference switches and pending-results state were visible and clean. `ffmpeg -hide_banner -nostats -i out/psyrec-demo-cut1.mp4 -vn -af volumedetect -f null NUL 2> review/audio-levels.txt` exited 0; mean -23.3 dBFS and max -5.0 dBFS (no sampled clipping). This measures audio levels, not human pronunciation approval.

Final storyboard wording review before accepting an MP4: restored the full S2 question, added the exact S4/S6 storyboard text above the capture slots, changed S2 cards to the exact historical/current amlodipine source lines to expose what needs clarification, and animated each S5 finding kind. The in-progress two-worker render was stopped (task render PID 19564 and its descendants, runner 47740). The final render uses four software browser workers; clinical inference/GPU probes remain untouched. These visual changes require a fresh layout gate and render. Future non-pending S7 now changes its heading to evidence and retains the data-bound suite label. The pending-only output was hash-checked unchanged by that earlier future-state repair.

First render was stopped during compile after HyperFrames' own lint exposed a stricter rule than its minimal template documentation: timed media cannot have a timed wrapper, and GSAP cannot set display on framework-managed clips. Corrected sections to non-timed visual containers controlled by the root GSAP timeline; media/audio retain absolute data-start/data-duration. Inlined the vendored font-face declarations because the static lint does not follow CSS @import. Added --strict to render. Only task-owned render PIDs 35052 and 46660 were stopped; no other app was touched. No first MP4 was accepted from this attempt.

Deliverable 4: created `data/results.json` with `pending: true`, no configurations or performance numbers, and `data/results.example.json` with explicit schema comments and nulls. Hardware/version text comes from BRIEF.md and is now data-bound. Suite counts are explicitly planned, not completed measurements. Shared-GPU disclosure awaits the final source-specific summary. Actual composition: 177.700 seconds; all nine narrations fit their original scene budgets, with the opening exceeding 20 seconds only after required padding. This is below the approximate 280-second target because the required manifest-plus-padding rule takes precedence over invented holds or changed narration.

### Installation / package review / composition

- `npm.cmd install --cache .cache/npm --no-audit --no-fund` with local TEMP/TMP: exit 0; 135 packages installed. npm warned about deprecated boolean/node-domexception and unapproved optional install scripts (esbuild, onnxruntime-node, protobufjs, @google/genai); no broad script approval or unrelated install performed.
- Read installed `node_modules/hyperframes/README.md`, blank template, docs/compositions.md, data-attributes.md, gsap.md and rendering.md. `npx.cmd --no-install hyperframes --help` and `... render --help` both completed. Actual convention: index.html composition root, data-start/data-duration clips, paused GSAP timeline registered in window.__timelines.
- `node scripts/assets.mjs`: exit 0, exact narration extraction and local GSAP/fonts. Asset sources/hashes retained. Render runner confines package caches, temp, browser profile and state to .cache and disables telemetry/update checks.
- `node scripts/build.mjs --draft`: initial failure due to PowerShell UTF-8 BOM in the local synthetic example snapshot; removed BOM with a scoped Node read/write. Rerun exit 0, nine scenes, provisional 285 seconds. Actual final timing will come from audio.
- `node scripts/tts.mjs --list`: account returned Lucy - Warm Latin Spanish Female, Bh4tkGuEEIADxUACafG5, labels Spanish / Latin American / calm / narrative_story. After returning the list Node hit an async-handle assertion on explicit process.exit; removed the forced exit. No audio request failed and no key was logged.

### Evidence review decisions

Three required read-only cells reviewed runtime/performance, Expo/transport and desktop/clinical evidence; no GPU jobs or file edits by workers. S3 labels the sequence as a diagram with physical acceptance pending. S5 is a human-reference example: CR-09 conflict cites H1/H2; CR-05's unclear current dose does not inherit historical 5 mg. S8 scopes the strict-schema/reasoning limitation to MedPsy on SDK 0.18.2. No benchmark values are copied from incomplete evaluation summaries. S7's fixed narration mentions measured numbers while the required pending screen contains no measured benchmark values (it does show data-bound planned suite counts and hardware/version metadata); this first-cut mismatch remains for coordinator review.

Deliverable 5 review corrections: initial browser check hung because Puppeteer attempted to serialize GSAP's returned timeline. Changed evaluate callbacks to return no object; stopped only the identified task checker PID 67148 and its task-owned headless Edge PID 35456, then reran. The next check correctly found caption overflow, a narrow phone footer, a short hero box and a short B-roll chip. Enlarged/reflowed these boxes, preserved line breaks, and reduced caption typography within its reserved rail. Edge's normal aborted MP3 preload requests are excluded from request-failure checks; all nine actual files remain independently hashed and ffprobed. Recheck follows.

Deliverable 2 assets: vendored GSAP 3.14.2 and requested fonts; 7 files hashed in assets/manifest.json. Exact nine narration strings extracted from BRIEF.md without edits. Capture manifest created with clean fallbacks.

Deliverable 3: `npm run tts`. Voice: **Lucy - Warm Latin Spanish Female** (`Bh4tkGuEEIADxUACafG5`), model `eleven_multilingual_v2`, speed 0.85. Key read only by per-key awk into process memory; no secret value persisted or printed.

- S1: `ffprobe -v error -show_format -show_streams -of json audio/s1.mp3` → 19.783401 s audio; 20.400000 s with padding/frame rounding. Within storyboard budget.

- S2: `ffprobe -v error -show_format -show_streams -of json audio/s2.mp3` → 18.668844 s audio; 19.300000 s with padding/frame rounding. Within storyboard budget.

- S3: `ffprobe -v error -show_format -show_streams -of json audio/s3.mp3` → 20.897959 s audio; 21.500000 s with padding/frame rounding. Within storyboard budget.

- S4: `ffprobe -v error -show_format -show_streams -of json audio/s4.mp3` → 18.343764 s audio; 18.966667 s with padding/frame rounding. Within storyboard budget.

- S5: `ffprobe -v error -show_format -show_streams -of json audio/s5.mp3` → 27.724626 s audio; 28.333333 s with padding/frame rounding. Within storyboard budget.

- S6: `ffprobe -v error -show_format -show_streams -of json audio/s6.mp3` → 19.040363 s audio; 19.666667 s with padding/frame rounding. Within storyboard budget.

- S7: `ffprobe -v error -show_format -show_streams -of json audio/s7.mp3` → 22.430476 s audio; 23.033333 s with padding/frame rounding. Within storyboard budget.

- S8: `ffprobe -v error -show_format -show_streams -of json audio/s8.mp3` → 20.851519 s audio; 21.466667 s with padding/frame rounding. Within storyboard budget.

- S9: `ffprobe -v error -show_format -show_streams -of json audio/s9.mp3` → 4.411791 s audio; 5.033333 s with padding/frame rounding. Within storyboard budget.

TTS completed: nine MP3s, total composition duration 177.700 s. The storyboard target is approximate; measured speech plus required padding controls the cut. No narration trimmed, no music.

`npm run check` failed: Asset load failed: file:///C:/Users/jeffe/Code/hackpty/video/psyrec-demo/audio/s9.mp3

Asset load failed: file:///C:/Users/jeffe/Code/hackpty/video/psyrec-demo/audio/s8.mp3

Asset load failed: file:///C:/Users/jeffe/Code/hackpty/video/psyrec-demo/audio/s7.mp3

Asset load failed: file:///C:/Users/jeffe/Code/hackpty/video/psyrec-demo/audio/s1.mp3

Asset load failed: file:///C:/Users/jeffe/Code/hackpty/video/psyrec-demo/audio/s4.mp3

Asset load failed: file:///C:/Users/jeffe/Code/hackpty/video/psyrec-demo/audio/s6.mp3

Asset load failed: file:///C:/Users/jeffe/Code/hackpty/video/psyrec-demo/audio/s2.mp3

Asset load failed: file:///C:/Users/jeffe/Code/hackpty/video/psyrec-demo/audio/s3.mp3

Asset load failed: file:///C:/Users/jeffe/Code/hackpty/video/psyrec-demo/audio/s5.mp3

S1@0.800 {"id":"box-3","kind":"overflow","text":"PsyRec","scroll":184,"height":180}

S1@0.800 {"id":"box-7","kind":"overflow","text":"AMBIENTE GENERADO · SINTÉTICO","scroll":39,"height":30}

S1@11.220 {"id":"box-3","kind":"overflow","text":"PsyRec","scroll":184,"height":180}

S1@11.220 {"id":"box-7","kind":"overflow","text":"AMBIENTE GENERADO · SINTÉTICO","scroll":39,"height":30}

S1@0.300 {"id":"box-3","kind":"overflow","text":"PsyRec","scroll":184,"height":180}

S1@0.300 {"id":"box-7","kind":"overflow","text":"AMBIENTE GENERADO · SINTÉTICO","scroll":39,"height":30}

S1@8.213 {"id":"box-3","kind":"overflow","text":"PsyRec","scroll":184,"height":180}

S1@8.213 {"id":"box-7","kind":"overflow","text":"AMBIENTE GENERADO · SINTÉTICO","scroll":39,"height":30}

S1@16.786 {"id":"box-3","kind":"overflow","text":"PsyRec","scroll":184,"height":180}

S1@16.786 {"id":"box-7","kind":"overflow","text":"AMBIENTE GENERADO · SINTÉTICO","scroll":39,"height":30}

S3@40.500 {"id":"box-30","kind":"overflow","text":"SYNTHETIC WORKFLOW","scroll":70,"height":35}

S3@51.525 {"id":"box-30","kind":"overflow","text":"SYNTHETIC WORKFLOW","scroll":70,"height":35}

S3@40.000 {"id":"box-30","kind":"overflow","text":"SYNTHETIC WORKFLOW","scroll":70,"height":35}

S3@46.146 {"id":"box-30","kind":"overflow","text":"SYNTHETIC WORKFLOW","scroll":70,"height":35}

S3@54.752 {"id":"box-30","kind":"overflow","text":"SYNTHETIC WORKFLOW","scroll":70,"height":35}

S5@95.750 {"id":"box-83","kind":"safe-zone","text":"Un conflicto entre dos registros se muestra como conflicto; una dosis no documentada se declara desconocida, nunca se inventa."}

S5@95.750 {"id":"box-83","kind":"overflow","text":"Un conflicto entre dos registros se muestra como conflicto; una dosis no documentada se declara desconocida, nunca se inventa.","scroll":99,"height":80}

S5@91.589 {"id":"box-83","kind":"safe-zone","text":"Un conflicto entre dos registros se muestra como conflicto; una dosis no documentada se declara desconocida, nunca se inventa."}

S5@91.589 {"id":"box-83","kind":"overflow","text":"Un conflicto entre dos registros se muestra como conflicto; una dosis no documentada se declara desconocida, nunca se inventa.","scroll":99,"height":80}

S6@119.317 {"id":"box-98","kind":"safe-zone","text":"El registro se guarda cifrado; al bloquear y volver a abrir, el texto aprobado se conserva y el historial muestra sólo al paciente seleccionado."}

S6@119.317 {"id":"box-98","kind":"overflow","text":"El registro se guarda cifrado; al bloquear y volver a abrir, el texto aprobado se conserva y el historial muestra sólo al paciente seleccionado.","scroll":99,"height":80}

S6@116.173 {"id":"box-98","kind":"safe-zone","text":"El registro se guarda cifrado; al bloquear y volver a abrir, el texto aprobado se conserva y el historial muestra sólo al paciente seleccionado."}

S6@116.173 {"id":"box-98","kind":"overflow","text":"El registro se guarda cifrado; al bloquear y volver a abrir, el texto aprobado se conserva y el historial muestra sólo al paciente seleccionado.","scroll":99,"height":80}

S7@128.967 {"id":"box-108","kind":"safe-zone","text":"Medimos sobre una suite sintética congelada, confirmada por un revisor humano antes de ejecutar los modelos: cobertura de hechos, afirmaciones no respaldadas, validez del JSON y rendimiento nativo."}

S7@128.967 {"id":"box-108","kind":"overflow","text":"Medimos sobre una suite sintética congelada, confirmada por un revisor humano antes de ejecutar los modelos: cobertura de hechos, afirmaciones no respaldadas, validez del JSON y rendimiento nativo.","scroll":99,"height":80}

S7@140.835 {"id":"box-108","kind":"safe-zone","text":"Medimos sobre una suite sintética congelada, confirmada por un revisor humano antes de ejecutar los modelos: cobertura de hechos, afirmaciones no respaldadas, validez del JSON y rendimiento nativo."}

S7@140.835 {"id":"box-108","kind":"overflow","text":"Medimos sobre una suite sintética congelada, confirmada por un revisor humano antes de ejecutar los modelos: cobertura de hechos, afirmaciones no respaldadas, validez del JSON y rendimiento nativo.","scroll":99,"height":80}

S7@128.467 {"id":"box-108","kind":"safe-zone","text":"Medimos sobre una suite sintética congelada, confirmada por un revisor humano antes de ejecutar los modelos: cobertura de hechos, afirmaciones no respaldadas, validez del JSON y rendimiento nativo."}

S7@128.467 {"id":"box-108","kind":"overflow","text":"Medimos sobre una suite sintética congelada, confirmada por un revisor humano antes de ejecutar los modelos: cobertura de hechos, afirmaciones no respaldadas, validez del JSON y rendimiento nativo.","scroll":99,"height":80}

S8@152.000 {"id":"box-119","kind":"safe-zone","text":"Los límites son parte del resultado: la suite es pequeña y sintética, no hay validación clínica, y en esta versión del SDK el modo de razonamiento no puede combinarse con la salida estructurada."}

S8@152.000 {"id":"box-119","kind":"overflow","text":"Los límites son parte del resultado: la suite es pequeña y sintética, no hay validación clínica, y en esta versión del SDK el modo de razonamiento no puede combinarse con la salida estructurada.","scroll":99,"height":80}

S8@163.007 {"id":"box-119","kind":"safe-zone","text":"Los límites son parte del resultado: la suite es pequeña y sintética, no hay validación clínica, y en esta versión del SDK el modo de razonamiento no puede combinarse con la salida estructurada."}

S8@163.007 {"id":"box-119","kind":"overflow","text":"Los límites son parte del resultado: la suite es pequeña y sintética, no hay validación clínica, y en esta versión del SDK el modo de razonamiento no puede combinarse con la salida estructurada.","scroll":99,"height":80}

S8@151.500 {"id":"box-119","kind":"safe-zone","text":"Los límites son parte del resultado: la suite es pequeña y sintética, no hay validación clínica, y en esta versión del SDK el modo de razonamiento no puede combinarse con la salida estructurada."}

S8@151.500 {"id":"box-119","kind":"overflow","text":"Los límites son parte del resultado: la suite es pequeña y sintética, no hay validación clínica, y en esta versión del SDK el modo de razonamiento no puede combinarse con la salida estructurada.","scroll":99,"height":80}

S9@173.467 {"id":"box-123","kind":"overflow","text":"PsyRec","scroll":184,"height":180}

S9@175.435 {"id":"box-123","kind":"overflow","text":"PsyRec","scroll":184,"height":180}

S9@172.967 {"id":"box-123","kind":"overflow","text":"PsyRec","scroll":184,"height":180}

`npm run check`: PASS. Palette, 126 declared text boxes, 41 browser samples (actual glyph bounds, overflow, caption/media separation), nine audio hashes/durations, 177.700 s <= 300 s, and every results-scene numeral traced to data/results.json. Details: review/check.json and review/results-trace.json.

`npm run check`: PASS. Palette, 126 declared text boxes, 41 browser samples (actual glyph bounds, overflow, caption/media separation), nine audio hashes/durations, 177.700 s <= 300 s, and every results-scene numeral traced to data/results.json. Details: review/check.json and review/results-trace.json.

Command: `node node_modules\hyperframes\bin\hyperframes.mjs render . -o out/psyrec-demo-cut1.mp4 --fps 30 --resolution landscape --quality standard --workers 2 --no-browser-gpu --no-best-effort` (local cache/profile/temp environment; telemetry disabled).

Command: `node node_modules\hyperframes\bin\hyperframes.mjs lint . --json` (local cache/profile/temp environment; telemetry disabled).

Command lint exit code: 0; log: `out/lint.log`.

`npm run check`: PASS. Palette, 126 declared text boxes, 41 browser samples (actual glyph bounds, overflow, caption/media separation), nine audio hashes/durations, 177.700 s <= 300 s, and every results-scene numeral traced to data/results.json. Details: review/check.json and review/results-trace.json.

Command: `node node_modules\hyperframes\bin\hyperframes.mjs render . -o out/psyrec-demo-cut1.mp4 --fps 30 --resolution landscape --quality standard --workers 2 --no-browser-gpu --no-best-effort --strict` (local cache/profile/temp environment; telemetry disabled).

`npm run check`: PASS. Palette, 133 declared text boxes, 41 browser samples (actual glyph bounds, overflow, caption/media separation), nine audio hashes/durations, 177.700 s <= 300 s, and every results-scene numeral traced to data/results.json. Details: review/check.json and review/results-trace.json.

Command: `node node_modules\hyperframes\bin\hyperframes.mjs render . -o out/psyrec-demo-cut1.mp4 --fps 30 --resolution landscape --quality standard --workers 4 --no-browser-gpu --no-best-effort --strict` (local cache/profile/temp environment; telemetry disabled).

Command render exit code: 0; log: `out/render.log`.

`ffmpeg '-hide_banner' '-loglevel' 'error' '-y' '-i' 'out/psyrec-demo-cut1.mp4' '-vf' 'select=not(mod(n\,150))' '-fps_mode' 'vfr' 'review/frame-%03d.png'`

`ffmpeg '-hide_banner' '-loglevel' 'error' '-y' '-framerate' '1' '-i' 'review/frame-%03d.png' '-vf' 'scale=480:270,tile=4x9:nb_frames=36:padding=8:margin=8:color=0xf3f5f5' '-frames:v' '1' '-update' '1' 'review/contact-sheet.png'`

`npm run frames`: PASS. 36 frames at five-second intervals; contact sheet `review/contact-sheet.png`. ffprobe: 177.700 s, 1920x1080, 30/1 fps, video h264, audio aac. Metadata: review/output-probe.json; frame/time index: review/frames.json.

`npm run check`: PASS. Palette, 133 declared text boxes, 41 browser samples (actual glyph bounds, overflow, caption/media separation), nine audio hashes/durations, 177.700 s <= 300 s, and every results-scene numeral traced to data/results.json. Details: review/check.json and review/results-trace.json.

Command: `node node_modules\hyperframes\bin\hyperframes.mjs render . -o out/psyrec-demo-cut1.mp4 --fps 30 --resolution landscape --quality standard --workers 4 --no-browser-gpu --no-best-effort --strict` (local cache/profile/temp environment; telemetry disabled).

Command render exit code: 0; log: `out/render.log`.

`ffmpeg '-hide_banner' '-loglevel' 'error' '-y' '-i' 'out/psyrec-demo-cut1.mp4' '-vf' 'select=not(mod(n\,150))' '-fps_mode' 'vfr' 'review/frame-%03d.png'`

`ffmpeg '-hide_banner' '-loglevel' 'error' '-y' '-framerate' '1' '-i' 'review/frame-%03d.png' '-vf' 'scale=480:270,tile=4x9:nb_frames=36:padding=8:margin=8:color=0xf3f5f5' '-frames:v' '1' '-update' '1' 'review/contact-sheet.png'`

`npm run frames`: PASS. 36 frames at five-second intervals; contact sheet `review/contact-sheet.png`. ffprobe: 177.700 s, 1920x1080, 30/1 fps, video h264, audio aac. Metadata: review/output-probe.json; frame/time index: review/frames.json.

## Final self-review and handoff

Final review completed 2026-09-10 at approximately 02:26 UTC. Inspected the refreshed contact sheet across all nine scenes, plus full-size final frames at 10 s (corrected opening fallback), 95 s (CR-05), and 160 s (limits). The earlier full contact-sheet review also covered CR-09 and all capture placeholders. The opening diagram is now readable. Text stays inside the 5% safe area; captions occupy the separate lower rail; each scene keeps its storyboard topic; clinical-text scenes carry the synthetic chip; CSS uses only the prescribed palette. No unresolved clipping or UI/caption overlap was found in the sampled final frames.

Final render command (invoked through `npm.cmd run render`; scripts/lib.mjs supplies the local cache/profile/temp environment):

```powershell
node node_modules/hyperframes/bin/hyperframes.mjs render . -o out/psyrec-demo-cut1.mp4 --fps 30 --resolution landscape --quality standard --workers 4 --no-browser-gpu --no-best-effort --strict
```

Exit 0. Engine: HyperFrames 0.8.33. Final render ID: a890d7c6-19ff-4483-9db9-7d716faa7d89. Final log: out/render.log. A non-blocking browser resource 404 appeared during startup; required media/font readiness and strict rendering completed successfully, and the actual output was reviewed. No cloud render, Remotion, model probe, application acceptance run, Git mutation, organizer contact or publication occurred.

`npm.cmd run frames` then exited 0. It first verifies the final MP4 with `ffprobe -v error -show_format -show_streams -of json out/psyrec-demo-cut1.mp4`, selects every 150th frame of the verified 30-fps stream, and tiles 36 PNGs into review/contact-sheet.png. Exact ffmpeg extraction/tile commands are retained above. review/frames.json maps every PNG to its exact video timestamp; the contact sheet is 4 columns by 9 rows.

Final audio verification: `ffmpeg -hide_banner -nostats -i out/psyrec-demo-cut1.mp4 -vn -af volumedetect -f null NUL 2> review/audio-levels.txt` exited 0. Mean -23.3 dBFS; max -5.0 dBFS. No sampled clipping. This is a file/level check, not a claim of human voice audition.

Voice: **Lucy - Warm Latin Spanish Female**, **Bh4tkGuEEIADxUACafG5**; account labels identify Spanish, Latin American, calm, narrative_story. Model: eleven_multilingual_v2. Settings: speed 0.85, stability 0.7, similarity_boost 0.75, style 0, speaker boost true. All nine exact BRIEF narration strings are retained in audio/manifest.json; none were trimmed. TTS documentation checked: https://elevenlabs.io/docs/api-reference/text-to-speech/convert and https://elevenlabs.io/docs/api-reference/voices/settings/get . Only ELEVENLABS_API_KEY was selected by per-key awk; no secret value was printed, copied to a file or recorded in this report.

### Files created

- Project: package.json, package-lock.json, .gitignore, .npmrc, README.md, REPORT.md.
- Composition: index.html, scenes.css; scripts/build.mjs generates the single native HyperFrames composition with nine GSAP-timed scenes.
- Scripts: scripts/assets.mjs, scripts/build.mjs, scripts/check.mjs, scripts/frames.mjs, scripts/lib.mjs, scripts/run.mjs, scripts/tts.mjs.
- Data: data/storyboard.json, data/clinical-examples.json, data/results.json, data/results.example.json, data/provenance.json, data/build.json, data/delivery.json.
- Narration: audio/s1.mp3 through audio/s9.mp3; audio/manifest.json contains exact texts, voice/model/settings, audio hashes, ffprobe durations and scene durations.
- Vendor assets: assets/gsap.min.js, assets/fonts.css, assets/manifest.json; six font files and the three OFL license files under assets/fonts/.
- Capture inputs: captures/manifest.json with empty capture entries and replacement instructions.
- Delivery: out/psyrec-demo-cut1.mp4, out/render.log, out/lint.log.
- Review: review/frame-001.png through frame-036.png, review/contact-sheet.png, review/frames.json, review/output-probe.json, review/check.json, review/results-trace.json, review/audio-levels.txt, and S1-layout.png through S9-layout.png.
- Local installation/render/browser caches are under ignored .cache/ and node_modules/. Interrupted render remnants remain confined to ignored .cache/ and out/.

BRIEF.md, CODEX-TASK.md and the three supplied B-roll files were preserved. All three B-roll byte hashes still match broll/manifest.json. Repository reference files were read only; copied clinical examples are explicitly synthetic CR-05/CR-09. No file edits were made outside this directory.

### Remaining coordinator inputs and limits

- **Captures:** supply synthetic native-phone S3 and desktop S4/S5/S6 recordings through captures/manifest.json. Current placeholders are intentional. Desktop slots are 16:9 and the phone placeholder is 9:16; match the slot/crop and measured scene duration. Actual filmed workflow, physical phone evidence and human approval remain separate acceptance work.
- **B-roll:** all three planned clips already existed. This cut uses the desk clip in S1; the transfer and laptop clips are retained unchanged for later editorial placement. No additional B-roll is required to render this cut.
- **Results:** populate data/results.json from reviewed evidence for all four configurations, including timestamp, source paths, native metric units/aggregation and the source-specific shared-GPU disclosure. Update the suite label from planned to measured when warranted. Until pending is explicitly false, benchmark values cannot appear. The checker proves numeric JSON bindings, not the clinical validity of supplied measurements. The completed-results layout requires a new check/review with real values.
- **Narration mismatch:** the required S7 narration speaks about measured numbers while the required pending first-cut screen displays no benchmark measurements. Planned counts and hardware metadata are visible and data-bound. Resolve this with completed evidence or an authorized later narration revision.
- **Timing:** the final duration is 177.700 s, shorter than the approximate 280-s target. Exact measured narration plus the specified 0.6-s padding and frame rounding controls the cut. No narration exceeds its original audio budget; S1 becomes 20.4 s only after padding. A longer cut requires an editorial timing/narration decision.
- **Captions and voice:** sentence changes are estimated from text length within measured narration duration. A human listening pass and exact speech-aligned caption timing are still useful before submission. No music is included.

Final MP4 SHA-256: 5cd1cef324e04cdf3e9930f45d8f5d820a5f2acd689050ee0e5ca406a6f1fdad. Final contact-sheet SHA-256: 96db4899585369057ba83e85375cc0e17f796255448fe1fecd432afec32aacd3.
