// Extracción de una observación: el modelo propone bajo gramática, el código verifica.
// Nada entra al borrador si el reporte no lo dice. Cada dato queda marcado con cómo se verificó:
//   'cita'  → la cita del modelo está en el reporte y contiene el dato
//   'texto' → la cita no sirvió, pero el dato aparece literal en el reporte
//   null    → no se pudo verificar: se descarta
import { completar, sinThink } from '../core/runtime.js';
import { ESQUEMA, SISTEMA, MARCAS, CITAS, normalizarModalidad, numerosEn, sinAcentos, AÑOS } from './esquema.js';
import { menciones } from './menciones.js';

export const VACIO = { customer: { name: null, city: null, country: null }, equipment: [] };
const PAISES = { panama: 'Panama', brasil: 'Brazil', brazil: 'Brazil', mexico: 'Mexico', peru: 'Peru', chile: 'Chile',
  argentina: 'Argentina', colombia: 'Colombia', ecuador: 'Ecuador', 'costa rica': 'Costa Rica',
  'republica dominicana': 'Dominican Republic', 'dominican republic': 'Dominican Republic', guatemala: 'Guatemala',
  honduras: 'Honduras', nicaragua: 'Nicaragua', 'el salvador': 'El Salvador', uruguay: 'Uruguay', paraguay: 'Paraguay',
  bolivia: 'Bolivia', venezuela: 'Venezuela', 'estados unidos': 'United States', 'united states': 'United States', espana: 'Spain', spain: 'Spain' };
export const normalizarPais = p => p ? (PAISES[sinAcentos(p).trim()] ?? p) : null;
// paisEnTexto('…in Panama.') → 'Panama' (respaldo determinista cuando el modelo no lo saca)
export const paisEnTexto = texto => { const t = sinAcentos(texto); for (const [k, v] of Object.entries(PAISES)) if (new RegExp(`(^|[^a-z])${k}([^a-z]|$)`).test(t)) return v; return null; };
const limpio = v => (v == null || (typeof v === 'string' && /^(null|none|n\/a|yes|no|unknown|desconocid[oa]|)$/i.test(v.trim()))) ? null : v;
const enTexto = (frag, texto) => !!frag && sinAcentos(texto).includes(sinAcentos(frag).trim());

