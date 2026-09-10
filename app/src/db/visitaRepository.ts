import { getDb } from './sqlite.js';
import type { Visita } from '../types/record.js';

const db = getDb();

export function crearVisita(): number {
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO visitas (observacion_raw, extraccion_json, estado_visita, registro_id, created_at, updated_at)
    VALUES (NULL, NULL, 'en_progreso', NULL, ?, ?)
  `);
  const result = stmt.run(now, now);
  return result.lastInsertRowid as number;
}

export function obtenerVisita(id: number): Visita | undefined {
  const stmt = db.prepare('SELECT * FROM visitas WHERE id = ?');
  return stmt.get(id) as Visita | undefined;
}

export function actualizarObservacion(id: number, observacionRaw: string): boolean {
  const stmt = db.prepare(`
    UPDATE visitas SET observacion_raw = ?, updated_at = ? WHERE id = ?
  `);
  const result = stmt.run(observacionRaw, new Date().toISOString(), id);
  return (result.changes ?? 0) > 0;
}

export function guardarExtraccion(id: number, extraccionJson: string): boolean {
  const stmt = db.prepare(`
    UPDATE visitas SET extraccion_json = ?, updated_at = ? WHERE id = ?
  `);
  const result = stmt.run(extraccionJson, new Date().toISOString(), id);
  return (result.changes ?? 0) > 0;
}

export function completarVisita(id: number, registroId: number): boolean {
  const stmt = db.prepare(`
    UPDATE visitas SET estado_visita = 'completada', registro_id = ?, updated_at = ? WHERE id = ?
  `);
  const result = stmt.run(registroId, new Date().toISOString(), id);
  return (result.changes ?? 0) > 0;
}
