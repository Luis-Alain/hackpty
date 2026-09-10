# Codex task 4 — cut 2 render with verified results (captures may still be placeholders)

Same rules as CODEX-TASK.md (work only inside video/psyrec-demo, never git, never print secrets). Read BRIEF.md, REPORT.md and captures/manifest.json first.

1. If captures/manifest.json lists real captures, wire them into their slots (trim to the scene duration as documented, no re-encode beyond one pass); otherwise keep the honest placeholders. Never fabricate a capture.
2. Render cut 2 to `out/psyrec-demo-cut2.mp4` (1920x1080, 30 fps, strict lint), then extract frames every 5 s and write `review/contact-sheet-cut2.png`. Do not overwrite cut 1.
3. Self-review the contact sheet against the bar (safe zones, one idea per scene, captions never over UI, palette, S7 completed-results screens readable, S8 consistent with data) and fix what you find with one more render if needed (name it cut2b).
4. Measure audio levels as before and record the total duration; it must stay at or below 300 s.
5. Update data/delivery.json with the cut 2 hashes and REPORT.md with exact commands and results, the contact sheet path, and anything the coordinator must still supply (captures, human listening pass).
