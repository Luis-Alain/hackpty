# Capturas / Capture checklist

Desde / From `video/psyrec-demo`: Windows PowerShell 5.1, Node, ffmpeg + ffprobe en / on PATH; ADB USB autorizado / authorized for phone.

| Escena / Scene | Momento / What to record |
| --- | --- |
| S3 · teléfono / phone | Foto de nota impresa sintética, cola cifrada, envío y recibo / Synthetic printed-note photo, encrypted queue, send and receipt. |
| S4 · PC | Extracción VisionPsy, comparación y corrección humana / VisionPsy extraction, human comparison and correction. |
| S5 · PC | Historial del paciente seleccionado, evidencia y cobertura; experimental, sin aprobar / Selected-patient chart review, evidence and coverage; experimental, unapproved. |
| S6 · PC | Borrador, aprobación exacta, bloqueo y texto aprobado recargado / Draft, exact approval, lock and reloaded approved text. |

**Antes / Before:** sólo datos sintéticos; nunca pacientes reales, contraseñas, notificaciones privadas ni QR/tokens, incluso en originales. Desbloquear y emparejar antes. / Synthetic only; never real patients, passphrase entry, private notifications or QR/tokens, even in raw files. Unlock and pair first. Mantener PsyRec visible sin ventanas encima; si no existe, se graba la pantalla principal: despejarla. / Keep PsyRec visible and unobscured; if absent, the primary screen is recorded: clear it. Teléfono vertical, sin girar ni plegar / Phone portrait, no rotation or folding.

**Dos comandos / Two commands** (cambiar / change S4 → S5/S6):

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/record-desktop.ps1 -Scene S4 -Seconds 60
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/record-phone.ps1 -Scene S3 -Seconds 90
```

Añadir / Add `-WhatIf`: vista previa sin grabar ni escribir / preview without recording or writes. Desktop: `-Region '0,0,1920,1080'` reemplaza la búsqueda de ventana; píxeles físicos / overrides window discovery; physical pixels. Phone: `-AdbPath 'path/to/adb.exe'` opcional / optional; busca PATH y luego SDK local / searches PATH then local SDK. Un solo dispositivo autorizado; imprime modelo / Exactly one authorized device; prints model. Límites: teléfono 1–180 s; valores predeterminados PC 60 s, teléfono 90 s. / Phone limit 1–180 s; defaults PC 60 s, phone 90 s. Sin audio; esperar `Saved:` / No audio; wait for `Saved:`.

**S6:** grabar aprobación/bloqueo, esperar fin, desbloquear sin grabación, grabar otra toma del texto recargado; unir tomas en una sola codificación final. / Record approval/lock, wait for completion, unlock off recording, then record reloaded text; join takes in one final encode. Si falla pull, recuperar `/sdcard/psyrec-S3.mp4` antes de repetir: no se sobrescribe. / If pull fails, recover that device file before retrying: it is not overwritten.

**Preparación / Preparation:** `node scripts/captures-manifest.mjs` mide MP4, segundos, dimensiones y SHA-256; conserva notas. `recordings` = inventario, `captures` = toma lista por escena. `--dry-run` no escribe; carpeta vacía válida. / Measures MP4 duration, dimensions and SHA-256; preserves notes. `recordings` = inventory, `captures` = ready take per scene. `--dry-run` does not write; empty folder is valid.

Teléfono original 1080×2340 ≠ 9:16: conservar original, ajustar con bandas sin recortar controles. Elegir inicio y nombres reales nuevos. / Raw phone 1080×2340 ≠ 9:16: preserve original, fit/pad without cropping controls. Choose start offset and actual new filenames:

```powershell
$m = Get-Content captures/manifest.json -Raw | ConvertFrom-Json
$seconds = $m.slots.S3.duration.ToString('0.########', [Globalization.CultureInfo]::InvariantCulture)
ffmpeg -hide_banner -n -ss 5 -i captures/phone-S3-RAW-TIMESTAMP.mp4 -t $seconds -an -vf 'scale=1080:1920:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1' -r 30 -c:v libx264 -crf 18 -pix_fmt yuv420p -movflags +faststart captures/phone-S3-READY-TIMESTAMP.mp4
node scripts/captures-manifest.mjs
```

PC: usar S4/S5/S6, nombres `desktop-S4-…` y **1920:1080** en scale/pad. Duración: audio + 0.6 s redondeado al fotograma; dejar suficiente material tras `-ss`. Recortar/ajustar/quitar audio en una sola pasada adicional desde el original; nunca recodificar derivados. / PC: use S4/S5/S6, `desktop-S4-…` names and **1920:1080** in scale/pad. Duration: audio + 0.6 s rounded to a frame; leave enough footage after `-ss`. Trim/fit/remove audio in one additional pass from raw; never re-encode derivatives. `-c copy` no garantiza cortes exactos / does not ensure frame-exact cuts.

Revisar cada fotograma, poner `recordings[].synthetic: true` y reescanear; aprobación ligada al hash. Editar `recordings[].notes`; fijar toma con `slots.S3.selectedFile` (o S4/S5/S6); sin selección gana el último nombre apto. / Review every frame, set `recordings[].synthetic: true`, rescan; attestation binds to hash. Edit notes; pin a take with selectedFile; otherwise latest eligible filename wins. Geometría/duración incorrecta, audio o falta de revisión mantienen marcador pendiente / Wrong geometry/duration, audio or missing review retain placeholders.

Capturas ≠ aceptación física/humana ni métricas / Captures do not replace physical/human acceptance or metrics. No ejecutar render en esta tarea / Do not run a render for this task.
