import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import type { VaultState } from './types.js';
import type { MobileHistoryRecord, MobileHistorySnapshot } from '../contracts/mobile-history.js';

export const MAX_HISTORY_BYTES = 1024 * 1024;
export const MAX_HISTORY_RECORDS = 50;
export class MobileHistoryAccessError extends Error {}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const identifier = (value: unknown): value is string => typeof value === 'string' && uuid.test(value);
const text = (value: unknown, limit: number): value is string => typeof value === 'string' && value.length > 0 && value.length <= limit;

/** Patient and revisions come only from current authorized vault state. */
export function buildMobileHistorySnapshot(state: VaultState, input: { deviceId: unknown; token: unknown; encounterId: unknown }): MobileHistorySnapshot {
  if (!identifier(input.deviceId) || !identifier(input.encounterId) || !text(input.token, 256)) throw new MobileHistoryAccessError('Device is not authorized for history.');
  const device = state.devices.find(d => d.id === input.deviceId);
  const digest = createHash('sha256').update(input.token).digest('hex');
  if (!device || device.revoked || !/^[a-f0-9]{64}$/.test(device.tokenHash) || !timingSafeEqual(Buffer.from(device.tokenHash), Buffer.from(digest))) throw new MobileHistoryAccessError('Device is not authorized for history.');
  if (device.encounterId !== input.encounterId) throw new MobileHistoryAccessError('History authorization belongs to another encounter.');
  if (device.historyEnabled !== true) throw new MobileHistoryAccessError('Pair again with Allow patient history enabled on the PC.');
  const encounter = state.encounters.find(e => e.id === device.encounterId);
  const patient = state.patients.find(p => p.id === encounter?.patientId);
  if (!patient || !identifier(patient.id) || !text(patient.alias, 80)) throw new MobileHistoryAccessError('Authorized patient is unavailable.');
  const candidates = state.records.filter(r => r.patientId === patient.id && !r.supersededAt)
    .filter(r => state.encounters.some(e => e.id === r.encounterId && e.patientId === patient.id && e.source.revision === r.sourceRevision && e.source.reviewed))
    .sort((a, b) => b.approvedAt.localeCompare(a.approvedAt) || a.id.localeCompare(b.id));
  const snapshot: MobileHistorySnapshot = {
    version: 1, snapshotId: randomUUID(), syncedAt: new Date().toISOString(),
    binding: { deviceId: device.id, encounterId: device.encounterId },
    patient: { id: patient.id, alias: patient.alias }, records: [],
    coverage: { totalRecords: candidates.length, includedRecords: 0, partial: candidates.length > 0 },
  };
  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (snapshot.records.length >= MAX_HISTORY_RECORDS) break;
    if (!identifier(candidate.id) || !identifier(candidate.encounterId) || seen.has(candidate.id)
      || !Number.isInteger(candidate.sourceRevision) || candidate.sourceRevision < 1
      || !Number.isFinite(Date.parse(candidate.approvedAt)) || !text(candidate.text, 30000) || !text(candidate.sourceText, 30000)) continue;
    const record: MobileHistoryRecord = {
      id: candidate.id, patientId: patient.id, encounterId: candidate.encounterId,
      sourceRevision: candidate.sourceRevision, approvedAt: candidate.approvedAt, text: candidate.text, sourceText: candidate.sourceText,
    };
    snapshot.records.push(record);
    // Reserve envelope/counter bytes; never clip clinical records to fit.
    if (Buffer.byteLength(JSON.stringify(snapshot), 'utf8') > MAX_HISTORY_BYTES - 128) { snapshot.records.pop(); continue; }
    seen.add(record.id);
  }
  snapshot.coverage.includedRecords = snapshot.records.length;
  snapshot.coverage.partial = snapshot.records.length !== candidates.length;
  return snapshot;
}
