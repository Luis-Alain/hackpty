/**
 * TypeScript adaptation of Vigía's src/core/rendimiento.js at
 * 21f7f40736c201f8d3c14a36ced4cdb426639122.
 * Keeps registrar/ms and the shared row vocabulary. The clinical application
 * supplies an in-memory sink, then encrypts records with the source/draft;
 * this module never writes clinical evidence to plaintext files or console.
 */
import { hostname } from 'node:os';
export const SCHEMA_VERSION = 1;
export const UPSTREAM_RUNTIME = {
  repository:'https://github.com/Luis-Alain/hackpty',
  commit:'21f7f40736c201f8d3c14a36ced4cdb426639122',
  paths:['src/core/runtime.js','src/core/rendimiento.js'],
} as const;
export type PerformanceRow = Record<string, unknown> & {stage:'load'|'completion'; status:'ok'|'error'};
export type EvidenceSink = (row: Record<string, unknown>) => void;
export function registrar(fila: PerformanceRow, runId: string, sink: EvidenceSink) {
  const row={schema_version:SCHEMA_VERSION,run_id:runId,timestamp_utc:new Date().toISOString(),host:hostname(),...fila};
  sink(row);return row;
}
export const ms = (started:number) => performance.now()-started;
