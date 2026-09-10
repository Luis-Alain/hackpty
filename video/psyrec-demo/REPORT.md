# PsyRec first-cut execution report

## Task 4 — complete

Delivered [out/psyrec-demo-cut2.mp4](out/psyrec-demo-cut2.mp4): **1920x1080, 30 fps, H.264/AAC, 177.700 s (2:57.7)**, 10,222,846 bytes. Strict lint: **zero errors/warnings**. Layout/evidence gate: **194 boxes, 45 browser samples, 49 numeric bindings, zero failures**. Reviewed [review/contact-sheet-cut2.png](review/contact-sheet-cut2.png), containing 36 frames every five seconds. Both S7 completed-results tables and S8 passed encoded-frame visual review. No cut2b was necessary. Audio mean **-23.3 dBFS**, sample peak **-5.0 dBFS**. Cut1 MP4 and contact-sheet hashes are unchanged.

[data/delivery.json](data/delivery.json) now records cut2 hashes and measurements and retains the complete historical delivery metadata. Video SHA-256: `044afb7e0149484b3a9198d29b6469c2c9063be6a8bba47ebbad858454310310`. Contact-sheet SHA-256: `e07368963a2ab09a9bf5c86d0c26b1c73411b5f6e2d320664cac7fd2091644af`.

Coordinator still supplies synthetic-reviewed phone S3 and desktop S4/S5/S6 captures; these four slots remain explicitly pending. A human listening pass must check pronunciation, narration joins, listening level and the estimated sentence-caption timing. A human playback review should judge S7 reading time (about 11.98 s accuracy and 11.06 s performance, with a dense but legible disclosure). No TTS regeneration, new B-roll or replacement results data was needed. Physical/human workflow acceptance remains a separate open gate.

Authored changes: `scripts/run.mjs`, `scripts/frames.mjs`, `README.md`, `REPORT.md`, `data/delivery.json`; project-local finalization helper `.cache/finalize-cut2.mjs`. Generated artifacts: cut2 video/log, 36 cut2 frames/contact sheet, cut2 probe/frame index/audio levels/lint/check/results trace, and the existing build/layout-preview/cache outputs. The composition source, clinical text, narration, results values and source media were preserved. All writes stayed inside this directory; no Git command, device operation, inference run, secret access or external publication occurred.

Final independent file check: `node --input-type=module -e "import {readFileSync} from 'node:fs'; import {createHash} from 'node:crypto'; const d=JSON.parse(readFileSync('data/delivery.json','utf8')); for (const f of d.files) { if (createHash('sha256').update(readFileSync(f.file)).digest('hex')!==f.sha256) throw new Error('Hash mismatch: '+f.file); } console.log('Verified '+d.files.length+' cut2 artifact/source hashes; duration '+d.duration+' s; results pending='+d.pendingResults);"` exited 0: all 19 hashes match, duration 177.7 s, pending=false. Final `Get-FileHash out/psyrec-demo-cut1.mp4,review/contact-sheet.png -Algorithm SHA256` also exited 0 with both original hashes unchanged.

Read CODEX-TASK-4.md, CODEX-TASK.md, BRIEF.md, the existing report and captures/manifest.json before execution. The supplied working agreement applies; no local AGENTS.md exists (initial read returned exit 1). The ten required repository checkpoints were accessed read-only from ../..; no Git or secret access is needed. Three required read-only cells review runtime evidence, transport and clinical presentation; the coordinator owns all writes.

Step 1 complete: captures/manifest.json has zero captures and zero recordings, with all four selectedFile values null. Keep the honest S3/S4/S5/S6 placeholders; no trimming, capture encoding or fabricated capture is required. Existing data/results.json is completed (pending: false).

Step 2 started: add validated --cut output naming to the existing runner/frame extractor because both currently hard-code cut1. Preserve historical cut1 MP4, numbered frames, contact sheet and metadata. Render cut2 with existing 1920x1080/30 fps/software-browser/strict-lint settings and project-local caches, then extract every five seconds.

Step 2 commands so far:

- `node --check scripts/run.mjs` and `node --check scripts/frames.mjs`: exit 0. Added only validated cut naming, cut-specific logs/frame/probe paths, and refusal to overwrite an existing non-cut1 render. Defaults remain compatible with the original commands.
- Read installed `node_modules/hyperframes/README.md`; `node --input-type=module -e "import {command,cli} from './scripts/lib.mjs'; console.log(command(process.execPath,[cli,'--help'])); console.log(command(process.execPath,[cli,'render','--help']));"`: exit 0, HyperFrames 0.8.33, localEnv confinement. No installation.
- `Get-FileHash out/psyrec-demo-cut1.mp4,review/contact-sheet.png -Algorithm SHA256`: exit 0; matches both historical hashes below.
- `$env:npm_config_cache = Join-Path (Get-Location) '.cache/npm'; $env:TEMP = Join-Path (Get-Location) '.cache/tmp'; $env:TMP = $env:TEMP; npm.cmd run render -- --cut cut2`: exit 0. Embedded pre-render check passed (194 boxes, 45 browser samples, 177.700 s, all nine audio hashes/durations and numeric bindings). Renderer uses four software browser workers, not an inference job.

Read-only review cells: all four score/performance sets match source summaries/raw native metrics at supplied rounding. The target is 0.8 and configuration (iii) has the largest strict recall (0.333); S8 matches. `firstPassValidity` represents the scored strict schema-valid rate of the first output, not the separate parse-only extraction flag; current screen wording follows the frozen checkpoint. Zero forbidden-term matches do not prove absence of hallucinations. S5 examples are human-reference suite examples, not successful model captures. Transport review confirms exact labelled placeholders with correct aspect ratios and pending physical/human acceptance. No evidence values or narration changed.

Step 2 complete: render exit 0, HyperFrames 0.8.33 strict render succeeded in 6m 27.3s. `npm.cmd run frames -- --cut cut2` (same project-local npm/TEMP/TMP environment): exit 0. Generated `review/frame-cut2-001.png` through `frame-cut2-036.png`, at 0, 5, …, 175 seconds, and `review/contact-sheet-cut2.png`. `review/output-probe-cut2.json` confirms 1920x1080, 30/1 fps, H.264/AAC and 177.700 s. Exact underlying ffmpeg commands were appended automatically below. Historical cut1 frame/probe/contact-sheet names were not reused.

Step 3 complete: visually inspected the entire contact sheet plus original-resolution encoded frames `review/frame-cut2-027.png` (130 s, S7 accuracy), `review/frame-cut2-030.png` (145 s, S7 performance), and `review/frame-cut2-033.png` (160 s, S8). Text stays inside the 5% safe zones; captions occupy their separate bottom rail, with no overlap on UI/diagrams. Palette and contrast are consistent. Each scene retains its storyboard topic; S7 presents one table at a time. Both completed-results screens show full configuration labels and readable metrics; the entire hardware/disclosure block fits. S8 matches the supplied results and retains pending physical/human acceptance. Synthetic chips remain visible. No visual defect requiring a correction render was found, so no cut2b was produced. The complete performance disclosure is dense and warrants a human playback/pacing judgment, although it is legible at 1080p. This review is not a human listening pass.

Step 4 started: measure decoded audio with the same ffmpeg volumedetect method as cut1, retaining the full diagnostic output; verify final duration against the 300 s maximum.

## Task 3 — complete; capture helpers validated, no render

Delivered in the requested order: `scripts/record-desktop.ps1`, `scripts/record-phone.ps1`, `scripts/captures-manifest.mjs`, then `captures/README.md`. Updated `README.md` and this report. Required dry modes passed; the real empty-folder scan produced a valid manifest with **0 recordings and 0 selected captures**. `npm.cmd run check -- --no-layout-previews` exited **0**, with **194 text boxes, 45 browser samples, 177.700 seconds and zero failures**. No render, screenshot, device call, real recording, Git operation or secret access occurred. All writes stayed inside this project.

Final verification commands/results:

