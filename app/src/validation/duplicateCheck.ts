// Adapta el modelo Fellegi-Sunter de duplicates.ts (que espera site/manufacturer/model/
// serial/age como rango) al shape plano de Registro usado en el resto de la app.
import { candidatos } from './duplicates.js';
import type { Registro } from '../db/repository.js';

interface DupInput {
  site: { name: string | null; country: string | null };
  modality: string | null;
  manufacturer: string | null;
  model: string | null;
  serial: string | null;
  quantity: number | null;
  age: { min: number | null; max: number };
}

function aDupInput(campos: {
  cliente: string | null;
  pais: string | null;
  modalidad: string | null;
  marca: string | null;
  modelo: string | null;
  cantidad: number | null;
  antiguedad: number | null;
}): DupInput {
  return {
    site: { name: campos.cliente, country: campos.pais },
    modality: campos.modalidad,
    manufacturer: campos.marca,
    model: campos.modelo,
    serial: null, // no se captura número de serie en el flujo actual
    quantity: campos.cantidad,
    age: { min: campos.antiguedad, max: campos.antiguedad ?? 0 },
  };
}

export interface CandidatoDuplicado {
  registro: Registro;
  p: number;
  veredicto: 'mismo' | 'revisar' | 'nuevo';
  detalle: Array<{ campo: string; acuerdo: boolean | null; bits: number }>;
}

export function buscarDuplicados(
  nuevo: {
    cliente: string | null;
    pais: string | null;
    modalidad: string | null;
    marca: string | null;
    modelo: string | null;
    cantidad: number | null;
    antiguedad: number | null;
  },
  existentes: Registro[]
): CandidatoDuplicado[] {
  const nuevoInput = aDupInput(nuevo);
  const existentesInput = existentes.map((r) => ({
    ref: r,
    input: aDupInput({
      cliente: r.cliente,
      pais: r.pais,
      modalidad: r.modalidad,
      marca: r.marca ?? null,
      modelo: r.modelo ?? null,
      cantidad: r.cantidad ?? null,
      antiguedad: r.antiguedad ?? null,
    }),
  }));

  const resultados = candidatos(
    nuevoInput,
    existentesInput.map((e) => e.input)
  );

  return resultados.map((r) => {
    const idx = existentesInput.findIndex((e) => e.input === r.existente);
    return {
      registro: existentesInput[idx].ref,
      p: r.p,
      veredicto: r.veredicto as 'mismo' | 'revisar' | 'nuevo',
      detalle: r.detalle,
    };
  });
}
