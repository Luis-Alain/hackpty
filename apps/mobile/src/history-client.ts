import type { MobileHistorySnapshot } from '../../../packages/contracts/mobile-history';
import type { Credentials } from './transfer';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function object(value: unknown, keys: string[]): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).sort().join(',') === [...keys].sort().join(',');
}
const id = (value: unknown): value is string => typeof value === 'string' && uuid.test(value);
const string = (value: unknown, maximum: number): value is string => typeof value === 'string' && value.length > 0 && value.length <= maximum;
const date = (value: unknown) => typeof value === 'string' && value.length <= 40 && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
const count = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0;
export function parseHistorySnapshot(raw: string, credentials: Pick<Credentials, 'deviceId' | 'encounterId'>): MobileHistorySnapshot | null {
  const invalid = () => { throw new Error('Downloaded history is invalid. Sync again from the paired PC.'); };
  if (typeof raw !== 'string' || raw.length > 1024 * 1024) return invalid();
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return invalid(); }
  if (value === null) return null;
  if (!object(value, ['version','snapshotId','syncedAt','binding','patient','records','coverage']) || value.version !== 1 || !id(value.snapshotId) || !date(value.syncedAt)) return invalid();
  if (!object(value.binding, ['deviceId','encounterId']) || value.binding.deviceId !== credentials.deviceId || value.binding.encounterId !== credentials.encounterId) return invalid();
  if (!object(value.patient, ['id','alias']) || !id(value.patient.id) || !string(value.patient.alias, 80)) return invalid();
  if (!Array.isArray(value.records) || value.records.length > 50) return invalid();
  const seen = new Set<string>();
  for (const record of value.records) {
    if (!object(record, ['id','patientId','encounterId','sourceRevision','approvedAt','text','sourceText'])
      || !id(record.id) || seen.has(record.id) || record.patientId !== value.patient.id || !id(record.encounterId)
      || !Number.isSafeInteger(record.sourceRevision) || Number(record.sourceRevision) < 1
      || !date(record.approvedAt) || !string(record.text, 30000) || !string(record.sourceText, 30000)) return invalid();
    seen.add(record.id);
  }
  if (!object(value.coverage, ['totalRecords','includedRecords','partial']) || !count(value.coverage.totalRecords)
    || value.coverage.includedRecords !== value.records.length || Number(value.coverage.totalRecords) < value.records.length
    || value.coverage.partial !== (Number(value.coverage.totalRecords) > value.records.length)) return invalid();
  return value as unknown as MobileHistorySnapshot;
}