- `node --check scripts/captures-manifest.mjs`: exit 0. Both PowerShell scripts passed `System.Management.Automation.Language.Parser.ParseFile`; required `powershell.exe -NoProfile -ExecutionPolicy Bypass -File ... -WhatIf` runs are recorded below.
- `$env:npm_config_cache = Join-Path (Get-Location) '.cache/npm'; $env:TEMP = Join-Path (Get-Location) '.cache/tmp'; $env:TMP = $env:TEMP; npm.cmd run check -- --no-layout-previews`: exit 0. Existing check/build code wrote `index.html`, `data/build.json`, `review/check.json`, `review/results-trace.json`, this report and project-local browser/cache files. No layout-preview images were requested.
- `node .cache/validate-capture-helpers.mjs`: final exit 0. Uses copies of existing synthetic B-roll under unique `.cache/capture-validation-*` fixture folders and real ffprobe, never encoding. Verified empty scan, measured metadata/SHA-256, hash-bound attestation, exclusion of audio-bearing clips, note retention through disappearance/return, dry-run byte preservation and unchanged manifest after a corrupt MP4 probe. Initial fixture assertion incorrectly expected audio-bearing B-roll to be selectable; the scanner correctly rejected it. Corrected the fixture expectation; production scanner needed no fix for this result.
- `node scripts/captures-manifest.mjs --dry-run`: exit 0 after the archive-note correction; actual capture inventory remains empty. Final JSON inspection confirmed captures=0, recordings=0, check passed=true, failures=0, duration=177.7. UTF-8 Spanish checklist inspection passed.
- `Get-FileHash out/psyrec-demo-cut1.mp4,review/contact-sheet.png -Algorithm SHA256`: exit 0. Historical hashes remain `5cd1cef324e04cdf3e9930f45d8f5d820a5f2acd689050ee0e5ca406a6f1fdad` and `96db4899585369057ba83e85375cc0e17f796255448fe1fecd432afec32aacd3` respectively.

During documentation validation, a PowerShell-to-Python pipe replaced Spanish accents with question marks; corrected through UTF-8 apply_patch and verified no question marks remain. An attempted combined delete/add patch was rejected without changing the file. A nested PowerShell parser command lost its quotes and failed before running; the direct parser invocation subsequently passed. These were tooling/documentation corrections, not recording or render failures.

Remaining physical work: Jeff must exercise actual PsyRec window discovery/DPI behavior, Fold encoder support for the requested 1080x2340 size, and record/pull quality. Raw phone footage is preserved and prepared to 1080x1920 separately. Review each whole take before hash-bound synthetic attestation; S6 must use separate takes around off-record passphrase entry. The editor joins those takes in one final preparation encode. Helpers and video captures do not establish physical/human release acceptance. No implementation blocker remains for this task.

Read CODEX-TASK-3.md, then BRIEF.md and captures/manifest.json, CODEX-TASK.md, existing scripts and the ten working-agreement checkpoints (read-only). No local AGENTS.md exists; the supplied working agreement applies. The initial combined read returned exit 1 for that missing file; subsequent reads succeeded. This task prohibits Git and changes outside this directory. Three read-only cells review runtime, phone transport and clinical presentation; the coordinator writes all files in the requested order. No capture, device operation, secret access or render is part of validation.

Step 1 started: PowerShell 5.1 desktop helper, exact PsyRec window title with primary-screen fallback, optional physical-pixel region, bounded silent H.264 recording and side-effect-free WhatIf.

Step 1 implemented in scripts/record-desktop.ps1. ffmpeg uses gdigrab at 30 fps, fit/pad to 1920x1080, libx264/yuv420p, no audio, -t and -n. Win32 compilation temporary files stay under .cache/capture-temp. WhatIf deliberately defers discovery and describes its illustrative fallback; Region produces an exact region plan. Validation follows step 4.

Step 2 started: phone helper with exactly one authorized-device selection, model reporting, 1–180 second duration, checked record/pull/cleanup and no device calls in WhatIf.

Step 2 implemented in scripts/record-phone.ps1. The required 1080x2340/8 Mbps screenrecord command is preserved; raw files need a separate 9:16 preparation pass. Existing device copies are refused, failed pulls preserve them, and the selected serial is reused throughout. ADB can be supplied via -AdbPath or PATH, with the task's SDK location as fallback.

Step 3 started: ffprobe/SHA-256 inventory and deterministic slot mapping. Preserve human notes and explicit synthetic attestations for unchanged bytes, retain unready raw takes in recordings, and select only aspect/duration-compatible attested clips into captures for the existing composition. Trimming uses measured narration plus padding/frame rounding, not storyboard estimates.

Step 3 implemented in scripts/captures-manifest.mjs. Inventory records duration in seconds, coded width/height and SHA-256 for every top-level MP4; unknown names remain visible but unselected. Human notes survive rescans, including absent takes. Modified bytes invalidate prior synthetic attestation. A --dry-run probes without writing; a bad probe leaves the existing manifest intact. No video is processed by this script.

Step 4 started: bilingual scene checklist and commands, one-pass trim/normalization instructions, synthetic-only review, no pairing credentials or passphrase entry, and separate S6 takes around unlock.

