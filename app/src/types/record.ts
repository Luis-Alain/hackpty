// Tipos del pipeline de captura de visita (observación → extracción → guardado)

export type CampoEstado = 'Confirmed' | 'Reported' | 'Estimated' | 'Unknown';

export interface CampoExtraido<T = string | number> {
  valor: T | null;
  status: CampoEstado;
}

export interface CamposExtraidos {
  cliente: CampoExtraido<string>;
  ciudad: CampoExtraido<string>;
  pais: CampoExtraido<string>;
  modalidad: CampoExtraido<string>;
  cantidad: CampoExtraido<number>;
  marca: CampoExtraido<string>;
  modelo: CampoExtraido<string>;
  antiguedad: CampoExtraido<number>;
}

export interface ExtraccionResultado {
  campos: CamposExtraidos;
  completeness: number; // 0..1, proporción de campos con status != 'Unknown'
  estadoGlobal: CampoEstado;
}

export interface Visita {
  id: number;
  observacion_raw: string | null;
  extraccion_json: string | null;
  estado_visita: 'en_progreso' | 'completada';
  registro_id: number | null;
  created_at: string;
  updated_at: string;
}
