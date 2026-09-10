# Codex task — build the PsyRec demo video project (first cut)

You are the builder for `video/psyrec-demo` inside the hackpty repository (Windows 11, Node 24 at "C:/Program Files/nodejs", ffmpeg on PATH). The coordinator (Claude) planned the video in BRIEF.md; build exactly that. Work only inside `video/psyrec-demo/`. Read anything in the repository you need (docs/DEMO.md, docs/CHART-REVIEW.md, docs/ACCURACY.md, apps/desktop/ui/style.css, diagnostics/qvac-spike/chart-review/suite/draft-v1.json for the CR-09 and CR-05 texts, diagnostics/qvac-spike/MEDPSY-RUNTIME.md, README.md), but never modify any file outside `video/psyrec-demo/`.

Hard rules
- Never run git add, commit, push, stash, checkout or reset. The coordinator commits.
- Never print or copy secrets. Read ONLY `ELEVENLABS_API_KEY` from `C:/Users/jeffe/.config/adwen/secrets.env` with a per-key awk; never source or cat that file.
- No claims beyond the repository's evidence. Results scene renders the pending state until `data/results.json` has `pending: false`.
- Do not install Remotion or any per-render SaaS. Engine is `hyperframes` 0.8.33 from npm; read its documentation from the installed package (README, `npx hyperframes --help`) before writing compositions, and follow its actual project conventions rather than assumptions.
- Keep the total render at most 300 seconds; target 280.

Deliverables (in order; write `REPORT.md` in the project as you go with exact commands and results)
1. `package.json` (private, `hyperframes` pinned 0.8.33, scripts `dev`, `render`, `check`, `frames`, `tts`), local `.gitignore` (node_modules, out/, review/, any cache), `README.md`.
2. Composition with nine scenes per BRIEF.md, palette and type as specified (vendor fonts or load from Google Fonts with fallbacks), synthetic chip on every clinical-text scene, placeholders for captures and B-roll that render cleanly.
3. `scripts/tts.mjs`: ElevenLabs text-to-speech for the nine narration strings (voice: a neutral Latin American Spanish voice from the account's voice list; choose one and record its id and name in `audio/manifest.json`; model `eleven_multilingual_v2` or the current multilingual model), MP3 per scene in `audio/`, durations via ffprobe, manifest with text, file, duration, voice. Scene durations derive from the manifest with 0.6 s padding; if a scene's narration exceeds the storyboard budget, keep the audio and log it in REPORT.md rather than trimming text.
4. `data/results.json` with the schema from BRIEF.md, `pending: true`, and an example of the structure in a comment file `data/results.example.json` so the coordinator can fill real values.
5. `scripts/check.mjs`: banned-hex check (only the palette hexes from BRIEF.md plus pure black/white are allowed in scene CSS), safe-zone lint (text boxes inside 5 percent margins), total duration check, and a trace that every numeric literal shown in the results scene comes from data/results.json.
6. Render a first cut MP4 to `out/psyrec-demo-cut1.mp4` (1920x1080, 30 fps), then `scripts/frames.mjs` extracts a frame every 5 s into `review/` and writes `review/contact-sheet.png` (ffmpeg tile) so the coordinator can review in one image.
7. Self-review against the bar (text inside safe zones, one idea per scene, captions never over UI, palette clean) and fix what you find; note remaining issues in REPORT.md.

Finish with REPORT.md containing: files created, exact commands and results (install, tts, check, render, frames), the voice used, total duration, the contact sheet path, unresolved issues and what the coordinator must supply (captures, B-roll, results.json).