Step 4 completed in captures/README.md; the project README links to the helpers and replaces its obsolete manual-manifest instructions. Desktop read-only review found no blocking defects; phone review confirmed command shape, parser validity and a write-free WhatIf (exit 0). Physical recording remains untested. Step 5 now runs the required dry modes, empty-folder scan and npm check with screenshot previews disabled.

Required dry commands succeeded: `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/record-desktop.ps1 -Scene S4 -WhatIf`; desktop Region variant `-Scene S6 -Seconds 12 -Region '-1920,0,1920,1080' -WhatIf`; `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/record-phone.ps1 -Scene S3 -WhatIf`; `node scripts/captures-manifest.mjs --dry-run`; then `node scripts/captures-manifest.mjs`. Console showed the required command arguments and project-local output paths; no capture/device operations ran. Scan reported 0 recordings and 0 selected capture entries. Clinical review caught an absent-then-returned file notes edge case; archived entries are now loaded before current entries so their human notes survive return.

## Task 2 — complete; checks pass, no render

Completed-results `review/check.json`: **passed: true, zero failures, 194 text boxes, 45 browser samples, 49 exact numeric JSON bindings, 177.700 s**. Pending preview: **passed: true, zero failures, 134 text boxes, 41 samples**. The composition is restored to the verified completed state. S7 accuracy runs from 128.166667 to 140.144 s; performance runs from 140.144 to 151.2 s. The screen switch is checked before, exactly at, and after its boundary; only one results screen is visible.

The first-cut MP4 and contact sheet described below are historical pending-results artifacts. `data/results.json` now contains the coordinator's four verified configurations with `pending: false`; this task updates the composition and layout checks only.

Read `CODEX-TASK-2.md`, `CODEX-TASK.md`, `BRIEF.md`, this report, `review/check.json`, and the eight working-agreement checkpoints (read-only). The initial combined `Get-Content -LiteralPath CODEX-TASK-2.md; Get-Content -LiteralPath AGENTS.md` returned exit 1 because no local AGENTS.md exists; the working agreement was supplied in the user prompt. Subsequent `Get-Content -Encoding UTF8 -LiteralPath ...` reads and `rg --files` completed successfully. No Git command was run.

Initial check.json: `passed: false`, duration 177.7 s, 12 failures. These are three unique overflow boxes repeated across four S7 samples: configuration labels (i)/(iii) and the full disclosure. Coordinator owns all edits. Three read-only cells review runtime metrics, transport continuity and clinical wording; no model jobs are needed.

Ordered step 1: replacing the four tall cards with separate accuracy and performance tables within the existing S7 audio duration. Preserve every evidence value and the complete disclosure; use exact JSON bindings for numeric text.

Step 1 implemented: accuracy table includes strictGoldRecall, termOnlyRecall, forbiddenHits and firstPassValidity; performance table includes nativeTtftMs, tokensPerSecond, loadMs, promptTokens and generatedTokens. Full configuration labels, hardware and disclosure remain bound verbatim. The switch is at 52% of S7; captions and audio remain unchanged. Full disclosure now has a dedicated wrapped area above the caption rail. Browser verification follows after steps 2 and 3.

Step 2: adding a numeric strictGoldRecallTarget field transcribed from the existing disclosure (0.80), deriving the headline from comparison against that target, and selecting the strongest label by strictGoldRecall. No measured configuration or evidence metadata is being changed.

Step 2 implemented: current data produces “Ninguna configuración alcanza el objetivo”; objective 0.8 and the strongest configuration's complete label are separate exact JSON bindings. Highest strict recall is configuration (iii), selected by data index, not a hard-coded winner. Pending mode requires neither a target nor completed metrics and retains its placeholder.

Step 3: S8 retains synthetic/no clinical validation and pending physical/human acceptance. It now states no demonstrated MedPsy advantage in this suite (not universal inferiority) and that reasoning with strict schema is not viable in the documented SDK 0.18.2 test. Review caveat: MedPsy beats generic Qwen within thinking-enabled runs, whereas the generic non-thinking run is strongest overall; zero forbidden-term hits do not establish clinical safety.

### Task 2 commands, verification and files

