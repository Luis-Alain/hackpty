# Synthetic end-to-end demonstration

Use only the [printable English note](../diagnostics/qvac-spike/fixtures/print-synthetic-note.html). Print it on paper for the physical Fold test. A desktop-import run is useful evidence of the PC workflow, but does not prove phone capture or transfer.

For the new primary Fold run, first follow the [prepared physical checklist](handoffs/2026-09-09-prepared-physical-run.md), including native restart/failure observations and the trusted paper-source confirmation. The workflow below is the narration outline; it does not override those evidence gates.

## Run order

1. Provision the pinned models while online, then start the Windows desktop. Create a separate synthetic vault with a passphrase of at least ten characters. Never record the passphrase.
2. Create patient alias `SYNTHETIC-A` and a new encounter. Pair the native Android app by scanning that encounter's desktop QR. The phone and PC need the same private LAN; approve the specific local receiver in Windows Firewall if Windows prompts.
3. Photograph the printed note on the Fold. Send it and wait for a durable receipt. Confirm the matching image appears in the selected desktop encounter. Retain the synthetic transfer ID and image digest for evidence, without publishing pairing secrets or tokens.
4. Run VisionPsy. Compare every line with the image, correct the source, and confirm source review. Preserve uncertainty and omissions; do not infer an obscured line. Generate a draft from that confirmed source.
5. Edit the draft if needed. Read the exact final text, select the approval confirmation and approve. Open the selected patient's approved history and verify the exact saved text.
6. Lock the vault. Verify image, note, patient alias, QR and metrics are removed from the locked renderer. Unlock and verify the approved text reloads unchanged. Select another synthetic patient and verify the first patient's note is absent.
7. Demonstrate one source correction: inspect the consequence preview, confirm the revision, and show that the former approval is superseded. Generate and explicitly approve a new draft. Historical approvals remain available only through the audit view.
8. Export performance records only after explicitly confirming this vault contains synthetic data exclusively. Record exact prompts, model and load configuration, native token counters, TTFT and throughput. Missing mandatory measurements fail acceptance; a cancelled run must remain a failed run.

## Spanish narration draft

**0:00–0:20:** «PsyRec convierte una foto de una nota impresa en un borrador que el profesional revisa. Este ejemplo es completamente sintético. La captura se hace en Android y la inferencia se ejecuta localmente en este PC Windows.»

**0:20–0:45:** «La vinculación usa el QR de este encuentro. La aplicación verifica el certificado del PC y envía la foto cifrada. El teléfono conserva la captura pendiente cifrada hasta recibir confirmación de guardado.»

**0:45–1:15:** «VisionPsy extrae el texto. Comparo la imagen con el resultado y corrijo cualquier omisión antes de confirmar la fuente. Una línea ilegible debe quedar como incierta. El modelo no decide por el profesional.»

**1:15–1:40:** «Genero un borrador limitado a la fuente revisada. Puedo editarlo, leer el texto exacto y aprobarlo expresamente. La aprobación queda vinculada a esta revisión de la fuente.»

**1:40–2:00:** «El registro se guarda cifrado. Bloqueo, desbloqueo y verifico que el texto aprobado se conserva. El historial muestra únicamente las notas del paciente seleccionado. Cada ejecución conserva los prompts y las mediciones reales; RAG y voz son integraciones futuras del equipo.»

Only narrate a capability as demonstrated when that step actually succeeds on camera. Capture the evidence panel after completion; do not substitute prior feasibility numbers for the recorded workflow. The video and physical-device acceptance remain pending until performed by Jeff with the Fold.
