# Android capture detail candidate — September 9, 2026

This is a source candidate for preserving image detail. Mobile TypeScript, native Kotlin and Android instrumentation compilation pass. Six Kotlin/JVM policy tests pass. Coordinator review and local Release APK packaging also passed. The coordinator also verified in-place installation against the pulled installed APK hash at 21:11:54 UTC. Physical evaluation remains pending; no OCR accuracy improvement, phone lifecycle acceptance or handwriting acceptance is claimed.

## Device, binary and source are distinct

The coordinator's pre-install read-only Fold observation identifies model `SM_F966B`, installed version `0.1.0` / code `1`, package last update `2026-09-09 13:54:31`, and device-side base APK SHA-256 `084e23b7a10899a472691c087460e4be91bf206280690b2386e1ade089716818`. The earlier prepared lifecycle APK `6c7311593faf65a99e787b92cdb396b98866e984550dc372a838cae24780f8a5` was not installed at that observation. That previous built artifact does not contain this capture-quality candidate. Neither observation upgrades historical physical evidence.

The reviewed candidate APK is `283425bdd88a6a01fc6c71baea8d9455bdcf04d7b6906e4d1c492d8650bc416b` (31,497,827 bytes), built locally with `app:assembleRelease`. Its existing development signature verifies, and the packaged `classes2.dex` contains the candidate mode and policy class. At `2026-09-09T21:11:54.7813450Z`, the coordinator installed it with `adb install -r`, pulled the installed base APK and verified the identical SHA-256. The Fold reported `SM-F966B`, version `0.1.0` / code `1`, unchanged first-install time `13:15:05`, and local last-update time `16:11:54`; no uninstall or app-data clear occurred. This cell read the metadata-only installation receipt. It has not performed camera actions or model inference for this candidate.

## Candidate behavior

- CameraX requests `2048 × 1536` with explicit JPEG quality `100` and `CAPTURE_MODE_MAXIMIZE_QUALITY`. Requested dimensions are a selection preference, not a fixed output size or maximum sensor resolution. The prior source requested `1600 × 1200`.
- Pixel normalization applies the actual `ImageProxy.imageInfo.rotationDegrees`, preserves decoded pixel dimensions except for the width/height swap at 90/270 degrees, and writes JPEG quality `100` instead of `90`. Even zero-rotation images pass through pixel reconstruction so uncertain source EXIF orientation and camera metadata are not forwarded. Quality 100 is still JPEG re-encoding; it is not lossless.
- Encoded JPEG dimensions are independently read back in memory with `inJustDecodeBounds` and compared to the normalized bitmap before encrypted queue storage.
- An 8 MiB fixed-capacity output stream rejects an oversized encoding. The app reports a retake message instead of silently resizing, reducing JPEG quality or writing a plaintext image. The original transfer size boundary is unchanged.

## Encrypted capture metadata

The phone stores `captureMetadata` beside the image within the existing AES-GCM record. It retains that metadata with the encrypted receipt after photo removal. Fields are: `schemaVersion`, `mode`, requested width/height, actual raw ImageProxy width/height, decoded width/height, emitted JPEG width/height, raw rotation degrees, requested camera JPEG quality, emitted JPEG quality, normalization method and encoded byte count.

This metadata is currently phone-local. No capture payload, lifecycle evidence schema, root contract or PC validator has changed. The existing image SHA-256 still binds the exact transferred JPEG. A later reviewed metadata transport contract is required before the PC evidence exporter can include these new fields. Older captures receive no reconstructed metadata.

## Memory and verification scope

Raw camera copies, encoded byte arrays and the fixed output buffer are wiped in `finally`, including error paths. Mutable decoded pixels are erased before recycling; every owned bitmap and ImageProxy is released, and synchronous capture-start errors reset the busy state. The fixed output buffer avoids abandoned plaintext copies from growing a ByteArrayOutputStream. Immutable base64/JSON strings and camera/native runtime buffers cannot be proven erased by these changes; abrupt process termination is not a verified memory-erasure boundary. Source images are never persisted as plaintext by this capture code.

Three new JVM checks cover valid rotation dimensions, rejection above the byte boundary, exact-boundary acceptance and buffer wiping. Existing certificate/receipt policy tests also pass. The Android encrypted-storage instrumentation now checks that capture metadata remains encrypted and survives photo-to-receipt replacement; it compiles but was not executed for this candidate. Image encoding/rotation on the Fold and before/after OCR measurements remain pending.

[CameraX ImageCapture.Builder reference](https://developer.android.com/reference/androidx/camera/core/ImageCapture.Builder) explains target-resolution selection and JPEG settings. [QVAC multimodal guidance](https://docs.qvac.tether.io/ai-capabilities/multimodal/) still requires the current VisionPsy base model/projector pair to leave `image_no_upscale` unset; this candidate does not change that model rule.