- `Get-Content -Encoding UTF8 -LiteralPath scripts/build.mjs,scripts/check.mjs,scripts/lib.mjs,scripts/run.mjs,scenes.css,data/results.json,package.json,README.md` and targeted reads of the installed HyperFrames README, results example and remaining report/checkpoint sections: exit 0. Used `apply_patch` for all source/documentation edits.
- `npm.cmd run check -- --results-layout`: first invocation's completion status was not retained by the tool wrapper; repeated the same command to capture a definitive result. The captured run exited 1 with 25 failures: five two-line performance headers required 70 px but declared 66 px, repeated across five samples. Increased their boxes to 72 px. All original long-label/disclosure failures were resolved. The checker recorded failures below as it ran.
- The existing Puppeteer layout-preview mechanism wrote only `review/S7-results-layout.png`. Visually inspected this single S7 performance still: full labels, all five metric columns, hardware and complete disclosure fit above the captions in the approved palette. The subsequent header-height correction changes the declared boxes, not their visible typography. No other new scene stills, video render or frame extraction was requested or run.
- `npm.cmd run check -- --pending --no-layout-previews`: exit 0; empty configurations and absent target exercised via an in-memory fixture. No results.json mutation or screenshot. `review/pending-check.json` and `review/pending-results-trace.json` retain this separate result.
- `npm.cmd run check -- --no-layout-previews`: exit 0; final completed state restored to index.html/data/build.json. `review/check.json` contains `passed: true`, `pending: false`, `previewOverride: false`, `totalDuration: 177.7`, 45 observations and `failures: []`. Palette, declared/actual glyph safe zones, overflow, captions/media separation, all nine audio hashes/durations, mandatory metrics, target headline, strongest-label selection, results-screen visibility and all 49 numeric bindings pass.
- Read-only `node --input-type=module` inspection of check/pending-check/results-trace/build JSON and SHA-256 of the existing MP4/contact sheet: exit 0. MP4 remains `5cd1cef324e04cdf3e9930f45d8f5d820a5f2acd689050ee0e5ca406a6f1fdad`; contact sheet remains `96db4899585369057ba83e85375cc0e17f796255448fe1fecd432afec32aacd3`, identical to the first-cut report. No Git command, installation, TTS request, inference job or secret access occurred.

Authored files changed: `scripts/build.mjs`, `scripts/check.mjs`, `scenes.css`, `data/results.json` (only adds strictGoldRecallTarget from the supplied disclosure), `data/results.example.json`, `README.md`, `REPORT.md`. Generated files changed/created: `index.html`, `data/build.json`, `review/check.json`, `review/results-trace.json`, `review/pending-check.json`, `review/pending-results-trace.json`, `review/S7-results-layout.png`, and project-local browser cache. No file outside this project was intentionally modified.

Coordinator decisions: trigger the full render and later frame review when the GPU host is free; the existing MP4/contact sheet remain the historical pending-results cut. Decide whether the unchanged 23.033 s S7 narration allows sufficient reading time for both views (about 11.98 s accuracy / 11.06 s performance); the full disclosure is dense but fits. No timing or TTS change was made. Captures and physical/human acceptance remain pending; this layout pass does not close those gates. Review S8 comparison wording and suite/disclosure strings again if the supplied evidence changes.

## Historical first-cut report (before Task 2)

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

`npm run check` failed: S7@128.967 {"id":"box-110","kind":"overflow","text":"(i) MedPsy-1.7B · sin razonamiento + esquema estricto","scroll":105,"height":74}

S7@128.967 {"id":"box-136","kind":"overflow","text":"(iii) Qwen3-1.7B · sin razonamiento + esquema estricto","scroll":105,"height":74}

S7@128.967 {"id":"box-163","kind":"overflow","text":"Promedios por caso de las métricas nativas del SDK (timeToFirstToken, tokensPerSecond, promptTokens, generatedTokens) sobre los registros de cada ejecución completa; carga = pared alrededor de loadModel (una sola carga en las configuraciones con razonamiento). Procesos GPU ajenos observados por el lease D7: (i): ninguno; (ii): ninguno; (iii): ninguno; (iv): ninguno. Suite congelada y confirmada por revisor humano (goldConfirmedByHuman: true). Ninguna configuración alcanza el objetivo predeclarado de cobertura estricta ≥ 0.80.","scroll":140,"height":46}

S7@140.835 {"id":"box-110","kind":"overflow","text":"(i) MedPsy-1.7B · sin razonamiento + esquema estricto","scroll":105,"height":74}

S7@140.835 {"id":"box-136","kind":"overflow","text":"(iii) Qwen3-1.7B · sin razonamiento + esquema estricto","scroll":105,"height":74}

