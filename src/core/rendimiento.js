// Registro de rendimiento: una línea JSON por carga de modelo y por inferencia.
// Es lo que pide el track 02 («carga del modelo, prompts, tokens, TTFT, throughput»)
// y lo que el jurado del general puede leer para ver dónde corrió cada llamada.
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { hostname } from 'node:os';
import { randomBytes } from 'node:crypto';

export const SCHEMA_VERSION = 1;
export const RUN_ID = `${new Date().toISOString().slice(0, 10)}-${randomBytes(3).toString('hex')}`;
export const RUTA = process.env.RENDIMIENTO ?? 'evidencia/rendimiento.jsonl';

// ponytail: appendFileSync; si el volumen sube, un stream con cola.
export function registrar(fila) {
  const linea = { schema_version: SCHEMA_VERSION, run_id: RUN_ID, timestamp_utc: new Date().toISOString(),
    host: hostname(), ...fila };
  mkdirSync(dirname(RUTA), { recursive: true });
  appendFileSync(RUTA, JSON.stringify(linea) + '\n');
  return linea;
}

export const ms = t0 => Math.round((performance.now() - t0) * 10) / 10;
