# Architecture

Electron desktop with sandboxed renderer, isolated preload API and private Node application service. QVAC runs in a separate worker process. Expo Android handles foreground capture and an encrypted local pending queue. A paired TLS endpoint accepts authorized capture envelopes only.

The authoritative vault is one authenticated encrypted file with atomic replacement, holding patient metadata, captures, sources, drafts, approved records and device authorization. Unlocked data lives in process memory. QVAC image inputs require bounded temporary files; cleanup and limitations are tested and documented. Runtime model cache is distinct from clinical content.

Clinical draft generation uses only the current corrected source plus separately identified canonical excerpts from approved history when an explicitly configured retrieval provider is enabled. A provider cannot authorize a patient or supply unchecked text. Default provider is absent; history browsing works without RAG.

No externally hosted inference, retrieval service or required sibling repository. Models download during provisioning. Submission model measurements use synthetic fixtures. Branch can move intact into a dedicated repository.