S7@140.835 {"id":"box-163","kind":"overflow","text":"Promedios por caso de las métricas nativas del SDK (timeToFirstToken, tokensPerSecond, promptTokens, generatedTokens) sobre los registros de cada ejecución completa; carga = pared alrededor de loadModel (una sola carga en las configuraciones con razonamiento). Procesos GPU ajenos observados por el lease D7: (i): ninguno; (ii): ninguno; (iii): ninguno; (iv): ninguno. Suite congelada y confirmada por revisor humano (goldConfirmedByHuman: true). Ninguna configuración alcanza el objetivo predeclarado de cobertura estricta ≥ 0.80.","scroll":140,"height":46}

S7@128.467 {"id":"box-110","kind":"overflow","text":"(i) MedPsy-1.7B · sin razonamiento + esquema estricto","scroll":105,"height":74}

S7@128.467 {"id":"box-136","kind":"overflow","text":"(iii) Qwen3-1.7B · sin razonamiento + esquema estricto","scroll":105,"height":74}

S7@128.467 {"id":"box-163","kind":"overflow","text":"Promedios por caso de las métricas nativas del SDK (timeToFirstToken, tokensPerSecond, promptTokens, generatedTokens) sobre los registros de cada ejecución completa; carga = pared alrededor de loadModel (una sola carga en las configuraciones con razonamiento). Procesos GPU ajenos observados por el lease D7: (i): ninguno; (ii): ninguno; (iii): ninguno; (iv): ninguno. Suite congelada y confirmada por revisor humano (goldConfirmedByHuman: true). Ninguna configuración alcanza el objetivo predeclarado de cobertura estricta ≥ 0.80.","scroll":140,"height":46}

S7@144.653 {"id":"box-110","kind":"overflow","text":"(i) MedPsy-1.7B · sin razonamiento + esquema estricto","scroll":105,"height":74}

S7@144.653 {"id":"box-136","kind":"overflow","text":"(iii) Qwen3-1.7B · sin razonamiento + esquema estricto","scroll":105,"height":74}

S7@144.653 {"id":"box-163","kind":"overflow","text":"Promedios por caso de las métricas nativas del SDK (timeToFirstToken, tokensPerSecond, promptTokens, generatedTokens) sobre los registros de cada ejecución completa; carga = pared alrededor de loadModel (una sola carga en las configuraciones con razonamiento). Procesos GPU ajenos observados por el lease D7: (i): ninguno; (ii): ninguno; (iii): ninguno; (iv): ninguno. Suite congelada y confirmada por revisor humano (goldConfirmedByHuman: true). Ninguna configuración alcanza el objetivo predeclarado de cobertura estricta ≥ 0.80.","scroll":140,"height":46}

`npm run check` failed: S7@140.835 {"id":"box-143","kind":"overflow","text":"TTFT nativo\nms","scroll":70,"height":66}

S7@140.835 {"id":"box-144","kind":"overflow","text":"Generación\ntokens/s","scroll":70,"height":66}

S7@140.835 {"id":"box-145","kind":"overflow","text":"Carga\nms","scroll":70,"height":66}

S7@140.835 {"id":"box-146","kind":"overflow","text":"Entrada\ntokens","scroll":70,"height":66}

S7@140.835 {"id":"box-147","kind":"overflow","text":"Salida\ntokens","scroll":70,"height":66}

S7@144.653 {"id":"box-143","kind":"overflow","text":"TTFT nativo\nms","scroll":70,"height":66}

S7@144.653 {"id":"box-144","kind":"overflow","text":"Generación\ntokens/s","scroll":70,"height":66}

S7@144.653 {"id":"box-145","kind":"overflow","text":"Carga\nms","scroll":70,"height":66}

S7@144.653 {"id":"box-146","kind":"overflow","text":"Entrada\ntokens","scroll":70,"height":66}

S7@144.653 {"id":"box-147","kind":"overflow","text":"Salida\ntokens","scroll":70,"height":66}

S7@140.144 {"id":"box-143","kind":"overflow","text":"TTFT nativo\nms","scroll":70,"height":66}

S7@140.144 {"id":"box-144","kind":"overflow","text":"Generación\ntokens/s","scroll":70,"height":66}

S7@140.144 {"id":"box-145","kind":"overflow","text":"Carga\nms","scroll":70,"height":66}

S7@140.144 {"id":"box-146","kind":"overflow","text":"Entrada\ntokens","scroll":70,"height":66}

