import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync, readFileSync, writeFileSync } from 'node:fs';
import { llaveNodo, sellar, verificar, canonico } from './sello.js';
import { Eventos } from './eventos.js';

const tmp = `/tmp/vigia-prueba-${process.pid}`;

test('canónico: el orden de las llaves no cambia la huella', () => {
  assert.equal(canonico({ b: 1, a: [{ d: 2, c: 3 }] }), canonico({ a: [{ c: 3, d: 2 }], b: 1 }));
});

test('sellar y verificar; tocar un campo invalida; otra llave no verifica', () => {
  const llave = llaveNodo(`${tmp}-llave.pem`);
  const acta = { visita: 'V-1', equipos: [{ modalidad: 'MR', cantidad: 2 }] };
  const s = sellar(acta, llave, { firmante: 'gilberto' });
  assert.equal(verificar(s).valido, true);
  assert.equal(verificar({ ...s, equipos: [{ modalidad: 'MR', cantidad: 3 }] }).valido, false);
  assert.equal(verificar({ ...s, sello: { ...s.sello, publica: llaveNodo(`${tmp}-otra.pem`).publica } }).valido, false);
  assert.equal(verificar({ visita: 'V-1' }).motivo, 'sin sello');
  rmSync(`${tmp}-llave.pem`, { force: true }); rmSync(`${tmp}-otra.pem`, { force: true });
});

test('eventos: cadena válida, se reabre del disco, y una alteración se detecta', () => {
  const ruta = `${tmp}-eventos.jsonl`;
  const e = new Eventos(ruta);
  e.agregar('observacion', { hospital: 'DemoCare Pacific', mr: 2 });
  e.agregar('observacion', { hospital: 'DemoCare Pacific', ct: 1 });
  assert.deepEqual(e.verificarCadena(), { valida: true, eventos: 2 });
  assert.equal(e.lista[1].prev, e.lista[0].huella);
  const reabierto = new Eventos(ruta);
  assert.equal(reabierto.leer(ev => ev.tipo === 'observacion').length, 2);
  // alterar el primer evento en disco
  const lineas = readFileSync(ruta, 'utf8').trim().split('\n');
  writeFileSync(ruta, lineas.map((l, i) => i === 0 ? l.replace('"mr":2', '"mr":9') : l).join('\n') + '\n');
  assert.equal(new Eventos(ruta).verificarCadena().valida, false);
  rmSync(ruta, { force: true });
});
