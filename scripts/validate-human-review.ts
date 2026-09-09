/** Validate linked, ordered observations from the diagnostic encrypted ledger.
 * DOM isTrusted is evidence of UI input, not independent proof of identity. */
export function validateHumanReview(receipt: any, extraction: any, draft: any) {
  const need = (ok: unknown, message: string) => { if (!ok) throw new Error(`Human review evidence: ${message}`); };
  need(receipt.physicalObservationFailed === false, 'explicit successful observer status required');
  need(extraction.outputText === receipt.source.extracted && draft.outputText === receipt.steps.find(s => s.operation === 'real-bounded-draft')?.evidence.text, 'raw extraction and draft outputs must survive encrypted recording');
  const events = receipt.physicalObservations;
  need(Array.isArray(events) && events.length > 0, 'ordered observations required');
  let previous = -Infinity;
  for (const event of events) {
    const time = Date.parse(event.at);
    need(Number.isFinite(time) && time >= previous && event.details && typeof event.event === 'string', 'invalid or unordered observation');
    previous = time;
  }
  const encounterId = draft.encounterId;
  const patientId = receipt.approval.patientId;
  const recordId = receipt.approval.recordId;
  need(typeof patientId === 'string' && patientId && typeof recordId === 'string' && recordId, 'canonical patient and approved record IDs required');
  let cursor = -1;
  const next = (label: string, predicate: (event: any) => boolean) => {
    const index = events.findIndex((event: any, i: number) => i > cursor && predicate(event));
    need(index >= 0, `missing ordered ${label}`);
    cursor = index;
    return events[index].details;
  };
  const input = (event: any, controls: string[]) => event.event === 'renderer-input' && event.details.trusted === true && controls.includes(event.details.control);
  const target = (d: any) => d.encounterId === encounterId && d.patientId === patientId;
  const operation = (event: any, method: string) => event.event === 'operation-completed' && event.details.method === method;
  next('trusted source review', e => input(e, ['reviewSource', 'confirmCorrection']) && target(e.details) && e.details.sourceText?.trim() === receipt.source.corrected);
  next('saved source review', e => operation(e, 'reviewSource') && e.details.result?.reviewed === true && e.details.result.revision === draft.sourceRevision && e.details.result.text === receipt.source.corrected);
  const generated = next('bounded draft completion', e => operation(e, 'generateDraft') && e.details.result?.sourceRevision === draft.sourceRevision && e.details.result.metrics?.runId === draft.metrics.runId).result;
  next('trusted exact approval', e => input(e, ['approve']) && target(e.details) && e.details.approvalChecked === true && e.details.draftText === receipt.approval.exactText && e.details.sourceText?.trim() === receipt.source.corrected);
  next('canonical approval', e => {
    const r = e.details.result;
    return operation(e, 'approve') && r?.id === recordId && target(r) && r.sourceRevision === draft.sourceRevision && r.sourceText === receipt.source.corrected && r.text === receipt.approval.exactText && r.draftId === generated.id;
  });
  const afterApproval = cursor;
  const historyVisible = (e: any) => e.event === 'renderer-view' && e.details.patientId === patientId && e.details.historyVisible === true && e.details.historyText?.includes(receipt.approval.exactText.trim()) && e.details.canonicalApprovedRecords?.some(r => r.id === recordId && r.text === receipt.approval.exactText);
  // Approval automatically opens history; no redundant close/open click needed.
  next('selected patient approved history', historyVisible);
  next('trusted other patient selection', e => input(e, ['patient']) && e.details.eventType === 'change');
  next('other patient history isolation', e => e.event === 'renderer-view' && e.details.patientId && e.details.patientId !== patientId && e.details.historyVisible === true && Array.isArray(e.details.canonicalApprovedRecords) && e.details.canonicalApprovedRecords.length === 0 && e.details.historyText === 'No approved notes for this patient.');
  // History browsing may happen before or after the lock/reload demonstration.
  cursor = afterApproval;
  next('trusted vault lock', e => input(e, ['lock']));
  next('locked renderer purge', e => e.event === 'lock-renderer-purge' && ['workspaceHidden', 'fields', 'content', 'images'].every(k => e.details[k] === true));
  next('encrypted record reload', e => operation(e, 'unlock') && e.details.result?.records?.some(r => r.id === recordId && target(r) && r.sourceRevision === draft.sourceRevision && r.text === receipt.approval.exactText));
  next('visible immutable approved record after reload', e => e.event === 'renderer-view' && e.details.patientId === patientId && e.details.approvedReadOnly === true && e.details.approvedText === receipt.approval.exactText);
}
