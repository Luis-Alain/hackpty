# Bounded Android inference plan — not implemented

Prepared September 9, 2026 from the installed **@qvac/sdk 0.18.2** source and published **react-native-bare-kit 0.14.0** package. This is a plan only; it does not change production dependencies or add a phone runtime. Windows VisionPsy extraction, source correction, exact clinician approval and encrypted clinical storage remain the release's canonical workflow.

## Smallest first result

Add a clearly labelled **Synthetic offline draft check** to the existing native Fold app. It runs the already provisioned `QWEN3_1_7B_INST_Q4` locally against the fixed printed-note fixture text, displays a short unapproved draft preview, and saves a complete encrypted performance record. It uses no photo decoding, private clipboard, RAG, voice, new model download or PC clinical approval API. This first result proves real phone execution; it must not be presented as an integrated patient-note draft feature. Bringing real reviewed source back to the phone would require an additional authenticated, encounter/revision-scoped PC-to-phone source contract and separate clinical review.

Use `Qwen3-1.7B-Q4_0.gguf`, **1,056,782,912 bytes**, SHA-256 `c876f159707a4e4f70e045106c69db15bfc935a4981706fd4f65c6e7ea1e81c5`, already defined in root `MODEL-MANIFEST.json`. This preserves its true model identity. No claim is made that it fits or performs acceptably until measured on the actual Fold.

## Exact dependency/build proposal

| Package/configuration | Proposed pin | Evidence |
|---|---:|---|
| `@qvac/sdk` | `0.18.2` | Intentional existing SDK pin; package exports Expo plugin and React Native RPC client |
| `react-native-bare-kit` | `0.14.0` | SDK 0.18.2 development dependency baseline; published package inspected |
| `bare-link` | `3.3.0` | Published version satisfies SDK peer `>=3.0.0` and Bare Kit dependency `^3.0.1` |
| `bare-pack` | `2.2.2` | Existing PC resolution; satisfies SDK dependency `^2.0.1` |
| `expo-build-properties` | `55.0.18` | Expo 55.0.31 bundled-native-module compatibility map |
| `expo-device` | `55.0.21` | Same compatibility map; SDK peer minimum is 8.0.0 |
| `expo-file-system` | `55.0.26` | Already installed transitively; make direct for SDK integration |
| `@qvac/llm-llamacpp` | `0.45.0` | Existing verified PC addon; preserve this resolution in the mobile lock |
| Android | minimum SDK 29, NDK `29.0.14206865`, arm64 only | Exact SDK 0.18.2 `withQvacSDK` plugin behavior |

Keep Expo **55.0.31**, React Native **0.83.10**, current Android package and local Gradle scripts. Add `@qvac/sdk/expo-plugin` only after dependency review. No EAS build/update is required by the already linked Expo account.

The published Bare Kit's ARM64 `libbare-kit.so` exports `bare_version` returning **1.28.1** (verified from the function's ARM64 instructions, not a guess from unrelated strings). Pin `bareRuntimeVersion: "1.28.1"` for SDK bundle verification, then confirm it again in the actual worklet. Do **not** copy the PC's resolved Bare 1.32.0 identity into phone evidence. The llama.cpp addon declares Bare `>=1.24.0`.

## Implementation sequence

1. **Native startup only:** add the pins, register only `@qvac/sdk/llamacpp-completion/plugin` in `qvac.config.json`, run the SDK bundle verifier, and build a local arm64 APK. The plugin otherwise bundles all built-in engines, and it verifies several mobile hosts even though the Android APK is arm64-only. Confirm actual Bare worklet startup/close before loading a model. Check the plugin's `libOpenCL.so` manifest declaration on the Fold; do not assume GPU support or silently change backend identity.
2. **Separate model provisioning:** copy the existing public GGUF from PC to phone over authorized USB/wireless debugging when available. An Android system file-picker/native streaming importer copies it into the app's no-backup private model directory, verifies byte count and SHA-256 while streaming, then atomically renames a `.partial` file. No model enters Git or the APK. `adb push` alone cannot write a release app's private directory; use a scoped file import, not `run-as` or broad storage permission. Allow roughly 2.2 GB transient free space if a public staging copy and private verified copy coexist.
3. **One fixed synthetic draft:** initialize the runtime JSON in Expo's private document path before the first SDK call; use an absolute verified model path and private cache directory, console logging off, and no registry/download/delegation APIs. Start with `device:"cpu"`, `gpu_layers:0`, `ctx_size:1024`, `parallel:1`, `verbosity:0`, `reasoning_budget:0`; generation `temp:0`, `seed:42`, `predict:96`, `kvCache:false`, `stream:true`, context empty. Use the existing bounded draft prompt around the exact labelled `DEMO-001` synthetic fixture. These are proposed settings, not measured performance. A later GPU attempt needs the coordinator's single-GPU-job lease and its own explicit configuration/evidence.
4. **Strict encrypted evidence and cleanup:** record exact messages/source text, model hash and load configuration, raw output, request ID, native prompt/generated/emitted tokens, native TTFT and throughput, app first-content time, model-load time, profiler data and observed backend. Use Android Keystore AES-GCM storage for successful and failed runs. Await both `completionDone` and `run.final`, cancel through the SDK request ID, unload, then close the Expo worklet. Missing metrics fail the run. No patient text is introduced by this synthetic check.
5. **Physical acceptance:** provision first, then run with phone Wi-Fi/mobile-data disabled by the user, retaining encrypted records. Record network state and one cold load/completion plus cancellation/reopen behavior. Never call merely requesting local paths a proof of offline execution. Publish only this explicitly synthetic evidence.

## Contract and gate work

The current `packages/runtime/metrics.ts` deliberately accepts the Windows GPU profile only: Node version, OS process/pipes, GPU layers 99, context 4096 and `main-gpu:dedicated`. A phone CPU/worklet run cannot honestly pass it. The coordinator/evidence owner must add a separately discriminated mobile profile with actual Hermes/React Native/Bare identities and transport `bare-worklet-ipc`, while retaining all mandatory token/timing/prompt gates and leaving the desktop gate strict. Mobile code cannot invent a Node version, named pipe, GPU backend or process-isolation claim.

No existing transport endpoint returns reviewed clinical text to the phone. If the synthetic check passes and a real draft-preview feature is requested, that is a further scoped change: PC verifies paired device, selected encounter and current reviewed source revision; phone receives that authorized source over pinned TLS, keeps an encrypted run record, and displays a non-approved preview. PC approval and history remain authoritative.

## Expected barriers and buffer

Estimated engineering/provisioning effort is **2–4 hours on the straightforward path, plus 1–3 hours if native integration fails**; these are planning estimates, not a performance promise. The NDK change, Bare Kit's older Gradle/React Native integration with Expo 55, SDK linker patches, multi-host addon verification and device OpenCL availability are concrete build risks. Bare Kit's inspected ARM64 library is about 63 MB and the selected QVAC Android addon/backend files exceed 100 MB before packaging, so APK growth is material even though the 1.06 GB model stays separate. Actual RAM, thermal behavior and latency remain unmeasured.

Stop the spike at the first unresolved build/ABI/offline/privacy/metrics failure and preserve the functioning Windows-central release plus its final buffer. This plan adds no Pi5, cloud inference, RAG, voice, new provider identity or model substitution.
