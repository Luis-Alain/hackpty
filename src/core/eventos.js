// Almacén de eventos: JSONL inmutable, solo se agrega. Cada evento lleva la huella del anterior,
// así que borrar o cambiar uno rompe la cadena y se nota.
// ponytail: un archivo por almacén, índice en memoria; si pasa de ~100k eventos, SQLite.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes } from 'node:crypto';
import { huella } from './sello.js';

export class Eventos {
  constructor(ruta) {
    this.ruta = ruta; this.lista = [];
    if (existsSync(ruta)) this.lista = readFileSync(ruta, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
  }
  get ultimo() { return this.lista.at(-1) ?? null; }

  // agregar(tipo, datos): devuelve el evento con id, ts, prev (huella del anterior) y su propia huella.
  agregar(tipo, datos, { origen = 'local' } = {}) {
    const cuerpo = { id: `${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`, n: this.lista.length + 1,
      ts: new Date().toISOString(), tipo, origen, prev: this.ultimo?.huella ?? null, datos };
    const ev = { ...cuerpo, huella: huella(cuerpo) };
    mkdirSync(dirname(this.ruta), { recursive: true });
    appendFileSync(this.ruta, JSON.stringify(ev) + '\n');
    this.lista.push(ev);
    return ev;
  }

  leer(filtro = () => true) { return this.lista.filter(filtro); }

  // verificarCadena(): recorre todo y devuelve el primer punto donde la cadena se rompe.
  verificarCadena() {
    let prev = null;
    for (const ev of this.lista) {
      const { huella: h, ...cuerpo } = ev;
      if (cuerpo.prev !== prev) return { valida: false, en: ev.n, motivo: 'prev no coincide' };
      if (huella(cuerpo) !== h) return { valida: false, en: ev.n, motivo: 'contenido alterado' };
      prev = h;
    }
    return { valida: true, eventos: this.lista.length };
  }
}
