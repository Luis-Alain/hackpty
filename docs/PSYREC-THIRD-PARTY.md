# PsyRec release attribution

This document describes the independent QVAC Psy slice. The inherited [THIRD_PARTY.md](../THIRD_PARTY.md) describes the team's other modules and hardware; those declarations are preserved as provenance and do not describe PsyRec's execution evidence.

## Code

- The repository retains its [MIT licence](../LICENSE), copyright 2026 Luis Alain. Team runtime commit `21f7f40736c201f8d3c14a36ced4cdb426639122` remains in this branch's ancestry. `src/core/` and `evidencia/` preserve the original work; `packages/runtime/` is the TypeScript adaptation with projector handling, isolated jobs and strict private performance records.
- `@qvac/sdk` **0.18.2** declares Apache-2.0 in the installed package and includes `LICENSE` and `NOTICE`. Preserve these notices when distributing the SDK. The version is intentional for team compatibility; PsyRec does not use its delegation, voice or embedding capabilities in this release.
- Electron, TypeScript, `qrcode` and `selfsigned` retain their package licences through the lockfile installation. The mobile package has its own pinned dependencies and native module source; consult its README for build requirements.

## Provisioned models

Model binaries are downloaded separately and excluded from Git. Exact download revisions, sizes and SHA-256 hashes are in [MODEL-MANIFEST.json](../MODEL-MANIFEST.json); inference refuses mismatched assets.

| Asset | Attribution | Declared licence and source |
|---|---|---|
| VisionPsy Nano 460M base Q8_0 and matching Q8 projector | Tether AI Research / Tether Data, S.A. de C.V.; nanoVLM architecture, SigLIP2 vision encoder and SmolLM2 language backbone | Apache-2.0, [pinned publisher model card](https://huggingface.co/qvac/VisionPsy-Nano-460M-GGUFs/blob/4138c5bd6e026d67cebf2dbd2d81c6229c14cdc1/README.md) |
| Qwen3-1.7B Q4_0 GGUF | Qwen Team; GGUF distribution by Unsloth | Apache-2.0, [pinned GGUF card](https://huggingface.co/unsloth/Qwen3-1.7B-GGUF/blob/d7f544eead698dbd1f15126ef60b45a1e1933222/README.md), [upstream model licence](https://huggingface.co/Qwen/Qwen3-1.7B/blob/main/LICENSE) |
| MedPsy-1.7B Q4_K_M imatrix GGUF (SDK registry constant `HEALTHCARE_1_7B_MEDICAL_Q4_K_M`; now in the production manifest as the `review` role — evaluation candidate; release adoption is not established) | Tether AI Research / Tether Data, S.A. de C.V.; post-trained on the Qwen3-1.7B thinking backbone | Apache-2.0, [pinned GGUF revision](https://huggingface.co/qvac/MedPsy-1.7B-GGUF/tree/fd4cecc90c2de8dce4b112795456a54be9c59363), [provisioning receipt](../artifacts/evidence/medpsy-1.7b-provisioning.json) with verified bytes and SHA-256 |
| Qwen3-0.6B Q4_0 GGUF (experimental bundled phone candidate; one synthetic phone lookup verified, clinical quality unvalidated) | Qwen Team; GGUF distribution by Unsloth | Apache-2.0, [pinned GGUF card](https://huggingface.co/unsloth/Qwen3-0.6B-GGUF/blob/50968a4468ef4233ed78cd7c3de230dd1d61a56b/README.md), [upstream licence](https://huggingface.co/Qwen/Qwen3-0.6B/blob/main/LICENSE); exact size/hash in the [provisioner](../apps/mobile/scripts/provision-history-model.mjs) |

Licence metadata was checked September 9, 2026. These publisher declarations are attribution, not evidence of clinical quality. PsyRec's small synthetic evaluation set and full workflow receipts must stand on their own. No model benchmark claim from the cards is adopted as a PsyRec result.

## Evidence and portability

Only explicitly synthetic notes, photographs, prompts and measurements may be published. Real clinical inputs and their exact prompts belong inside the encrypted vault. The repository does not include personal vaults, phone credentials, TLS private keys, model binaries or sibling-repository dependencies. Move the branch's complete Git history to the future submission repository when Jeff creates it; retain this attribution and the inherited notices.