S7@140.144 {"id":"box-147","kind":"overflow","text":"Salida\ntokens","scroll":70,"height":66}

S7@140.177 {"id":"box-143","kind":"overflow","text":"TTFT nativo\nms","scroll":70,"height":66}

S7@140.177 {"id":"box-144","kind":"overflow","text":"Generación\ntokens/s","scroll":70,"height":66}

S7@140.177 {"id":"box-145","kind":"overflow","text":"Carga\nms","scroll":70,"height":66}

S7@140.177 {"id":"box-146","kind":"overflow","text":"Entrada\ntokens","scroll":70,"height":66}

S7@140.177 {"id":"box-147","kind":"overflow","text":"Salida\ntokens","scroll":70,"height":66}

S7@151.100 {"id":"box-143","kind":"overflow","text":"TTFT nativo\nms","scroll":70,"height":66}

S7@151.100 {"id":"box-144","kind":"overflow","text":"Generación\ntokens/s","scroll":70,"height":66}

S7@151.100 {"id":"box-145","kind":"overflow","text":"Carga\nms","scroll":70,"height":66}

S7@151.100 {"id":"box-146","kind":"overflow","text":"Entrada\ntokens","scroll":70,"height":66}

S7@151.100 {"id":"box-147","kind":"overflow","text":"Salida\ntokens","scroll":70,"height":66}

`npm run check` failed: S7@140.835 {"id":"box-143","kind":"overflow","text":"TTFT nativo\nms","scroll":70,"height":66}

S7@140.835 {"id":"box-144","kind":"overflow","text":"Generación\ntokens/s","scroll":70,"height":66}

S7@140.835 {"id":"box-145","kind":"overflow","text":"Carga\nms","scroll":70,"height":66}

S7@140.835 {"id":"box-146","kind":"overflow","text":"Entrada\ntokens","scroll":70,"height":66}

S7@140.835 {"id":"box-147","kind":"overflow","text":"Salida\ntokens","scroll":70,"height":66}

S7@144.653 {"id":"box-143","kind":"overflow","text":"TTFT nativo\nms","scroll":70,"height":66}

S7@144.653 {"id":"box-144","kind":"overflow","text":"Generación\ntokens/s","scroll":70,"height":66}

S7@144.653 {"id":"box-145","kind":"overflow","text":"Carga\nms","scroll":70,"height":66}

S7@144.653 {"id":"box-146","kind":"overflow","text":"Entrada\ntokens","scroll":70,"height":66}

S7@144.653 {"id":"box-147","kind":"overflow","text":"Salida\ntokens","scroll":70,"height":66}

S7@140.144 {"id":"box-143","kind":"overflow","text":"TTFT nativo\nms","scroll":70,"height":66}

S7@140.144 {"id":"box-144","kind":"overflow","text":"Generación\ntokens/s","scroll":70,"height":66}

S7@140.144 {"id":"box-145","kind":"overflow","text":"Carga\nms","scroll":70,"height":66}

S7@140.144 {"id":"box-146","kind":"overflow","text":"Entrada\ntokens","scroll":70,"height":66}

S7@140.144 {"id":"box-147","kind":"overflow","text":"Salida\ntokens","scroll":70,"height":66}

S7@140.177 {"id":"box-143","kind":"overflow","text":"TTFT nativo\nms","scroll":70,"height":66}

S7@140.177 {"id":"box-144","kind":"overflow","text":"Generación\ntokens/s","scroll":70,"height":66}

S7@140.177 {"id":"box-145","kind":"overflow","text":"Carga\nms","scroll":70,"height":66}

S7@140.177 {"id":"box-146","kind":"overflow","text":"Entrada\ntokens","scroll":70,"height":66}

S7@140.177 {"id":"box-147","kind":"overflow","text":"Salida\ntokens","scroll":70,"height":66}

S7@151.100 {"id":"box-143","kind":"overflow","text":"TTFT nativo\nms","scroll":70,"height":66}

S7@151.100 {"id":"box-144","kind":"overflow","text":"Generación\ntokens/s","scroll":70,"height":66}

S7@151.100 {"id":"box-145","kind":"overflow","text":"Carga\nms","scroll":70,"height":66}

S7@151.100 {"id":"box-146","kind":"overflow","text":"Entrada\ntokens","scroll":70,"height":66}

S7@151.100 {"id":"box-147","kind":"overflow","text":"Salida\ntokens","scroll":70,"height":66}

