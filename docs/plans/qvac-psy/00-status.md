# Status: PsyRec QVAC Psy

- Product and architecture direction: APPROVED by Jeff's explicit implementation request, September 9, 2026.
- Program design and slice sequence: implementing the approved plan; concrete contracts recorded alongside code. No fabricated separate approval events.
- Later correction incorporated: approved patient-note browsing now; optional patient-scoped RAG adapter later, supplied by teammate.
- Shared runtime integration: Jeff requested commit `21f7f40736c201f8d3c14a36ced4cdb426639122`; preserve its ancestry and adapt its runtime in TypeScript. SDK pin is now 0.18.2 for team compatibility. Original 0.19.0 plan pin is superseded. Clinical inference remains local on the PC.

## Slices
- [ ] Skeleton: imported image to review screen
- [ ] Real local VisionPsy extraction and measurement
- [ ] Exact approval, encrypted save/reload and patient history
- [ ] Native phone capture, authenticated encrypted transfer, receipt/retry
- [ ] Consequence preview and revision invalidation
- [ ] Reproducible submission evidence and Spanish video

## Open evidence
Real model execution and strict performance records passed: [native feasibility](../../../artifacts/evidence/feasibility-summary.json). All 13 core and metrics tests pass. Desktop locked screen smoke-tested; full review workflow remains untested. Physical Fold acceptance, complete network/temporary-file privacy, fixed quality set and organizer interpretation remain open. Do not mark these passed from source code or mocked tests. Handoff: [fresh-session checkpoint](../../handoffs/2026-09-09-qvac-psy.md).

## Sources
Software Factory upstream: https://gist.github.com/Maciejdziuba/88890d7e0eeefa5a8738bbe9fd5e20b8#file-skill-md . Wayfinder was read from the existing Claude skill source; branch-local Markdown tracking selected by Jeff. No skills or AIOS runtime installed.
