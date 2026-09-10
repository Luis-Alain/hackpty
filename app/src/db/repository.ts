import { getDb } from './sqlite.js';

export interface Registro {
  id: number;
  cliente: string;
  ciudad?: string | null;
  pais: string;
  modalidad: string;
  cantidad?: number | null;
  marca?: string | null;
  modelo?: string | null;
  antiguedad?: number | null;
  fuente: string;
  estado: string;
  colaborador?: string | null;
  timestamp: string;
  resumen: string;
  embedding?: Buffer | null;
}

const db = getDb();

export function crearRegistro(data: Omit<Registro, 'id'>): number {
  const stmt = db.prepare(`
    INSERT INTO registros (
      cliente, ciudad, pais, modalidad, cantidad, marca, modelo,
      antiguedad, fuente, estado, colaborador, timestamp, resumen, embedding
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    data.cliente,
    data.ciudad ?? null,
    data.pais,
    data.modalidad,
    data.cantidad ?? null,
    data.marca ?? null,
    data.modelo ?? null,
    data.antiguedad ?? null,
    data.fuente,
    data.estado,
    data.colaborador ?? null,
    data.timestamp,
    data.resumen,
    data.embedding ?? null
  );
  return result.lastInsertRowid as number;
}

export function todosLosRegistros(limit = 100): Registro[] {
  const stmt = db.prepare(`SELECT * FROM registros ORDER BY timestamp DESC LIMIT ?`);
  return stmt.all(limit) as Registro[];
}

export function obtenerRegistro(id: number): Registro | undefined {
  const stmt = db.prepare('SELECT * FROM registros WHERE id = ?');
  return stmt.get(id) as Registro | undefined;
}

export function actualizarRegistro(id: number, data: Partial<Omit<Registro, 'id'>>): boolean {
  const fields: string[] = [];
  const values: any[] = [];
  for (const [k, v] of Object.entries(data)) {
    fields.push(`${k} = ?`);
    values.push(v ?? null);
  }
  values.push(id);
  const stmt = db.prepare(`UPDATE registros SET ${fields.join(', ')} WHERE id = ?`);
  const result = stmt.run(...values);
  return (result.changes ?? 0) > 0;
}

export function eliminarRegistro(id: number): boolean {
  const stmt = db.prepare('DELETE FROM registros WHERE id = ?');
  const result = stmt.run(id);
  return (result.changes ?? 0) > 0;
}

export function agregadoPorPais(): Array<{ pais: string; count: number }> {
  const stmt = db.prepare(`
    SELECT pais, COUNT(*) as count FROM registros GROUP BY pais ORDER BY count DESC
  `);
  return stmt.all() as Array<{ pais: string; count: number }>;
}

export function agregadoPorEstado(): Array<{ estado: string; count: number }> {
  const stmt = db.prepare(`
    SELECT estado, COUNT(*) as count FROM registros GROUP BY estado ORDER BY count DESC
  `);
  return stmt.all() as Array<{ estado: string; count: number }>;
}

export function agregadoPorModalidad(): Array<{ modalidad: string; count: number }> {
  const stmt = db.prepare(`
    SELECT modalidad, COUNT(*) as count FROM registros GROUP BY modalidad ORDER BY count DESC
  `);
  return stmt.all() as Array<{ modalidad: string; count: number }>;
}

export function registrosParaRenovacion(): Registro[] {
  const stmt = db.prepare(`
    SELECT * FROM registros WHERE antiguedad > 5 ORDER BY antiguedad DESC
  `);
  return stmt.all() as Registro[];
}

export function contarRegistros(): number {
  const stmt = db.prepare('SELECT COUNT(*) as cnt FROM registros');
  const result = stmt.get() as { cnt: number };
  return result.cnt;
}
