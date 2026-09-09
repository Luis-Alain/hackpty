/** Fragment navigation does not change document identity. Queries and other
 * paths remain untrusted; callers also require Electron's exact main frame. */
export function isTrustedUiUrl(candidateUrl: string, expectedUrl: string): boolean {
  try { const candidate = new URL(candidateUrl); candidate.hash = ''; return candidate.href === expectedUrl; }
  catch { return false; }
}

/** Validate privileged renderer requests before any dialog, vault or runtime work. */
export function validateRequest(method: unknown, args: unknown): asserts args is any[] {
  const text = (value: unknown, max = 30000) => typeof value === 'string' && value.length > 0 && value.length <= max;
  const id = (value: unknown) => text(value, 100);
  const flag = (value: unknown) => typeof value === 'boolean';
  const revision = (value: unknown) => Number.isInteger(value) && Number(value) >= 0;
  const signatures: Record<string, ((value: unknown) => boolean)[]> = {
    status: [], snapshot: [], lock: [], unlock: [value => text(value, 256), flag],
    addPatient: [value => text(value, 80)], addEncounter: [id], captureData: [id], import: [id], extract: [id],
    previewSourceChange: [id, text], reviewSource: [id, text, revision], generateDraft: [id],
    approve: [id, id, revision, text], approvedNotes: [id, flag], revokeDevice: [id],
    pair: [id, value => text(value, 64)], exportEvidence: [flag],
  };
  if (typeof method !== 'string' || !Object.hasOwn(signatures, method) || !Array.isArray(args)) throw new Error('Invalid request.');
  const shape = signatures[method];
  if (args.length !== shape.length || !shape.every((check, index) => check(args[index]))) throw new Error('Invalid request arguments.');
}
