/** Read-only history explicitly authorized during PC pairing. */
export interface MobileHistoryRecord {
  id: string; patientId: string; encounterId: string; sourceRevision: number;
  approvedAt: string; text: string; sourceText: string;
}
export interface MobileHistorySnapshot {
  version: 1; snapshotId: string; syncedAt: string;
  binding: { deviceId: string; encounterId: string };
  patient: { id: string; alias: string };
  records: MobileHistoryRecord[];
  coverage: { totalRecords: number; includedRecords: number; partial: boolean };
}
