// Registro de rendimiento: una línea JSON por carga de modelo y por inferencia
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { hostname } from 'node:os';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const SCHEMA_VERSION = 1;
export const RUN_ID = `${new Date().toISOString().slice(0, 10)}-${randomBytes(3).toString('hex')}`;

// Ruta relativa desde app/src/ → ../../evidencia/rendimiento.jsonl
export const RUTA = resolve(__dirname, '../../evidencia/rendimiento.jsonl');

interface PerformanceRow {
  [key: string]: any;
}

export function registrar(fila: PerformanceRow): PerformanceRow {
  const linea: PerformanceRow = {
    schema_version: SCHEMA_VERSION,
    run_id: RUN_ID,
    timestamp_utc: new Date().toISOString(),
    host: hostname(),
    ...fila,
  };
  try {
    mkdirSync(dirname(RUTA), { recursive: true });
    appendFileSync(RUTA, JSON.stringify(linea) + '\n');
  } catch (e) {
    console.error('Performance log write failed:', e);
  }
  return linea;
}

export const ms = (t0: number): number => {
  return Math.round((performance.now() - t0) * 10) / 10;
};