`npm run check -- --pending --no-layout-previews`: PASS. Palette, 134 declared text boxes, 41 browser samples (actual glyph bounds, overflow, caption/media separation), nine audio hashes/durations, 177.700 s <= 300 s, and every results-scene numeral traced to data/results.json with an in-memory pending preview override. Details: review/pending-check.json and review/pending-results-trace.json.

`npm run check -- --no-layout-previews`: PASS. Palette, 194 declared text boxes, 45 browser samples (actual glyph bounds, overflow, caption/media separation), nine audio hashes/durations, 177.700 s <= 300 s, and every results-scene numeral traced to data/results.json. Details: review/check.json and review/results-trace.json.

`npm run check -- `: PASS. Palette, 194 declared text boxes, 45 browser samples (actual glyph bounds, overflow, caption/media separation), nine audio hashes/durations, 177.700 s <= 300 s, and every results-scene numeral traced to data/results.json. Details: review/check.json and review/results-trace.json.

`npm run check -- --no-layout-previews`: PASS. Palette, 194 declared text boxes, 45 browser samples (actual glyph bounds, overflow, caption/media separation), nine audio hashes/durations, 177.700 s <= 300 s, and every results-scene numeral traced to data/results.json. Details: review/check.json and review/results-trace.json.

`npm run check -- `: PASS. Palette, 194 declared text boxes, 45 browser samples (actual glyph bounds, overflow, caption/media separation), nine audio hashes/durations, 177.700 s <= 300 s, and every results-scene numeral traced to data/results.json. Details: review/check.json and review/results-trace.json.

`npm run check -- render --cut cut2`: PASS. Palette, 194 declared text boxes, 45 browser samples (actual glyph bounds, overflow, caption/media separation), nine audio hashes/durations, 177.700 s <= 300 s, and every results-scene numeral traced to data/results.json. Details: review/check.json and review/results-trace.json.

Command: `node node_modules\hyperframes\bin\hyperframes.mjs render . -o out/psyrec-demo-cut2.mp4 --fps 30 --resolution landscape --quality standard --workers 4 --no-browser-gpu --no-best-effort --strict` (local cache/profile/temp environment; telemetry disabled).

Command render exit code: 0; log: `out/render-cut2.log`.

`ffmpeg '-hide_banner' '-loglevel' 'error' '-y' '-i' 'out/psyrec-demo-cut2.mp4' '-vf' 'select=not(mod(n\,150))' '-fps_mode' 'vfr' 'review/frame-cut2-%03d.png'`

`ffmpeg '-hide_banner' '-loglevel' 'error' '-y' '-framerate' '1' '-i' 'review/frame-cut2-%03d.png' '-vf' 'scale=480:270,tile=4x9:nb_frames=36:padding=8:margin=8:color=0xf3f5f5' '-frames:v' '1' '-update' '1' 'review/contact-sheet-cut2.png'`

`npm run frames -- --cut cut2`: PASS. 36 frames at five-second intervals; contact sheet `review/contact-sheet-cut2.png`. ffprobe: 177.700 s, 1920x1080, 30/1 fps, video h264, audio aac. Metadata: review/output-probe-cut2.json; frame/time index: review/frames-cut2.json.

Step 4 complete: `ffmpeg -hide_banner -nostats -i out/psyrec-demo-cut2.mp4 -vn -af volumedetect -f null NUL 2> review/audio-levels-cut2.txt` exited 0. Mean -23.3 dBFS; sample peak -5 dBFS; no sample clipping. Total duration 177.700 s <= 300 s (2:57.7; 122.3 s headroom). PowerShell diagnostic redirection is UTF-16LE. This is decoded audio level measurement, not a human listening or true-peak/LUFS assessment.

Step 5: `node .cache/finalize-cut2.mjs` ran HyperFrames `lint . --json` through localEnv, retained `review/lint-cut2.json` (zero errors/warnings), checked the final probe/check/frame schedule, preserved both cut1 hashes, and wrote cut2 file hashes/measurement metadata to `data/delivery.json`. Prior delivery metadata is retained under historicalDeliveries; current source hashes belong to cut2. Final video: 10222846 bytes, SHA-256 044afb7e0149484b3a9198d29b6469c2c9063be6a8bba47ebbad858454310310. Contact sheet: 1257233 bytes, SHA-256 e07368963a2ab09a9bf5c86d0c26b1c73411b5f6e2d320664cac7fd2091644af. 49 exact numeric bindings; 45 browser samples; zero failures.
