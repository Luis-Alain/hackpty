# PsyRec mobile design study

Status: standalone, source-informed design preview. No PsyRec app or Git changes.

## Design authority
The existing desktop app governs this study:
- C:/Users/jeffe/Code/hackpty/apps/desktop/ui/style.css
- C:/Users/jeffe/Code/hackpty/apps/desktop/ui/index.html
The current mobile flow was inspected in C:/Users/jeffe/Code/hackpty/apps/mobile/App.tsx.

The demo-screens skill was applied. Local Design Foundry and brand-voice guidance was inspected for context; this is not a formal Foundry release or adjudicated brand package. No Kimi, GLM or Fable generation or review is claimed.

## Brand carried into mobile
- PsyRec wordmark with small QVAC PSY descriptor.
- Action teal #18625F; wordmark #174E4B; ink #1B3035.
- Canvas #F3F5F5; sage surface #EDF2F1; border #DCE4E3.
- Positive #346649 on #EAF4ED; failure #974D39 on #FBECE8.
- Segoe UI in this Windows preview. A native implementation should use the platform sans fallback where Segoe UI is unavailable.
- Restrained borders, white panels, 8px action corners and 11px panel corners.
- Source-first, precise language: transfer completion and clinician approval have separate meanings.

## Current workflow visual direction
1. Connect: pair to the PC encounter over private Wi-Fi.
2. Capture: photograph an actual printed note, with the entire page visible.
3. Keep and retry: pending capture remains encrypted; interrupted transfer and certificate rejection are distinct states.
4. Continue on PC: the completed transfer state requires the matching durable receipt. Source correction, VisionPsy, draft review and exact human approval occur on the PC.

The preview illustrates these states. It does not run capture, encryption, certificate checks, transfers, receipts, model inference or clinical approval. It is not device or release acceptance evidence.

## Future history direction requested by Jeff
Once patient-scoped RAG is implemented, inference should also run locally on the phone to review historical records. The phone is a local review workspace in this future design.

- Keep the selected patient visible in cover-screen and unfolded layouts.
- Retrieve only authorized, locally available, current approved record revisions for that patient.
- Show record availability separately from model readiness.
- Cite specific record/revision sources beside generated statements.
- Keep historical records and generated summaries distinct from a new encounter.
- Unfold into a persistent record list beside the answer and selected source.
- When local inference is unavailable, preserve access to authorized local records and explain why asking history is unavailable.
- A generated historical summary is a draft; it does not modify records or create an approval.

All future capability screens are labelled planned/not implemented. No phone model, provider, hardware capability, performance or offline validation is asserted.

## Native implementation handoff
This is visual design, not an implementation contract:
- Retain the existing TypeScript/native Android bridge and Windows transfer contracts.
- Bind every displayed transport state to the real queue/receipt state. Never delete based only on a successful network response.
- Restore an encrypted pending capture after restart; show it before offering a new pairing or capture.
- Keep certificate rejection actionable without encouraging bypass or untrusted re-pairing of a pending capture.
- Preserve lock, foreground/background and local plaintext purge behavior.
- Before implementing history, define authorized record synchronization, patient scope, revision/supersession handling, encrypted storage, deletion and lock behavior.
- Select and benchmark a real compatible local phone runtime/model before showing a ready state. Record the actual provider/model in appropriate diagnostics; none is invented here.
- Map layout to measured Fold cover/unfolded dimensions and actual safe areas.
- Use readable native body text (typically 16sp), scalable type, 48dp touch targets, accessible focus/labels and adequate contrast. The presentation's small captions are not a validated native accessibility specification.

## Prototype controls
Open psyrec-mobile-design.html locally:
- Capture-flow buttons navigate the storyboard.
- Failure-state controls switch between interrupted transfer and certificate rejection.
- Model-state controls toggle the future ready/unavailable design states.
- Ask history opens the synthetic answer on the cover screen.
- Citations and record rows expose their exact synthetic source/revision.
- Escape closes the cover-screen source preview.
Bottom navigation in the history frame is illustrative.

## Outputs and verification
- psyrec-mobile-capture.png: four-screen capture storyboard.
- psyrec-mobile-history.png: cover-screen approved history and unfolded source review.
- psyrec-mobile-history-answer.png: cover-screen answer variant.
- psyrec-mobile-certificate.png: certificate rejection detail.
- psyrec-mobile-model-missing.png: local inference unavailable concept.
- render-checks.json: browser geometry and interaction observations.

Rendered using bundled Playwright and headless Microsoft Edge. Reviewed the capture and history board images. Checked document overflow at 390, 650, 900, 1200, 1400 and 1600 CSS pixels, phone content fit, primary-action bounds, source selection, Escape dismissal, answer-tab behavior, certificate state and model-unavailable behavior. No page JavaScript errors were observed. Wide Fold previews scroll within their own container on narrow pages.

All notes, identifiers, dates and excerpts in the preview are synthetic. Nothing was exported from a private vault. No live app workflow, human clinical review, GPU job or physical-device validation was performed.
