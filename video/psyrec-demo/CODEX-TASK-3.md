# Codex task 3 — screen-capture helpers for the physical session (no render)

Same rules as CODEX-TASK.md (work only inside video/psyrec-demo, never git, never print secrets). Read BRIEF.md and captures/manifest.json first.

Jeff will run the real workflow on the Windows PC (Electron app "PsyRec") and the Samsung Fold (Android, adb at C:/Users/jeffe/Code/hackpty/.local/android-tools/sdk/platform-tools/adb.exe). We need reliable, low-friction recordings that drop straight into the capture slots (desktop slots 16:9, phone slot 9:16), with ffmpeg on PATH.

Deliver, writing REPORT.md as you go:
1. `scripts/record-desktop.ps1`: PowerShell 5.1 script that records the PsyRec window (find the window titled "PsyRec" via Win32 APIs or record the primary screen if not found) with ffmpeg `gdigrab` at 30 fps, 1920x1080 scale if needed, H.264 yuv420p, to `captures/desktop-<scene>-<timestamp>.mp4`; parameters `-Scene S4|S5|S6`, `-Seconds <n>` (default 60), `-Region x,y,w,h` optional; prints the exact ffmpeg command and the output path; stops cleanly on the time limit. No audio.
2. `scripts/record-phone.ps1`: runs `adb shell screenrecord --size 1080x2340 --bit-rate 8000000 --time-limit <n> /sdcard/psyrec-<scene>.mp4`, then `adb pull` into `captures/phone-<scene>-<timestamp>.mp4` and deletes the device copy; parameters `-Scene S3`, `-Seconds <n>` (default 90). Print device model from `adb shell getprop ro.product.model` and refuse if no device.
3. `scripts/captures-manifest.mjs`: scans captures/, probes each MP4 with ffprobe (duration, width, height, sha256) and rewrites `captures/manifest.json` with the slot mapping rules from BRIEF.md (phone 9:16 for S3; desktop 16:9 for S4, S5, S6), keeping any human-entered notes; documents how a capture is trimmed to the scene duration (ffmpeg -ss/-t) without re-encoding artifacts beyond one pass.
4. `captures/README.md`: a one-page checklist for Jeff in Spanish and English: which scene to record when (S3 phone capture and send; S4 extraction and correction; S5 chart review; S6 approval, lock, reload), the two commands, and the rule that captures show only synthetic data and no passphrase entry.
5. Validate: run each script's `-WhatIf` or dry mode if you add one, run `node scripts/captures-manifest.mjs` on the empty folder (must write a valid manifest with zero entries), and `npm run check` must still pass. Do not run a render.
