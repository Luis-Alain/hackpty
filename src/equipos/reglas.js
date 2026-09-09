// Reglas deterministas (sin modelo): confianza, estado, año de instalación y la siguiente
// pregunta útil, en el orden de la hoja «Agent Question Logic» del reto.
import { MODALIDADES, MARCAS, ESTIMADO } from './esquema.js';

const num = v => Number.isInteger(v);
const estimado = s => !!s && ESTIMADO.test(s);

// derivar(grupo, fechaVisita, { directo, fuente }): campos derivados de una observación.
//   directo  el colaborador marcó «lo vi directamente» → Confirmed
//   fuente   'voz' | 'texto' | 'foto' | 'qr'  (un QR leído sin modelo sube marca y modelo a High)
export function derivar(g, fechaVisita, { directo = false, fuente = 'texto' } = {}) {
  const ev = { quantity: g.quantity_quote, age: g.age_quote };
  const conAños = num(g.age_years_min) && num(g.age_years_max);
  const confidence = {
    quantity: !num(g.quantity) ? 'Low' : directo ? 'High' : estimado(ev.quantity) ? 'Low' : 'Medium',
    manufacturer: !g.manufacturer ? 'Low' : fuente === 'qr' ? 'High' : 'Medium',
    model: !g.model ? 'Low' : fuente === 'qr' ? 'High' : 'Medium',
    age: !conAños ? 'Low' : estimado(ev.age) ? 'Low' : 'Medium',
  };
  const status = !MODALIDADES.includes(g.modality) || !num(g.quantity) ? 'Unknown'
    : directo ? 'Confirmed'
    : estimado(ev.quantity) || (!conAños && g.age_qualitative) ? 'Estimated' : 'Reported';
  const año = /^\d{4}/.test(fechaVisita ?? '') ? Number(fechaVisita.slice(0, 4)) : null;
  return { status, confidence,
    install_year_min: conAños && año ? año - g.age_years_max : null,
    install_year_max: conAños && año ? año - g.age_years_min : null };
}

// preguntas(borrador): lista ordenada; la app muestra la primera. «opcional» = se puede saltar con «no sé».
export function preguntas(b, { yaContestadas = new Set() } = {}) {
  const q = [], c = b.customer ?? {}, eq = b.equipment ?? [];
  const add = (campo, grupo, texto, opciones = [], opcional = false) => { const k = `${campo}:${grupo}`; if (!yaContestadas.has(k)) q.push({ campo, grupo, texto, opciones, opcional, clave: k }); };
  if (!c.name) add('customer.name', null, '¿En qué hospital o clínica estás?');
  if (!c.city || !c.country) add('customer.location', null, '¿En qué ciudad y país?');
  eq.forEach((g, i) => {
    const n = eq.length > 1 ? ` (equipo ${i + 1} de ${eq.length}, ${g.modality ?? 'sin tipo'})` : '';
    if (!MODALIDADES.includes(g.modality)) add('modality', i, `¿Qué tipo de equipo viste?${n}`, MODALIDADES);
    else if (!num(g.quantity)) add('quantity', i, `¿Cuántos ${g.modality} viste?${n}`);
  });
  eq.forEach((g, i) => {
    const n = eq.length > 1 ? ` (${g.modality}, equipo ${i + 1})` : '';
    if (!g.manufacturer) add('manufacturer', i, `¿Sabes la marca?${n}`, [...MARCAS, 'No sé'], true);
    if (!num(g.age_years_min) && !g.age_qualitative) add('age', i, `¿Qué edad aproximada tienen?${n}`, ['Nuevo (< 3 años)', '3 a 7 años', '7 a 10 años', 'Más de 10 años', 'No sé'], true);
    else if (!num(g.age_years_min) && g.age_qualitative) add('age', i, `Dijiste «${g.age_qualitative === 'new' ? 'nuevo' : 'viejo'}»: ¿cuántos años, más o menos?${n}`, ['< 3', '3 a 7', '7 a 10', '> 10', 'No sé'], true);
    if (g.manufacturer && !g.model) add('model', i, `¿Sabes el modelo del ${g.manufacturer}?${n}`, ['No sé'], true);
  });
  if (!q.length) add('directo', null, '¿Viste estos equipos tú directamente?', ['Sí, los vi', 'Me lo contaron'], false);
  return q;
}
