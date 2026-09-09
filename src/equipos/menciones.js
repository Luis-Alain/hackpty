// Detector determinista de menciones «numeral + tipo de equipo» en la misma cláusula, en
// español, inglés y portugués. No reemplaza al modelo: completa lo que omite (el 1.7B tiende a
// devolver un solo tipo cuando el reporte trae dos) y cada dato que aporta queda marcado como
// verificado por texto, con la frase literal como cita.
import { SINONIMOS, numerosEn, sinAcentos, AÑOS } from './esquema.js';

const SEPARADORES = /[,.;:]|\b(and|y|e|plus|com|with|tienen|tiene|have|has|hay|tem|têm|there are|there is|saw|vi|counted|added|conte[i]?)\b/;
const APROX = /(maybe|about|around|roughly|approx\w*|unos|unas|como|cerca de|aprox\w*|uns|umas|talvez|quase|casi|some)/;

// cantidadAntes(ventana): último numeral de la cláusula anterior al tipo de equipo, sin contar
// los que van pegados a «años/years/anos» (esos son edades). Devuelve [n, distanciaEnPalabras].
function cantidadAntes(ventana) {
  const clausula = ventana.split(SEPARADORES).at(-1) ?? '';
  const sinEdad = clausula.replace(/\b[a-z0-9]+\s+(anos?|años?|years?|yrs?)\b/g, ' ');
  const palabras = sinEdad.trim().split(/\s+/).filter(Boolean);
  for (let i = palabras.length - 1; i >= 0; i--) { const n = numerosEn(palabras[i]); if (n.length) return [n[0], palabras.length - i]; }
  return [null, null];
}
// cantidadDespues(resto): «ultrasound systems, maybe eight, …» → 8 (solo si no va seguido de años)
function cantidadDespues(resto) {
  const m = resto.match(new RegExp(`^[a-z-]*(?:\\s+[a-z]+){0,2}\\s*,?\\s*${APROX.source}\\s+([a-z0-9]+)(\\s+[a-z]+)?`));
  if (!m) return null;
  if (AÑOS.test(m[3] ?? '')) return null;
  const n = numerosEn(m[2]); return n.length ? n[0] : null;
}

// menciones('one MR and two CTs') → [{ modality:'MR', quantity:1, frase:'one mr' }, { modality:'CT', quantity:2, frase:'two cts' }]
export function menciones(texto) {
  const t = sinAcentos(texto), porTipo = new Map();
  for (const [modality, res] of Object.entries(SINONIMOS)) for (const re of res) {
    for (const m of t.matchAll(new RegExp(re.source, 'g'))) {
      const antes = t.slice(Math.max(0, m.index - 60), m.index);
      let [quantity, dist] = cantidadAntes(antes);
      if (quantity == null) { quantity = cantidadDespues(t.slice(m.index + m[0].length, m.index + m[0].length + 40)); dist = quantity == null ? null : 9; }
      const finPalabra = t.slice(m.index).match(/^[a-z-]+/)?.[0] ?? m[0];
      const frase = quantity == null ? finPalabra : (antes.split(SEPARADORES).at(-1) ?? '').trim().split(/\s+/).slice(-(dist ?? 1)).join(' ') + ' ' + finPalabra;
      const previa = porTipo.get(modality);
      if (!previa || (quantity != null && (previa.quantity == null || dist < previa.dist))) porTipo.set(modality, { modality, quantity, frase: frase.trim(), dist });
    }
  }
  return [...porTipo.values()].map(({ dist, ...m }) => m);
}
