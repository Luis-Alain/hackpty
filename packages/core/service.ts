import type { TransportIdentity, PhoneLifecycleEvidence } from '../contracts/index.js';
import { stablePhoneEvidence, validateStoredPhoneEvidence } from './phone-evidence.js';
import type { Vault } from './vault.js';
import type { VaultState, InferencePort, Encounter, Context } from './types.js';
import type { RuntimeFailure } from '../runtime/types.js';
import { randomUUID, createHash, timingSafeEqual, randomBytes } from 'node:crypto';

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const now = () => new Date().toISOString();
const digest = value => createHash('sha256').update(value).digest('hex');
function requiredText(value: unknown, name: string, max = 30000) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`${name} is required and must be at most ${max} characters.`);
  return value.trim();
}
export function imageType(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 12 || bytes.length > MAX_IMAGE_BYTES) throw new Error('Use a PNG or JPEG image no larger than 8 MB.');
  if (bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'image/png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  throw new Error('Only PNG and JPEG images are accepted.');
}
export class PsyRecService {
  vault: Vault;
  runtime: InferencePort;
  retriever: import('../contracts/index.js').ApprovedNotesRetriever | null;
  retrievalTimeoutMs: number;
  queue: Promise<unknown>;
  generation: number;
  pairing: { secret: string; encounterId: string; expiresAt: number } | null;
  constructor(vault: Vault, runtime: InferencePort, options: { retriever?: import('../contracts/index.js').ApprovedNotesRetriever; retrievalTimeoutMs?: number } = {}) {
    this.vault = vault; this.runtime = runtime;
    this.retriever = options.retriever ?? null;
    this.retrievalTimeoutMs = options.retrievalTimeoutMs ?? 3000;
    this.queue = Promise.resolve(); this.generation = 0;
    this.pairing = null;
  }
  state() { if (!this.vault.state) throw new Error('Unlock the vault first.'); return this.vault.state; }
  async change<T>(action: (state: VaultState) => T | Promise<T>): Promise<T> {
    const job = this.queue.then(async () => {
      const next = structuredClone(this.state());
      const result = await action(next);
      await this.vault.save(next); return result;
    });
    this.queue = job.catch(() => {}); return job;
  }
  async recordPhysicalObservation(event: string, details: Record<string, unknown>) {
    await this.change(s => { (s.physicalObservations ??= []).push({ at: now(), event, details }); });
  }
  getTransportIdentity() { return structuredClone(this.state().transportIdentity ?? null); }
  async saveTransportIdentity(identity: TransportIdentity) {
    if (!identity || typeof identity.key !== 'string' || typeof identity.cert !== 'string' || identity.key.length > 32000 || identity.cert.length > 32000) throw new Error('Invalid transport identity.');
    await this.change(s => { s.transportIdentity = { ...identity }; });
  }
  private async retainFailure(error: unknown, encounterId: string, sourceRevision: number, operation: 'extract' | 'draft', generation: number) {
    const evidence = (error as { evidence?: RuntimeFailure })?.evidence;
    if (evidence?.status === 'failed' && generation === this.generation && this.vault.state) {
      await this.change(s => { (s.runs ??= []).push({ status: 'failed', encounterId, sourceRevision, operation, evidence }); });
    }
  }
  async lock() { this.generation++; this.pairing = null; await this.queue; this.vault.lock(); }
  snapshot() {
    const s = this.state();
    return { patients: s.patients, encounters: s.encounters.map(e => ({ ...e, capture: e.capture ? { ...e.capture, data: undefined } : null })),
      records: s.records, devices: s.devices.map(({ tokenHash, ...device }) => device), ragEnabled: Boolean(this.retriever), voiceEnabled: false };
  }
  async addPatient(alias) {
    alias = requiredText(alias, 'Patient alias', 80);
    return this.change(s => { const p = { id: randomUUID(), alias, createdAt: now() }; s.patients.push(p); return p; });
  }
  async addEncounter(patientId) {
    return this.change(s => {
      if (!s.patients.some(p => p.id === patientId)) throw new Error('Patient not found.');
      const e: Encounter = { id: randomUUID(), patientId, createdAt: now(), capture: null, source: { revision: 0, text: '', reviewed: false }, draft: null, status: 'empty' };
      s.encounters.push(e); return e;
    });
  }
  encounter(state: VaultState, id: string) { const e = state.encounters.find(e => e.id === id); if (!e) throw new Error('Encounter not found.'); return e; }
  async importImage(encounterId, bytes) {
    const mime = imageType(bytes);
    return this.change(s => {
      const e = this.encounter(s, encounterId);
      if (e.capture || e.source.revision) throw new Error('This encounter already has a source. Create a new encounter for another capture.');
      e.capture = { id: randomUUID(), mime, data: bytes.toString('base64'), sha256: digest(bytes), receivedAt: now() };
      e.status = 'received'; return { captureId: e.capture.id };
    });
  }
  captureData(encounterId) {
    const e = this.encounter(this.state(), encounterId);
    if (!e.capture) return null;
    return `data:${e.capture.mime};base64,${e.capture.data}`;
  }
  async extract(encounterId) {
    const e = structuredClone(this.encounter(this.state(), encounterId));
    if (!e.capture) throw new Error('Import or capture an image first.');
    if (e.source.revision) throw new Error('Extraction already exists. Correct and review this source, or create another encounter.');
    const generation = this.generation, revision = e.source.revision;
    let result;
    try { result = await this.runtime.extractImage({ bytes: Buffer.from(e.capture.data, 'base64'), mime: e.capture.mime }); }
    catch (error) { await this.retainFailure(error, encounterId, revision, 'extract', generation); throw error; }
    if (generation !== this.generation) throw new Error('Vault session changed; extraction was not saved.');
    return this.change(s => {
      const current = this.encounter(s, encounterId);
      if (current.source.revision !== revision) throw new Error('The source changed while extraction ran. Result discarded.');
      this.supersede(s, current.id);
      requiredText(result.text, 'Extracted text');
      current.source = { revision: revision + 1, text: result.text, reviewed: false, metrics: result.metrics };
      (s.runs ??= []).push({ encounterId, sourceRevision: revision + 1, operation: 'extract', metrics: result.metrics, outputText: result.text });
      current.draft = null; current.status = 'source-review'; return current.source;
    });
  }
  previewSourceChange(encounterId, text) {
    text = requiredText(text, 'Source text');
    const s = this.state(), e = this.encounter(s, encounterId);
    return { sourceRevision: e.source.revision, changed: text.trim() !== e.source.text, nextRevision: e.source.revision + 1,
      approvalsToSupersede: s.records.filter(r => r.encounterId === encounterId && !r.supersededAt).map(r => ({ id: r.id, approvedAt: r.approvedAt })),
      discardDraft: Boolean(e.draft), historyImpact: 'Old approvals remain in the audit history and are excluded from future retrieval.' };
  }
  supersede(state: VaultState, encounterId: string) { for (const r of state.records) if (r.encounterId === encounterId && !r.supersededAt) r.supersededAt = now(); }
  async reviewSource(encounterId: string, text: string, expectedRevision?: number) {
    text = requiredText(text, 'Source text');
    return this.change(s => {
      const e = this.encounter(s, encounterId);
      if (expectedRevision !== undefined && e.source.revision !== expectedRevision) throw new Error('Source changed since preview. Review the correction again.');
      const changed = e.source.text !== text;
      if (changed) { this.supersede(s, encounterId); e.source.revision++; e.draft = null; }
      if (!e.source.revision) e.source.revision = 1;
      e.source.text = text; e.source.reviewed = true; e.status = !changed && e.status === 'approved' ? 'approved' : e.draft ? 'draft-review' : 'source-reviewed';
      return e.source;
    });
  }
  approvedNotes(patientId, includeSuperseded = false) {
    const s = this.state();
    if (!s.patients.some(p => p.id === patientId)) throw new Error('Patient not found.');
    return s.records.filter(r => r.patientId === patientId && (includeSuperseded || !r.supersededAt))
      .sort((a,b) => b.approvedAt.localeCompare(a.approvedAt));
  }
  async retrieveContext(patientId: string, query: string, currentEncounterId: string): Promise<Context> {
    if (!this.retriever) return { status: 'disabled', excerpts: [] };
    const controller = new AbortController(); let timer;
    try {
      const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('Retrieval timed out.')); }, this.retrievalTimeoutMs); });
      const hits = await Promise.race([this.retriever.retrieveApprovedNotes({ patientId, query, signal: controller.signal, limit: 4 }), timeout]);
      if (!Array.isArray(hits) || hits.length > 4) throw new Error('Invalid retrieval result.');
      const notes = this.approvedNotes(patientId).filter(r => r.encounterId !== currentEncounterId);
      const excerpts = hits.map(hit => {
        const record = notes.find(r => r.id === hit.recordId);
        if (hit.patientId !== patientId || !record || hit.sourceRevision !== record.sourceRevision || !Number.isInteger(hit.start) || !Number.isInteger(hit.end) || hit.start < 0 || hit.end <= hit.start || hit.end > record.text.length || hit.end - hit.start > 2000) throw new Error('Retrieval returned an unauthorized or stale source.');
        return { recordId: record.id, patientId, sourceRevision: record.sourceRevision, approvedAt: record.approvedAt, start: hit.start, end: hit.end, text: record.text.slice(hit.start, hit.end) };
      });
      return { status: 'available', excerpts };
    } catch { return { status: 'unavailable', excerpts: [] }; }
    finally { clearTimeout(timer); controller.abort(); }
  }
  async generateDraft(encounterId) {
    const e = structuredClone(this.encounter(this.state(), encounterId));
    if (!e.source.reviewed) throw new Error('Review and confirm the extracted source first.');
    const generation = this.generation;
    const context = await this.retrieveContext(e.patientId, e.source.text, e.id);
    let result;
    try { result = await this.runtime.draftFromSource({ text: e.source.text, sourceId: e.id + ':' + e.source.revision, context: context.excerpts }); }
    catch (error) { await this.retainFailure(error, encounterId, e.source.revision, 'draft', generation); throw error; }
    if (generation !== this.generation) throw new Error('Vault session changed; draft was not saved.');
    return this.change(s => {
      const current = this.encounter(s, encounterId);
      if (current.source.revision !== e.source.revision) throw new Error('Source changed while drafting. Result discarded.');
      requiredText(result.text, 'Draft text');
      const text = result.text;
      current.draft = { id: randomUUID(), sourceRevision: e.source.revision, text, createdAt: now(), metrics: result.metrics, context };
      (s.runs ??= []).push({ encounterId, sourceRevision: e.source.revision, operation: 'draft', metrics: result.metrics, outputText: result.text });
      current.status = 'draft-review'; return current.draft;
    });
  }
  async approve(encounterId, draftId, sourceRevision, text) {
    requiredText(text, 'Approved note'); // Preserve every character the clinician approved, including whitespace.
    if (!Number.isInteger(sourceRevision) || sourceRevision < 1) throw new Error('Invalid source revision.');
    return this.change(s => {
      const e = this.encounter(s, encounterId);
      if (!e.draft || e.draft.id !== draftId || e.source.revision !== sourceRevision || e.draft.sourceRevision !== sourceRevision || !e.source.reviewed) throw new Error('This draft is stale. Generate and review the current revision.');
      // Context may have changed after generation; revalidate every cited approved record.
      for (const c of e.draft.context.excerpts) {
        const record = s.records.find(r => r.id === c.recordId);
        if (!record || record.patientId !== e.patientId || record.supersededAt || record.sourceRevision !== c.sourceRevision) throw new Error('A historical source changed. Generate a new draft before approval.');
      }
      this.supersede(s, encounterId);
      const r = { id: randomUUID(), patientId: e.patientId, encounterId, sourceRevision, sourceText: e.source.text,
        text, draftId, modelDraftText: e.draft.text, clinicianEdited: text !== e.draft.text, approvedAt: now(), supersededAt: null, context: e.draft.context.excerpts,
        extractionMetrics: e.source.metrics, draftingMetrics: e.draft.metrics };
      s.records.push(r); e.status = 'approved'; e.draft = null; return r;
    });
  }
  startPairing(encounterId, endpoint, certificateFingerprint) {
    this.encounter(this.state(), encounterId);
    const secret = randomBytes(32).toString('base64url');
    this.pairing = { secret, encounterId, expiresAt: Date.now() + 120000 };
    return { version: 1, endpoint, certificateFingerprint, secret, encounterId, expiresAt: this.pairing.expiresAt };
  }
  async pair(secret, deviceName) {
    const p = this.pairing;
    if (!p || p.expiresAt < Date.now() || typeof secret !== 'string' || secret.length !== p.secret.length || !timingSafeEqual(Buffer.from(secret), Buffer.from(p.secret))) throw new Error('Pairing invitation expired or invalid.');
    this.pairing = null;
    return this.change(s => {
      const token = randomBytes(32).toString('base64url'), id = randomUUID();
      s.devices.push({ id, name: requiredText(deviceName, 'Device name', 80), tokenHash: digest(token), createdAt: now(), revoked: false, encounterId: p.encounterId });
      return { deviceId: id, token, encounterId: p.encounterId };
    });
  }
  async revokeDevice(deviceId) { return this.change(s => { const d = s.devices.find(d => d.id === deviceId); if (!d) throw new Error('Device not found.'); d.revoked = true; }); }
  async receivePhoneEvidence({ deviceId, token, transferId, encounterId, evidence }: { deviceId: string; token: string; transferId: string; encounterId: string; evidence: PhoneLifecycleEvidence }) {
    // Clone at the boundary so caller mutation cannot change a queued commit.
    const report = structuredClone(evidence);
    return this.change(s => {
      const device = s.devices.find(d => d.id === deviceId);
      if (!device || device.revoked || typeof token !== 'string' || !timingSafeEqual(Buffer.from(device.tokenHash), Buffer.from(digest(token)))) throw new Error('Device is not authorized.');
      if (device.encounterId !== encounterId) throw new Error('This device authorization belongs to another encounter.');
      const receipt = s.transfers.find(t => t.deviceId === deviceId && t.transferId === transferId && t.encounterId === encounterId);
      if (!receipt) throw new Error('Phone evidence requires a matching durable capture receipt.');
      validateStoredPhoneEvidence(report, receipt);
      const previous = (s.phoneEvidence ?? []).filter(r => r.evidence.binding.deviceId === deviceId && r.evidence.binding.transferId === transferId).at(-1);
      if (previous) {
        const { events: oldEvents, ...oldIdentity } = previous.evidence;
        const { events: nextEvents, ...nextIdentity } = report;
        if (stablePhoneEvidence(oldIdentity) !== stablePhoneEvidence(nextIdentity) || oldEvents.length > nextEvents.length || oldEvents.some((event, index) => stablePhoneEvidence(event) !== stablePhoneEvidence(nextEvents[index]))) throw new Error('Phone evidence cannot rewrite a recorded identity or lifecycle event.');
        if (oldEvents.length === nextEvents.length) return { stored: true, transferId, encounterId, eventCount: nextEvents.length, duplicate: true };
      }
      (s.phoneEvidence ??= []).push({ receivedAt: now(), evidence: report });
      return { stored: true, transferId, encounterId, eventCount: report.events.length, duplicate: false };
    });
  }
  async receiveCapture({ deviceId, token, transferId, encounterId, bytes }) {
    const mime = imageType(bytes);
    if (typeof transferId !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(transferId)) throw new Error('Invalid transfer id.');
    const hash = digest(bytes);
    return this.change(s => {
      const device = s.devices.find(d => d.id === deviceId);
      if (!device || device.revoked || typeof token !== 'string' || !timingSafeEqual(Buffer.from(device.tokenHash), Buffer.from(digest(token)))) throw new Error('Device is not authorized.');
      if (device.encounterId !== encounterId) throw new Error('This device authorization belongs to another encounter. Pair for this encounter.');
      const prior = s.transfers.find(t => t.deviceId === deviceId && t.transferId === transferId);
      if (prior) { if (prior.sha256 !== hash || prior.encounterId !== encounterId) throw new Error('Transfer id was reused with different content.'); return { ...prior, duplicate: true }; }
      const e = this.encounter(s, encounterId);
      if (e.capture || e.source.revision) throw new Error('Encounter already has a capture.');
      e.capture = { id: randomUUID(), mime, data: bytes.toString('base64'), sha256: hash, receivedAt: now() }; e.status = 'received';
      const receipt = { deviceId, transferId, encounterId, captureId: e.capture.id, sha256: hash, receivedAt: now() };
      s.transfers.push(receipt); return { ...receipt, duplicate: false };
    });
  }
}
