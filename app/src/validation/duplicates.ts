// Fellegi-Sunter model: probabilistic duplicate detection
import { sinAcentos } from './referenceLists.js';

interface Peso { m: number; u: number; }
interface Weights { [key: string]: Peso; }

const PESOS: Weights = {
  site: { m: 0.95, u: 0.05 },
  modality: { m: 0.98, u: 0.25 },
  manufacturer: { m: 0.90, u: 0.17 },
  model: { m: 0.85, u: 0.05 },
  serial: { m: 0.99, u: 0.001 },
  quantity: { m: 0.80, u: 0.30 },
  age: { m: 0.85, u: 0.30 },
};

const PRIOR_BITS = Math.log2(1 / 10);

const bits = (campo: string, acuerdo: boolean): number => {
  const { m, u } = PESOS[campo];
  return acuerdo ? Math.log2(m / u) : Math.log2((1 - m) / (1 - u));
};

const igual = (a: string | null | undefined, b: string | null | undefined): boolean => {
  return sinAcentos(String(a)).trim() === sinAcentos(String(b)).trim();
};

const solapan = (a: { min: number | null; max: number }, b: { min: number | null; max: number }): boolean => {
  return a.min != null && b.min != null && a.min - 1 <= b.max && b.min - 1 <= a.max;
};

interface CompareResult {
  p: number;
  bits: number;
  detalle: Array<{ campo: string; acuerdo: boolean | null; bits: number }>;
  veredicto: 'mismo' | 'revisar' | 'nuevo';
}

export const comparar = (n: any, e: any): CompareResult => {
  const detalle: Array<{ campo: string; acuerdo: boolean | null; bits: number }> = [];
  const ver = (campo: string, acuerdo: boolean | null) => {
    if (acuerdo === null) {
      detalle.push({ campo, acuerdo: null, bits: 0 });
    } else {
      detalle.push({ campo, acuerdo, bits: Math.round(bits(campo, acuerdo) * 100) / 100 });
    }
  };

  ver('site', n.site?.name && e.site?.name ? igual(n.site.name, e.site.name) && igual(n.site.country ?? '', e.site.country ?? '') : null);
  ver('modality', n.modality && e.modality ? igual(n.modality, e.modality) : null);
  ver('manufacturer', n.manufacturer && e.manufacturer ? igual(n.manufacturer, e.manufacturer) : null);
  ver('model', n.model && e.model ? igual(n.model, e.model) : null);
  ver('serial', n.serial && e.serial ? igual(n.serial, e.serial) : null);
  ver('quantity', n.quantity != null && e.quantity != null ? n.quantity === e.quantity : null);
  ver('age', n.age?.min != null && e.age?.min != null ? solapan(n.age, e.age) : null);

  const total = PRIOR_BITS + detalle.reduce((s, d) => s + d.bits, 0);
  const p = 1 / (1 + 2 ** -total);

  return {
    p: Math.round(p * 1000) / 1000,
    bits: Math.round(total * 100) / 100,
    detalle,
    veredicto: p >= 0.9 ? 'mismo' : p >= 0.5 ? 'revisar' : 'nuevo',
  };
};

interface Candidato {
  existente: any;
  p: number;
  bits: number;
  detalle: Array<any>;
  veredicto: string;
}

export const candidatos = (nuevo: any, inventario: any[]): Candidato[] => {
  return inventario
    .map(e => ({ existente: e, ...comparar(nuevo, e) }))
    .filter(c => c.veredicto !== 'nuevo')
    .sort((a, b) => b.p - a.p);
};
