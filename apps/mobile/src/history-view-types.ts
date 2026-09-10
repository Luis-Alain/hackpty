import type { MobileHistoryRecord, MobileHistorySnapshot } from '../../../packages/contracts/mobile-history';

export type HistoryRecord = MobileHistoryRecord;
export type HistorySnapshot = MobileHistorySnapshot;

export type ModelState = {
  status: 'unavailable' | 'ready' | 'loading';
  label: string;
  reason?: string;
};

/** Source coordinates supplied by the controller; displayed text always comes from the snapshot. */
export type HistoryAnswer = {
  snapshotId: string;
  question: string;
  passages: {
    recordId: string;
    sourceRevision: number;
    field: 'text' | 'sourceText';
    start: number;
    end: number;
  }[];
  notice?: string;
};