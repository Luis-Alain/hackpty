// Duplicados explicables con el modelo de Fellegi-Sunter (el de splink), a mano y determinista:
// cada campo aporta log2(m/u) bits si coincide y log2((1-m)/(1-u)) si difiere; un dato ausente
// aporta 0. La suma más el prior da la probabilidad de que dos observaciones hablen del mismo
// equipo. Nunca fusiona sola: devuelve la explicación campo por campo para que una persona decida.
import { sinAcentos } from './esquema.js';

// m = P(coincide | mismo equipo) · u = P(coincide | equipos distintos). Fijados a mano, declarados.
export const PESOS = {
  site:         { m: 0.95, u: 0.05 },   // mismo hospital (nombre + país)
  modality:     { m: 0.98, u: 0.25 },
  manufacturer: { m: 0.90, u: 0.17 },   // 6 marcas → u ≈ 1/6
  model:        { m: 0.85, u: 0.05 },
  serial:       { m: 0.99, u: 0.001 },
  quantity:     { m: 0.80, u: 0.30 },
  age:          { m: 0.85, u: 0.30 },   // rangos de edad que se solapan (±1 año)
};
export const PRIOR_BITS = Math.log2(1 / 10);   // a priori, 1 de cada 10 candidatos es el mismo equipo
const bits = (campo, acuerdo) => { const { m, u } = PESOS[campo]; return acuerdo ? Math.log2(m / u) : Math.log2((1 - m) / (1 - u)); };
const igual = (a, b) => sinAcentos(String(a)).trim() === sinAcentos(String(b)).trim();
const solapan = (a, b) => a.min != null && b.min != null && a.min - 1 <= b.max && b.min - 1 <= a.max;

// comparar(nuevo, existente): ambos con { site:{name,country}, modality, manufacturer, model, serial, quantity, age:{min,max} }
export function comparar(n, e) {
  const detalle = [], ver = (campo, acuerdo) => { if (acuerdo === null) detalle.push({ campo, acuerdo: null, bits: 0 }); else detalle.push({ campo, acuerdo, bits: Math.round(bits(campo, acuerdo) * 100) / 100 }); };
  ver('site', n.site?.name && e.site?.name ? igual(n.site.name, e.site.name) && igual(n.site.country ?? '', e.site.country ?? '') : null);
  ver('modality', n.modality && e.modality ? igual(n.modality, e.modality) : null);
  ver('manufacturer', n.manufacturer && e.manufacturer ? igual(n.manufacturer, e.manufacturer) : null);
  ver('model', n.model && e.model ? igual(n.model, e.model) : null);
  ver('serial', n.serial && e.serial ? igual(n.serial, e.serial) : null);
  ver('quantity', n.quantity != null && e.quantity != null ? n.quantity === e.quantity : null);
  ver('age', n.age?.min != null && e.age?.min != null ? solapan(n.age, e.age) : null);
  const total = PRIOR_BITS + detalle.reduce((s, d) => s + d.bits, 0);
  const p = 1 / (1 + 2 ** -total);
  return { p: Math.round(p * 1000) / 1000, bits: Math.round(total * 100) / 100, detalle,
    veredicto: p >= 0.9 ? 'mismo' : p >= 0.5 ? 'revisar' : 'nuevo' };
}

// candidatos(nuevo, inventario): los que merecen revisión, del más probable al menos.
export const candidatos = (nuevo, inventario) =>
  inventario.map(e => ({ existente: e, ...comparar(nuevo, e) })).filter(c => c.veredicto !== 'nuevo').sort((a, b) => b.p - a.p);
