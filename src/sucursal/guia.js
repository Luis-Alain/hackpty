import { readFileSync } from 'node:fs';

export const normalizar = texto => String(texto).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const comunes = new Set('a al de del el la los las un una y o en por para que se si con como cual cuanto tengo hay me le es no lo esta'.split(' '));
const terminos = texto => normalizar(texto).match(/[a-z0-9]+(?:-[a-z0-9]+)*/g) ?? [];
export function cargarGuia(ruta = new URL('../../fixtures/sucursal/guia-bpl.md', import.meta.url)) {
  const texto = readFileSync(ruta, 'utf8');
  const secciones = [];
  for (const linea of texto.split(/\r?\n/)) {
    const encabezado = linea.match(/^#{1,6}\s+(.+)$/);
    if (encabezado) secciones.push({ titulo: encabezado[1], texto: linea });
    else if (secciones.length) secciones.at(-1).texto += '\n' + linea;
  }
  return { texto, secciones };
}
export function buscar(guia, consulta, n = 3) {
  const palabras = [...new Set(terminos(consulta).filter(t => !comunes.has(t)))];
  return guia.secciones.map((s, indice) => {
    const tokens = new Set(terminos(s.texto));
    const titulo = new Set(terminos(s.titulo));
    const puntaje = palabras.reduce((p, t) => p + (tokens.has(t) ? (t.includes('-') ? 30 : 1) + (titulo.has(t) ? 4 : 0) : 0), 0);
    return { ...s, puntaje, indice };
  }).filter(s => s.puntaje > 0).sort((a, b) => b.puntaje - a.puntaje || a.indice - b.indice).slice(0, Math.max(0, n));
}
