# PsyRec demo video

First cut following `CODEX-TASK.md` and `BRIEF.md`. HyperFrames is pinned to 0.8.33. All generated files and caches stay in this directory; no repository-level dependencies are required.

1. `npm install --cache .cache/npm`
2. `npm run tts` generates the exact nine Spanish narrations with ElevenLabs, then measures each MP3 with ffprobe. Existing matching audio is reused.
3. Place synthetic desktop/phone captures in `captures/` and coordinator-provided ambient clips in `broll/`; manifests select the assets. Absent assets render labelled placeholders.
4. Fill `data/results.json` from reviewed repository evidence and set `pending: false` only when verified. See `data/results.example.json`. Until then no measured bars or invented values are shown.
5. `npm run check`, `npm run render`, then `npm run frames`.

The output is `out/psyrec-demo-cut1.mp4`; review `review/contact-sheet.png`. `npm run dev` opens the local HyperFrames studio. Node, ffmpeg and ffprobe must be on PATH. See `REPORT.md` for execution results, exact voice, timing, evidence limitations and remaining coordinator inputs.

`scripts/build.mjs` creates the native HyperFrames `index.html`: one composition root, paused GSAP timeline, nine visual scene containers, and timed audio/video elements. `data/build.json` records scene boundaries, text boxes and results bindings. `npm run render` rebuilds and runs the checks before rendering with strict HyperFrames lint. Run `node scripts/run.mjs lint . --json` for the engine's lint alone.

Each final scene is `ceil((ffprobe duration + 0.6) * 30) / 30` seconds. No speech is trimmed or stretched. Sentence captions preserve the narration exactly; their changes are estimated proportionally to sentence length, so a later voice-synchronized caption pass may improve timing. The current measured cut is shorter than the storyboard's approximate target.

ElevenLabs uses Lucy - Warm Latin Spanish Female (`Bh4tkGuEEIADxUACafG5`), `eleven_multilingual_v2`, at speed 0.85. `audio/manifest.json` retains exact texts, settings, hashes and durations. `node scripts/tts.mjs --list` lists matching account voices without showing credentials. The default key location is the one specified in CODEX-TASK.md; `PSYREC_SECRETS_FILE` and `PSYREC_VOICE_ID` permit explicit local overrides. The script selects only ELEVENLABS_API_KEY with awk; it never sources the secrets file. Awk defaults to Git for Windows' installed executable; elsewhere it uses PATH.

For captures, append entries to `captures/manifest.json` such as `{ "scene": "S4", "file": "s4-desktop.mp4", "width": 1920, "height": 1080, "synthetic": true }`. Files must cover the scene's measured duration. Desktop slots are 16:9; the phone slot is portrait 9:16. Supply a matching recording/crop; aspect and duration mismatches fail the build. Remove pairing tokens, credentials and any private material before supplying clips. S1 consumes the supplied desk B-roll once and returns to the flat workflow diagram; the other two supplied ambient clips are preserved for later editorial use. Removing a B-roll file gives a labelled flat placeholder.

When completing results, keep all schema fields, use actual finite numeric values, include reviewed evidence paths and the aggregation/units in the disclosure, and provide all four configurations. Ratios render exactly as provided: document whether they are fractions or percentages. The first cut displays the pending banner, planned suite/configuration counts, hardware metadata and no benchmark values. `review/results-trace.json` lists every visible numeral and its exact JSON path. Longer replacement text must pass the browser layout checks again.

Source Serif 4, IBM Plex Sans, IBM Plex Mono and GSAP are vendored in `assets/`; their download URLs and hashes are in `assets/manifest.json`. No external requests are needed during rendering. All temporary/browser state is scoped by `scripts/lib.mjs` to `.cache/`; an existing Chrome or Edge installation is used. Set `HYPERFRAMES_BROWSER_PATH` to override browser discovery.

Narration describes the implemented workflow; screen labels retain the pending physical/human acceptance status. The video itself is not release acceptance. No music is included.
