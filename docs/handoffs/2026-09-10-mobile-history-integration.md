# Mobile history and Hyperswarm — September 10, 2026

The recovered history storyboard is implemented and the combined Android update is installed on Samsung SM-F966B. The installed APK was pulled back and SHA-256 matched the build: 421506b37d9af37ca9f4dda6e87a04ff254733632b484bf122628d14f41e256e. Installation used adb install -r, preserving data. SDK **0.18.2** and team ancestor 21f7f40736c201f8d3c14a36ced4cdb426639122 remain required.

See the [final build/install receipt](../../apps/mobile/evidence/mobile-history-navigation-install-20260910.json), [earlier history install](../../apps/mobile/evidence/mobile-history-install-20260910.json), [complete synthetic phone run](../../apps/mobile/evidence/mobile-history-synthetic-run-20260910.json), and [isolated check instructions](../../apps/mobile/checks/README.md). The earlier prebuild receipt is historical; its native approval and device blockers were resolved.

## Implemented behavior

Native cover and unfolded layouts provide a persistent patient header, approved-record browsing, literal search, model preparation and source citations. At 600dp and above, records remain beside the selected source. Displayed quotations are sliced from authorized record/revision offsets. Opening a source scrolls to its measured position on the cover layout and resets the unfolded detail pane; repeated selections work too.

Desktop history-enabled pairing explicitly grants access to the encounter-derived patient. Capture-only credentials have no history grant. Changing consent, transport or receiver address hides the old QR, and delayed responses cannot restore a stale invitation. The generated status explicitly states the granted scope. POST /history returns current, nonsuperseded approved revisions with record/byte limits and omission coverage. Sync atomically replaces the encrypted snapshot. Offline browsing discloses that later PC changes and revocation cannot be verified while disconnected.

The coordinated Hyperswarm implementation tunnels the existing pinned TLS receiver over Noise. The pairing dialog defaults to Hyperswarm P2P and offers explicit Local Wi-Fi. Endpoint identity, certificate pin, token and encounter binding remain authoritative. Background, failed setup and pairing changes invalidate the tunnel; failure does not silently select LAN.

The experimental phone runtime bundles checksum-verified Qwen3-0.6B Q4_0 and runs QVAC 0.18.2 over BareKit on CPU. It permits one completion at a time, disables KV reuse and selects source IDs over bounded lexical candidates. It is not a semantic embedding index or a validated clinical summarizer. Exact requests, configuration and actual native measurements are stored in encrypted local journals. The approved native generation gate rejects late writes after clear/background and retires terminal IDs only after durable storage.

## Verification

- Actual Expo CLI dependency installation and prebuild completed; QVAC worker ABI and all seven Hyperswarm addon versions matched.
- Mobile TypeScript passed. The isolated full root suite passed 162 tests with zero failures and one explicitly skipped real-GPU test. Final incremental checks passed five consent, seven policy and six mocked runtime lifecycle tests. The synthetic App/UI harness passed 20 groups; seven further navigation groups passed against the final source. These hook/layout checks do not establish native gesture or geometry acceptance.
- Final targeted history/consent/Hyperswarm suite: 47 passed, zero failures/skips. Seven new desktop QR regressions cover selection changes, delayed responses and declared grant scope.
- Native JVM tests: 16 passed. Kotlin and instrumentation compilation passed. The initial 2 GB R8 build ran out of heap; the serialized 4 GB release build succeeded. The build script now defaults to 4 GB.
- Final APK: 621,893,278 bytes, arm64, min SDK 29, target 36. Model: 382,156,480 bytes, SHA-256 33bcc57074ec7b6eada5a90651ee546ec0c2b271002c22baf9f1b2dd1e8f75cb. Existing local development signing identity retained. Backup and cleartext disabled; no audio/storage permissions.
- The earlier production build survived more than six minutes. The final navigation APK passed cold launch and delayed same-process checks, then opened history and prepared its model again. Known-label accessibility inspection confirmed Patient history opens Approved history and Ask history; preparing the model reached **Qwen3 0.6B Q4 · on this phone**. No patient content was collected and screenshot protection stayed enabled. Physical unfolded visual review was not performed.
- All **37 native Android history/JSON/model-journal tests passed** in a separate test package. Earlier locked-device failures and the corrected stale message assertion remain recorded as earlier runs.
- One actual synthetic CPU lookup passed in the separate evidence app. The unchanged production runtime selected source S1, the UI verified the canonical passage, and the encrypted journal authenticated. Candidate APK and Hermes hashes were independently checked.
- Native measurements: 113 prompt tokens, 8 generated and 8 emitted tokens, 232.384 ms native TTFT, 86.8216 tokens/s decode throughput. JavaScript first content: 302.608 ms; completion: 406.158 ms. Model load plus inspection: 2485.163 ms, excluding model copy/checksum.
- The temporary USB stay-awake setting was restored to its original value 0 and verified.

## Scope and remaining acceptance

The phone test used one fixed, tiny synthetic record in tech.adwen.psyrec.capture.evidence, with a distinct UID and no production pairing or vault access. Its APK differs from production because of the test entry. It proves this synthetic source-selection execution, not clinical reliability, sustained performance or a completed production history workflow. Worker cleanup was checked through the SDK close promise, not an independent native process termination observation.

The production model also prepared successfully through the installed UI; no production patient question was submitted. Phone-to-PC Hyperswarm pairing, encrypted history sync/offline/revocation through the production UI and the full physical printed-note workflow still require device/desktop acceptance. Existing capture credentials do not acquire history consent automatically. Use **Read this patient history on my phone** or explicitly enable **Allow patient history on this phone** in a fresh pairing invitation; finish pending captures/observations before replacing pairing.

The active PC application and Claude's chart-review/runtime lane were preserved during this checkpoint. No desktop restart, private-vault read, clinical approval or GPU job occurred. Rebuild/reload the desktop integration only after accounting for the active task and saved edits.

## Ownership and provenance

Coordinator owns contracts/dependencies, integration, documentation and Git; dedicated performance evidence owner retained and at most three disjoint worker cells. Actual Kimi CLI 0.40.1 requested alias kimi-code/kimi-for-coding-highspeed authored initial native/UI/source-selection drafts; its stream did not independently identify the backend. Codex corrections, integration and checks are separately attributed. One conceptual GLM review actually served glm-5.3-flash; a later detailed review was rejected before transmission and not retried. Spark dispatch hit its usage limit before the initial history work. A later actual gpt-5.3-codex-spark CLI run produced the source-navigation patch, with Codex layout-timing corrections. A separate Spark consent attempt could not write because of the Windows sandbox helper; the stopped attempt and Codex-authored final consent fix are separately recorded. The earlier capture checkpoint also used Spark. No Fable or substituted provider is claimed.

The dedicated evidence owner independently accepted the real synthetic run and measurements. Root owns publication of the released Hyperswarm changes together with this integration. Push to the existing QVAC-Psy branch is authorized; do not stage unrelated runtime/MedPsy work, merge main or submit the challenge automatically.
