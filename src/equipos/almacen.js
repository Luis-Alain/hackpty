// Almacén de la base instalada: las observaciones son eventos inmutables; el inventario
// se calcula a partir de ellas. Nunca se edita una observación: se agrega otra.
// Salidas del reto: Customer 360, agregación por geografía y modalidad, oportunidades de renovación.
import { Eventos } from '../core/eventos.js';
import { derivar } from './reglas.js';
import { comparar } from './duplicados.js';
import { sinAcentos } from './esquema.js';

// Regla de renovación por antigüedad (COCIR «Golden Rules», vía la ESR): menos de 5 años es
// estado del arte, de 6 a 10 hay que planificar el reemplazo, más de 10 debe reemplazarse.
// No es un número inventado: es el criterio que usa la industria de imagenología.
export const COCIR = { alDia: 5, planificar: 10 };
export const clasificarEdad = años => años == null ? 'sin dato' : años <= COCIR.alDia ? 'al día' : años <= COCIR.planificar ? 'planificar' : 'reemplazar';

export const claveCliente = c => `${sinAcentos(c?.name ?? '').trim()}|${sinAcentos(c?.country ?? '').trim()}`;

export class Base {
  constructor(ruta = 'datos/observaciones.jsonl') { this.ev = new Eventos(ruta); }

  // guardar(borrador, meta): una observación por grupo de equipo, con sus campos derivados.
  //   meta: { observador, fecha, fuente, directo, requestId, foto }
  guardar(borrador, meta = {}) {
    const fecha = meta.fecha ?? new Date().toISOString().slice(0, 10);
    return (borrador.equipment ?? []).map(g => this.ev.agregar('observacion', {
      customer: borrador.customer, ...g, ...derivar(g, fecha, meta),
      observador: meta.observador ?? null, fecha, fuente: meta.fuente ?? 'texto',
      directo: meta.directo === true, request_id: meta.requestId ?? null, foto: meta.foto ?? null,
    }));
  }

  observaciones() { return this.ev.leer(e => e.tipo === 'observacion').map(e => ({ ...e.datos, id: e.id, n: e.n, ts: e.ts })); }

  // inventario(): consolida observaciones en unidades de equipo por cliente y modalidad.
  // Dos personas distintas que reportan lo mismo → Confirmed (regla del reto: confirmación independiente).
  inventario() {
    const porSitio = new Map();
    for (const o of this.observaciones()) {
      const k = claveCliente(o.customer);
      if (!porSitio.has(k)) porSitio.set(k, { customer: o.customer, equipos: [] });
      const sitio = porSitio.get(k);
      const nuevo = { site: { name: o.customer?.name, country: o.customer?.country }, modality: o.modality,
        manufacturer: o.manufacturer, model: o.model, quantity: o.quantity, age: { min: o.age_years_min, max: o.age_years_max } };
      const existente = sitio.equipos.find(e => comparar(nuevo, e.clave).veredicto === 'mismo');
      if (existente) {
        existente.observaciones.push(o);
        // una observación posterior completa lo que faltaba, nunca pisa lo que ya había
        for (const k of ['manufacturer', 'model']) if (!existente[k] && o[k]) { existente[k] = o[k]; existente.clave[k] = o[k]; }
        if (existente.age_years_max == null && o.age_years_max != null) {
          existente.age_years_min = o.age_years_min; existente.age_years_max = o.age_years_max;
          existente.install_year_min = o.install_year_min; existente.install_year_max = o.install_year_max;
          existente.clave.age = { min: o.age_years_min, max: o.age_years_max };
        }
        const observadores = new Set(existente.observaciones.map(x => x.observador).filter(Boolean));
        existente.status = observadores.size > 1 ? 'Confirmed' : o.status;
        existente.observadores = [...observadores];
      } else sitio.equipos.push({ clave: nuevo, modality: o.modality, quantity: o.quantity,
        manufacturer: o.manufacturer, model: o.model, age_years_min: o.age_years_min, age_years_max: o.age_years_max,
        status: o.status, confidence: o.confidence, install_year_min: o.install_year_min, install_year_max: o.install_year_max,
        observadores: [o.observador].filter(Boolean), observaciones: [o] });
    }
    return [...porSitio.values()].map(s => ({ ...s, equipos: s.equipos.map(({ clave, ...e }) => ({ ...e,
      ultima_fecha: e.observaciones.map(o => o.fecha).sort().at(-1),
      edad: clasificarEdad(e.age_years_max) })) }));
  }