// validar(crudo, texto): aplica las guardas y devuelve { borrador, descartes }.
export function validar(crudo, texto) {
  const descartes = [], t = sinAcentos(texto);
  const descartar = (grupo, campo, valor, motivo) => descartes.push({ grupo, campo, valor, motivo });
  const c = { ...VACIO.customer }; for (const k of ['name', 'city', 'country']) c[k] = limpio(crudo.customer?.[k]);
  // el hospital debe estar en el reporte y no puede ser una marca
  if (c.name && (!enTexto(c.name, texto) || MARCAS.some(m => sinAcentos(m) === sinAcentos(c.name)))) { descartar(null, 'customer.name', c.name, 'no aparece en el reporte'); c.name = null; }
  if (c.city && !enTexto(c.city, texto)) { descartar(null, 'customer.city', c.city, 'no aparece en el reporte'); c.city = null; }
  if (c.country && !enTexto(c.country, texto) && normalizarPais(c.country) !== paisEnTexto(texto)) { descartar(null, 'customer.country', c.country, 'no aparece en el reporte'); c.country = null; }
  c.country = normalizarPais(c.country) ?? paisEnTexto(texto);

  const equipment = [];
  for (const [i, g0] of (crudo.equipment ?? []).entries()) {
    const g = { ...g0, verificado: {} };
    for (const k of [...CITAS, 'model', 'manufacturer', 'notes', 'age_qualitative']) g[k] = limpio(g[k]);
    g.modality = normalizarModalidad(g.modality) ?? normalizarModalidad(g.modality_quote);
    if (!g.modality) { descartar(i, 'modality', g0.modality, 'sin modalidad reconocible'); continue; }
    // cantidad: la cita debe estar en el reporte y contener ese número; si no, el número debe estar en el reporte
    if (g.quantity != null) {
      if (enTexto(g.quantity_quote, texto) && numerosEn(g.quantity_quote).includes(g.quantity)) g.verificado.quantity = 'cita';
      else if (numerosEn(texto).includes(g.quantity)) g.verificado.quantity = 'texto';
      else { descartar(i, 'quantity', g.quantity, 'el reporte no dice ese número'); g.quantity = null; }
    }
    if (g.manufacturer) {
      if (MARCAS.includes(g.manufacturer) && enTexto(g.manufacturer, texto)) g.verificado.manufacturer = 'texto';
      else { descartar(i, 'manufacturer', g.manufacturer, 'marca no está en el reporte'); g.manufacturer = null; }
    }
    if (g.model) { if (enTexto(g.model, texto)) g.verificado.model = 'texto'; else { descartar(i, 'model', g.model, 'modelo no está en el reporte'); g.model = null; } }
    // edad: hace falta la palabra años/years/anos y el número, en la cita o en el reporte
    if (g.age_years_min != null || g.age_years_max != null) {
      const nums = [g.age_years_min, g.age_years_max].filter(n => n != null);
      const cita = enTexto(g.age_quote, texto) && AÑOS.test(g.age_quote) && nums.some(n => numerosEn(g.age_quote).includes(n));
      const rep = AÑOS.test(texto) && nums.every(n => numerosEn(texto).includes(n));
      if (cita) g.verificado.age = 'cita'; else if (rep) g.verificado.age = 'texto';
      else { descartar(i, 'age', nums.join('-'), 'el reporte no da esos años'); g.age_years_min = g.age_years_max = null; }
      if (g.age_years_min == null) g.age_years_min = g.age_years_max; if (g.age_years_max == null) g.age_years_max = g.age_years_min;
      if (g.age_years_min > g.age_years_max) [g.age_years_min, g.age_years_max] = [g.age_years_max, g.age_years_min];
    }
    // edad citada pero no rellenada: «maybe ten years old» → 10
    if (g.age_years_min == null && g.age_quote && AÑOS.test(g.age_quote) && enTexto(g.age_quote, texto)) {
      const nums = numerosEn(g.age_quote.replace(/\b\d{4}\b/g, '')).filter(n => n < 60);
      if (nums.length) { g.age_years_min = Math.min(...nums); g.age_years_max = Math.max(...nums); g.verificado.age = 'texto'; }
    }
    if (g.age_qualitative && !/(new|nuev|nov[oa]|recen|old|viej|antig|velh)/.test(t)) { descartar(i, 'age_qualitative', g.age_qualitative, 'sin palabra que lo sustente'); g.age_qualitative = null; }
    equipment.push(g);
  }
  // lo que el modelo omitió y el reporte sí dice: «one MR and two CTs» → el CT que faltaba
  for (const m of menciones(texto)) {
    const g = equipment.find(x => x.modality === m.modality);
    if (!g && m.quantity != null) equipment.push({ modality_quote: m.frase, quantity_quote: m.frase, manufacturer_quote: null, model_quote: null, age_quote: null,
      modality: m.modality, quantity: m.quantity, manufacturer: null, model: null, age_years_min: null, age_years_max: null, age_qualitative: null, notes: null,
      verificado: { quantity: 'texto', origen: 'menciones' } });
    else if (g && g.quantity == null && m.quantity != null) { g.quantity = m.quantity; g.quantity_quote = m.frase; g.verificado.quantity = 'texto'; }
  }
  return { borrador: { customer: c, equipment }, descartes };
}

// extraer(modelo, texto): una llamada al modelo + validación. Devuelve también el crudo para auditar.
export async function extraer(modelo, texto, { requestId } = {}) {
  if (!texto?.trim()) return { borrador: VACIO, descartes: [], crudo: null, ms: 0, sinModelo: true };
  const r = await completar(modelo, { requestId,
    history: [{ role: 'system', content: SISTEMA }, { role: 'user', content: `Reporte:\n${texto.trim()}` }],
    responseFormat: { type: 'json_schema', json_schema: { name: 'observacion', schema: ESQUEMA, strict: true } } });
  let crudo;
  try { crudo = JSON.parse(sinThink(r.texto)); } catch { crudo = VACIO; }
  return { ...validar(crudo, texto), crudo, ms: r.ms, id: r.id, fila: r.fila };
}
