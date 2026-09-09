# Enforced offline inference evidence — proposed procedure

Status: **not executed; enforcement is not established**. This preparation is separate from the existing read-only process/socket sampling and does not change SYN-HW-002's provisional status. The smallest next acceptance run remains the fresh human-operated printed synthetic English note workflow.

## Current constraints verified on September 9, 2026

- Windows Defender Firewall profiles Domain, Private and Public are enabled; BFE and MpsSvc are running. The current execution token is **not an elevated administrator**. Sandbox permission to access the repository does not supply Windows administrative elevation.
- The desktop constructs `QvacRuntime({ projectRoot })`. Its worker defaults to `process.execPath`, so the actual desktop inference worker runs the repository's `node_modules/electron/dist/electron.exe`, the same executable as the phone's private-LAN receiver. A rule for system `node.exe` would miss this worker. A broad Electron executable rule would also affect the receiver.
- SDK 0.18.2 launches `bare-runtime` using local `node_modules/bare-runtime-win32-x64/bin/bare.exe`; the inference RPC on Windows uses a named pipe. The runtime already has an explicit `nodeExecutable` option, but the desktop currently supplies no override.
- No firewall, adapter, DNS, route, executable or temporary-file cleanup change was made for this proposal. The previously rejected old temporary-directory deletion must not be retried.

## Smallest bounded preparation, if scheduled by the coordinator

1. Use a unique session directory under the repository's ignored `.local/` tree. Copy the installed supported Node executable into that session and verify its SHA-256 against the installed original. Pass its absolute path through the existing runtime `nodeExecutable` option for the diagnostic session. This needs a small, explicit desktop diagnostic override before use; it is not currently implemented. Retain the executable identity and override in encrypted run evidence. Do not change the SDK pin, model assets, or inference prompts.
2. Resolve the actual Bare executable using `bare-runtime` for `win32/x64`; retain its resolved path and SHA-256. Confirm no other task owns that repository's Bare executable and acquire the sole GPU lease. Do not target system Node, all Electron processes, the browser, Codex, the network adapter, or unrelated applications.
3. With an elevated Windows administrative token, create two uniquely named **outbound Block** rules, one for the session-owned Node executable and one for this repository's Bare executable. Scope both to all protocols, all remote addresses, all active firewall profiles, and only their exact program paths. Leave existing policy intact. The independent Electron receiver keeps its private-Wi-Fi pairing and TLS transfer path; named-pipe inference IPC requires no TCP exemption.
4. Save effective policy before and after creation (including enabled profiles, rule identity, direction, action, address/port/program filters, and enforcement status). Prepare a `finally` cleanup that removes only the two newly created named rules; preserve policy evidence and confirm their later absence. This rule rollback is separate from filesystem cleanup. Never remove pre-existing rules or weaken a profile.

## Evidence required before claiming enforcement

- Establish a reachable, coordinator-selected **non-loopback private-LAN test endpoint** before blocking. Send no patient data, prompts, model output or credentials. Loopback alone is insufficient because Windows loopback filtering can differ from external interfaces.
- Perform the same bounded TCP connectivity probe from each exact blocked executable. Retain baseline success, blocked outcome and, when available, a Windows filtering-platform drop event bound to the program/process. A timeout without a successful baseline and effective-rule proof can be an unreachable endpoint and is not enough. After rollback, repeat connectivity to demonstrate restoration. Probe code must not invoke models.
- Start the existing network observer before the fresh workflow. Retain process identities, executable hashes, active-rule coverage and timestamps throughout both actual SDK runs. Unknown executable children or ineffective rules leave this gate open. Process/socket samples supplement effective policy and the negative control; they do not themselves establish enforcement.
- Perform the full physical Fold workflow while the rules are active: printed synthetic paper photo, encrypted paired private-Wi-Fi transfer and matching durable receipt; human source correction/review; real VisionPsy extraction and bounded Qwen3 draft; exact human approval; encrypted save/reload and selected-patient approved history. The independently verified phone queue/retry/certificate/deletion evidence remains mandatory.
- Bind both GPU run IDs and their actual executable/process identities to the enforcement window and retain exact prompts, model/projector identity and load configuration, native prompt/generated/emitted/cache tokens, load timing, native TTFT and app first-content timing in **ms**, and native throughput in **tokens/s**, with each method. Existing metrics gates still reject missing fields.
- Retain private records encrypted and publish only reviewed synthetic evidence under fresh artifact names. A successful result can establish **blocked direct off-host outbound network access for the tested inference executables during the measured runs**. It does not mean the whole PC was offline, all processes were isolated, or the stock file-path image SDK is crash-proof.

If administrative elevation, an appropriate test endpoint, diagnostic executable isolation, or the human/device session is unavailable, leave enforced-offline evidence open. Do not replace it with older sampling, rerun unrelated GPU feasibility work, or consume the reserved September 11 04:00–08:00 Panama verification/submission buffer.