  // cliente360(nombre): la vista por cliente que pide el reto.
  cliente360(nombre) {
    const inv = this.inventario().find(s => sinAcentos(s.customer?.name ?? '') === sinAcentos(nombre));
    if (!inv) return null;
    const porModalidad = new Map();
    for (const e of inv.equipos) {
      const m = porModalidad.get(e.modality) ?? { modality: e.modality, unidades: 0, edades: [], estados: [], marcas: new Set() };
      m.unidades += e.quantity ?? 0; if (e.age_years_max != null) m.edades.push(e.age_years_max);
      m.estados.push(e.status); if (e.manufacturer) m.marcas.add(e.manufacturer);
      porModalidad.set(e.modality, m);
    }
    return { customer: inv.customer, equipos: inv.equipos,
      resumen: [...porModalidad.values()].map(m => ({ modality: m.modality, unidades: m.unidades,
        edad_aprox: m.edades.length ? Math.round(m.edades.reduce((a, b) => a + b, 0) / m.edades.length) : null,
        estado: m.estados.includes('Confirmed') ? 'Confirmed' : m.estados[0], marcas: [...m.marcas] })) };
  }

  // agregado(por): 'country' | 'city' | 'modality' — el tablero del reto.
  agregado(por = 'country') {
    const mapa = new Map();
    for (const s of this.inventario()) for (const e of s.equipos) {
      const k = por === 'modality' ? e.modality : (s.customer?.[por] ?? 'sin dato');
      const v = mapa.get(k) ?? { clave: k, unidades: 0, clientes: new Set(), reemplazar: 0 };
      v.unidades += e.quantity ?? 0; v.clientes.add(s.customer?.name);
      if (e.edad === 'reemplazar') v.reemplazar += e.quantity ?? 0;
      mapa.set(k, v);
    }
    return [...mapa.values()].map(v => ({ ...v, clientes: v.clientes.size })).sort((a, b) => b.unidades - a.unidades);
  }

  // renovaciones(): equipos que la regla COCIR marca para reemplazar o planificar, con su motivo.
  renovaciones() {
    const out = [];
    for (const s of this.inventario()) for (const e of s.equipos) if (e.edad === 'reemplazar' || e.edad === 'planificar')
      out.push({ customer: s.customer?.name, country: s.customer?.country, modality: e.modality, unidades: e.quantity,
        manufacturer: e.manufacturer, edad: e.age_years_max, clase: e.edad, estado: e.status,
        motivo: e.edad === 'reemplazar'
          ? `${e.age_years_max} años: supera los ${COCIR.planificar} de la regla COCIR (más de 10 años debe reemplazarse)`
          : `${e.age_years_max} años: entre ${COCIR.alDia} y ${COCIR.planificar}, se planifica el reemplazo` });
    return out.sort((a, b) => (b.edad ?? 0) - (a.edad ?? 0));
  }

  // incompletos(): lo que el reto llama «información incompleta» — sirve para dirigir la próxima visita.
  incompletos() {
    const out = [];
    for (const s of this.inventario()) for (const e of s.equipos) {
      const faltan = ['manufacturer', 'model'].filter(k => !e[k]);
      if (e.age_years_max == null) faltan.push('edad');
      if (faltan.length) out.push({ customer: s.customer?.name, modality: e.modality, faltan });
    }
    return out;
  }
}
