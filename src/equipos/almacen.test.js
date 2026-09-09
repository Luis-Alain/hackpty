import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { Base, clasificarEdad, COCIR } from './almacen.js';

const ruta = `/tmp/vigia-base-${process.pid}.jsonl`;
const nueva = () => { rmSync(ruta, { force: true }); return new Base(ruta); };
const grupo = (modality, quantity, extra = {}) => ({ modality, quantity, manufacturer: null, model: null,
  age_years_min: null, age_years_max: null, age_qualitative: null, quantity_quote: `${quantity}`, age_quote: null, ...extra });
const pacific = { name: 'Hospital DemoCare Pacific', city: 'Panama City', country: 'Panama' };

test('clasificarEdad sigue la regla COCIR', () => {
  assert.equal(clasificarEdad(3), 'al día');
  assert.equal(clasificarEdad(COCIR.alDia), 'al día');
  assert.equal(clasificarEdad(8), 'planificar');
  assert.equal(clasificarEdad(11), 'reemplazar');
  assert.equal(clasificarEdad(null), 'sin dato');
});

test('guardar e inventariar: una observación por grupo, el inventario consolida', () => {
  const b = nueva();
  b.guardar({ customer: pacific, equipment: [grupo('MR', 2, { age_years_min: 7, age_years_max: 7 }), grupo('CT', 1)] },
    { observador: 'Field User 01', fecha: '2026-08-18' });
  assert.equal(b.observaciones().length, 2);
  const inv = b.inventario();
  assert.equal(inv.length, 1);
  assert.deepEqual(inv[0].equipos.map(e => [e.modality, e.quantity, e.status]), [['MR', 2, 'Reported'], ['CT', 1, 'Reported']]);
  assert.equal(inv[0].equipos[0].install_year_min, 2019);
  assert.equal(inv[0].equipos[0].edad, 'planificar');
  rmSync(ruta, { force: true });
});

test('dos observadores distintos sobre el mismo equipo → Confirmed, sin duplicar unidades', () => {
  const b = nueva();
  b.guardar({ customer: pacific, equipment: [grupo('MR', 2, { manufacturer: 'NovaMed', age_years_min: 7, age_years_max: 7 })] }, { observador: 'Field User 01', fecha: '2026-08-18' });
  b.guardar({ customer: pacific, equipment: [grupo('MR', 2, { manufacturer: 'NovaMed', model: 'NM-MR 700', age_years_min: 6, age_years_max: 8 })] }, { observador: 'Sales User 02', fecha: '2026-08-20' });
  const eq = b.inventario()[0].equipos;
  assert.equal(eq.length, 1, 'no se cuenta dos veces el mismo equipo');
  assert.equal(eq[0].quantity, 2, 'las unidades no se suman');
  assert.equal(eq[0].status, 'Confirmed');
  assert.deepEqual(eq[0].observadores, ['Field User 01', 'Sales User 02']);
  assert.equal(eq[0].model, 'NM-MR 700', 'la segunda observación aporta el modelo que faltaba');
  // el mismo observador dos veces NO confirma
  const c = nueva();
  c.guardar({ customer: pacific, equipment: [grupo('MR', 2)] }, { observador: 'Field User 01' });
  c.guardar({ customer: pacific, equipment: [grupo('MR', 2)] }, { observador: 'Field User 01' });
  assert.notEqual(c.inventario()[0].equipos[0].status, 'Confirmed');
  rmSync(ruta, { force: true });
});

test('Customer 360, agregados, renovaciones e incompletos', () => {
  const b = nueva();
  const horizon = { name: 'Hospital DemoCare Horizon', city: 'Sao Paulo', country: 'Brazil' };
  b.guardar({ customer: pacific, equipment: [grupo('MR', 2, { manufacturer: 'NovaMed', age_years_min: 7, age_years_max: 7 }), grupo('CT', 1, { age_years_min: 3, age_years_max: 3 })] }, { observador: 'A', fecha: '2026-08-18' });
  b.guardar({ customer: horizon, equipment: [grupo('MR', 3, { manufacturer: 'BluePeak Medical', age_years_min: 12, age_years_max: 12 })] }, { observador: 'B', fecha: '2026-08-16' });

  const c360 = b.cliente360('Hospital DemoCare Pacific');
  assert.equal(c360.resumen.length, 2);
  assert.deepEqual(c360.resumen.find(r => r.modality === 'MR'), { modality: 'MR', unidades: 2, edad_aprox: 7, estado: 'Reported', marcas: ['NovaMed'] });
  assert.equal(b.cliente360('Hospital Inexistente'), null);

  const paises = b.agregado('country');
  assert.deepEqual(paises.map(p => [p.clave, p.unidades]), [['Panama', 3], ['Brazil', 3]]);
  assert.equal(paises.find(p => p.clave === 'Brazil').reemplazar, 3);
  assert.deepEqual(b.agregado('modality').map(m => [m.clave, m.unidades]), [['MR', 5], ['CT', 1]]);

  const ren = b.renovaciones();
  assert.equal(ren[0].edad, 12);
  assert.equal(ren[0].clase, 'reemplazar');
  assert.match(ren[0].motivo, /COCIR/);
  assert.equal(ren.length, 2, 'el de 7 años entra como «planificar», el de 3 no entra');

  const inc = b.incompletos();
  assert.ok(inc.some(i => i.modality === 'CT' && i.faltan.includes('manufacturer')));
  rmSync(ruta, { force: true });
});

test('las observaciones son inmutables y la cadena se puede verificar', () => {
  const b = nueva();
  b.guardar({ customer: pacific, equipment: [grupo('MR', 2)] }, { observador: 'A' });
  b.guardar({ customer: pacific, equipment: [grupo('CT', 1)] }, { observador: 'B' });
  assert.deepEqual(b.ev.verificarCadena(), { valida: true, eventos: 2 });
  const reabierta = new Base(ruta);
  assert.equal(reabierta.observaciones().length, 2);
  rmSync(ruta, { force: true });
});
