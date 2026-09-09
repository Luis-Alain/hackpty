import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizarModalidad, numerosEn } from './esquema.js';
import { validar, normalizarPais } from './extraer.js';
import { derivar, preguntas } from './reglas.js';
import { comparar, candidatos } from './duplicados.js';

test('modalidades y numerales en es/en/pt', () => {
  assert.equal(normalizarModalidad('resonadores'), 'MR');
  assert.equal(normalizarModalidad('ressonâncias'), 'MR');
  assert.equal(normalizarModalidad('CT scanners'), 'CT');
  assert.equal(normalizarModalidad('tomógrafos'), 'CT');
  assert.equal(normalizarModalidad('ecógrafos'), 'Ultrasound');
  assert.equal(normalizarModalidad('lavadora'), null);
  assert.deepEqual(numerosEn('dois tomógrafos e três ressonâncias').sort(), [2, 3]);
  assert.deepEqual(numerosEn('about six ultrasound units'), [6]);
  assert.deepEqual(numerosEn('unos ocho años'), [8]);
  assert.deepEqual(numerosEn('varios equipos'), []);
  assert.equal(normalizarPais('Brasil'), 'Brazil');
  assert.equal(normalizarPais('Panamá'), 'Panama');
});

test('validar: la guarda tumba lo que el reporte no dice (portugués incluido)', () => {
  const texto = 'Estou no Hospital DemoCare Horizon em São Paulo, Brasil. Eles têm três ressonâncias e dois tomógrafos, uma tem uns nove anos.';
  const crudo = { customer: { name: 'Hospital DemoCare Horizon', city: 'São Paulo', country: 'Brasil' }, equipment: [
    { modality_quote: 'ressonâncias', quantity_quote: 'três ressonâncias', manufacturer_quote: null, model_quote: 'null', age_quote: 'uns nove anos',
      modality: 'MR', quantity: 3, manufacturer: 'NovaMed', model: 'null', age_years_min: 9, age_years_max: 9, age_qualitative: null, notes: null },
    { modality_quote: 'tomógrafos', quantity_quote: 'Yes', manufacturer_quote: null, model_quote: null, age_quote: null,
      modality: 'CT', quantity: 5, manufacturer: null, model: null, age_years_min: null, age_years_max: null, age_qualitative: null, notes: null } ] };
  const { borrador: b, descartes } = validar(crudo, texto);
  assert.equal(b.customer.country, 'Brazil');
  assert.equal(b.equipment[0].quantity, 3);
  assert.equal(b.equipment[0].manufacturer, null, 'NovaMed no está en el reporte');
  assert.equal(b.equipment[0].age_years_min, 9);
  assert.equal(b.equipment[0].model, null, 'la cadena "null" es null');
  assert.equal(b.equipment[0].verificado.quantity, 'cita');
  assert.equal(b.equipment[1].quantity, 2, 'el 5 del modelo se descarta y el reporte dice dois');
  assert.equal(b.equipment[1].verificado.quantity, 'texto');
  assert.deepEqual(descartes.map(d => d.campo).sort(), ['manufacturer', 'quantity']);
  // cita inútil («Yes») pero número presente en el reporte → se acepta como verificado por texto
  const v2 = validar({ customer: { name: 'Hospital DemoCare Horizon', city: null, country: 'null' }, equipment: [
    { modality_quote: 'tomógrafos', quantity_quote: 'Yes', manufacturer_quote: null, model_quote: null, age_quote: null,
      modality: 'CT', quantity: 2, manufacturer: null, model: null, age_years_min: null, age_years_max: null, age_qualitative: null, notes: null } ] }, texto);
  assert.equal(v2.borrador.equipment[0].quantity, 2);
  assert.equal(v2.borrador.equipment[0].verificado.quantity, 'texto');
  assert.equal(v2.borrador.customer.country, 'Brazil', 'el país sale del reporte aunque el modelo no lo dé');
});

test('menciones: numeral + tipo en la misma cláusula, en tres idiomas', async () => {
  const { menciones } = await import('./menciones.js');
  const q = texto => Object.fromEntries(menciones(texto).map(m => [m.modality, m.quantity]));
  assert.deepEqual(q('Centro Medico DemoCare Valley has one MR and two CTs. I do not know the brands.'), { MR: 1, CT: 2 });
  assert.deepEqual(q('Hospital DemoCare Park has one MR, maybe ten years old, plus three CT scanners.'), { MR: 1, CT: 3 });
  assert.deepEqual(q('Clinica DemoCare Central has many ultrasound systems, maybe eight, all Aurelia Health.'), { Ultrasound: 8 });
  assert.deepEqual(q('Clinica DemoCare Andes has one very old CT and two MR systems from the same manufacturer.'), { CT: 1, MR: 2 });
  assert.deepEqual(q('Instituto DemoCare Lima has two old CTs and one recently installed MR.'), { CT: 2, MR: 1 });
  assert.deepEqual(q('At Hospital DemoCare Horizon I saw three MR systems. Two seem old and one looks much newer.'), { MR: 3 });
  assert.deepEqual(q('Estoy en Hospital DemoCare Pacific, en Panamá. Tienen dos resonadores y un tomógrafo. Uno de los resonadores parece de unos ocho años.'), { MR: 2, CT: 1 });
  assert.deepEqual(q('Estou no Hospital DemoCare Horizon em São Paulo. Eles têm três ressonâncias e dois tomógrafos.'), { MR: 3, CT: 2 });
  assert.deepEqual(q('Hospital DemoCare North has about six ultrasound units, mostly new.'), { Ultrasound: 6 });
  assert.deepEqual(q('Tienen varios ecógrafos.'), { Ultrasound: null });
  // el modelo omitió el CT: validar lo completa desde el reporte, marcado como verificado por texto
  const v = validar({ customer: { name: 'Centro Medico DemoCare Valley', city: null, country: null }, equipment: [
    { modality_quote: 'MR', quantity_quote: 'one MR', manufacturer_quote: null, model_quote: null, age_quote: null,
      modality: 'MR', quantity: 1, manufacturer: null, model: null, age_years_min: null, age_years_max: null, age_qualitative: null, notes: null } ] },
    'Centro Medico DemoCare Valley has one MR and two CTs. I do not know the brands.');
  assert.deepEqual(v.borrador.equipment.map(g => [g.modality, g.quantity, g.verificado.quantity]), [['MR', 1, 'cita'], ['CT', 2, 'texto']]);
});

test('derivar: estado y confianza según la hoja del reto', () => {
  const g = { modality: 'MR', quantity: 2, manufacturer: 'NovaMed', model: null, age_years_min: 7, age_years_max: 7,
    age_qualitative: null, quantity_quote: 'two MR systems', age_quote: 'around seven years' };
  const d = derivar(g, '2026-08-18');
  assert.equal(d.status, 'Reported');
  assert.deepEqual([d.install_year_min, d.install_year_max], [2019, 2019]);
  assert.equal(d.confidence.age, 'Low', '«around» = estimado');
  assert.equal(derivar(g, '2026-08-18', { directo: true }).status, 'Confirmed');
  assert.equal(derivar({ ...g, quantity_quote: 'maybe eight' }, '2026-08-18').status, 'Estimated');
  assert.equal(derivar({ ...g, quantity: null }, '2026-08-18').status, 'Unknown');
  assert.equal(derivar(g, '2026-08-18', { fuente: 'qr' }).confidence.manufacturer, 'High');
});

test('preguntas: una a la vez, en el orden del reto, sin repetir las contestadas', () => {
  const b = { customer: { name: 'Hospital DemoCare Pacific', city: null, country: 'Panama' }, equipment: [
    { modality: 'MR', quantity: 2, manufacturer: null, model: null, age_years_min: null, age_qualitative: null },
    { modality: 'CT', quantity: null, manufacturer: null, model: null, age_years_min: null, age_qualitative: null } ] };
  const q = preguntas(b);
  assert.equal(q[0].campo, 'customer.location');
  assert.equal(q[1].campo, 'quantity'); assert.equal(q[1].grupo, 1);
  assert.equal(q[2].campo, 'manufacturer'); assert.equal(q[2].opcional, true);
  const q2 = preguntas(b, { yaContestadas: new Set(['customer.location:null', 'quantity:1']) });
  assert.equal(q2[0].campo, 'manufacturer');
  assert.equal(preguntas({ customer: { name: 'x', city: 'y', country: 'z' }, equipment: [{ modality: 'MR', quantity: 1, manufacturer: 'NovaMed', model: 'NM-MR 700', age_years_min: 5 }] })[0].campo, 'directo');
});

test('duplicados: Fellegi-Sunter explica campo por campo y nunca fusiona sola', () => {
  const sitio = { name: 'Hospital DemoCare Pacific', country: 'Panama' };
  const nuevo = { site: sitio, modality: 'MR', manufacturer: 'NovaMed', model: null, quantity: 2, age: { min: 7, max: 7 } };
  const mismo = comparar(nuevo, { site: sitio, modality: 'MR', manufacturer: 'NovaMed', model: 'NM-MR 700', quantity: 2, age: { min: 6, max: 8 } });
  assert.equal(mismo.veredicto, 'mismo'); assert.ok(mismo.p > 0.9);
  assert.equal(mismo.detalle.find(d => d.campo === 'model').bits, 0, 'modelo ausente aporta 0');
  const otraMarca = comparar(nuevo, { site: sitio, modality: 'MR', manufacturer: 'Orion Imaging', model: null, quantity: 2, age: { min: 7, max: 7 } });
  assert.notEqual(otraMarca.veredicto, 'mismo');
  assert.ok(otraMarca.detalle.find(d => d.campo === 'manufacturer').bits < 0, 'la marca distinta resta');
  const otroSitio = comparar(nuevo, { site: { name: 'Hospital DemoCare North', country: 'Mexico' }, modality: 'MR', manufacturer: 'NovaMed', quantity: 2, age: { min: 7, max: 7 } });
  assert.equal(otroSitio.veredicto, 'nuevo');
  const inv = [{ id: 'a', site: sitio, modality: 'CT', manufacturer: 'Aurelia Health', quantity: 1, age: { min: 5, max: 5 } },
               { id: 'b', site: sitio, modality: 'MR', manufacturer: null, quantity: 2, age: { min: 7, max: 7 } }];
  assert.deepEqual(candidatos(nuevo, inv).map(c => c.existente.id), ['b']);
});

// Con PRUEBA_MODELO=1: los 10 prompts oficiales del xlsx + uno en portugués contra el modelo real.
const CASOS = [
  ['I am at Hospital DemoCare Pacific in Panama. They have two MR systems and one CT.', { MR: 2, CT: 1 }, { country: 'Panama' }],
  ['At Hospital DemoCare Horizon I saw three MR systems. Two seem old and one looks much newer.', { MR: 3 }, {}],
  ['Clinica DemoCare Light has two CT scanners, both Orion Imaging, around eleven years old.', { CT: 2 }, { manufacturer: 'Orion Imaging', age: 11 }],
  ['Centro Medico DemoCare Valley has one MR and two CTs. I do not know the brands.', { MR: 1, CT: 2 }, { manufacturer: null }],
  ['Hospital DemoCare North has about six ultrasound units, mostly new.', { Ultrasound: 6 }, {}],
  ['Clinica DemoCare Andes has one very old CT and two MR systems from the same manufacturer.', { CT: 1, MR: 2 }, {}],
  ['Hospital DemoCare Park has one MR, maybe ten years old, plus three CT scanners.', { MR: 1, CT: 3 }, { age: 10 }],
  ['Clinica DemoCare Central has many ultrasound systems, maybe eight, all Aurelia Health.', { Ultrasound: 8 }, { manufacturer: 'Aurelia Health' }],
  ['Instituto DemoCare Lima has two old CTs and one recently installed MR.', { CT: 2, MR: 1 }, {}],
  ['Hospital DemoCare Metro North has two MR systems. I know the brand is Aurelia Health but not the model.', { MR: 2 }, { manufacturer: 'Aurelia Health', model: null }],
  ['Estoy en Hospital DemoCare Pacific, en Panamá. Tienen dos resonadores y un tomógrafo. Uno de los resonadores parece de unos ocho años.', { MR: 2, CT: 1 }, { country: 'Panama' }],
  ['Estou no Hospital DemoCare Horizon em São Paulo. Eles têm três ressonâncias e dois tomógrafos.', { MR: 3, CT: 2 }, {}],
];
test('extraer: los 10 prompts oficiales + español + portugués con el modelo real', { skip: !process.env.PRUEBA_MODELO }, async () => {
  const { QWEN3_1_7B_INST_Q4 } = await import('@qvac/sdk');
  const { cargar, descargar } = await import('../core/runtime.js');
  const { extraer } = await import('./extraer.js');
  const modelo = await cargar({ modelSrc: QWEN3_1_7B_INST_Q4, etiqueta: 'Qwen3-1.7B Q4_0', hardware: 'laptop-rtx4060' });
  const fallos = [];
  for (const [texto, cantidades, extra] of CASOS) {
    const { borrador: b, ms } = await extraer(modelo, texto);
    const suma = {}; for (const g of b.equipment) suma[g.modality] = (suma[g.modality] ?? 0) + (g.quantity ?? 0);
    const problemas = [];
    for (const [m, n] of Object.entries(cantidades)) if (suma[m] !== n) problemas.push(`${m}=${suma[m] ?? 0}≠${n}`);
    if ('manufacturer' in extra && !b.equipment.some(g => g.manufacturer === extra.manufacturer) && !(extra.manufacturer === null && b.equipment.every(g => !g.manufacturer))) problemas.push(`marca ${b.equipment.map(g => g.manufacturer)}`);
    if ('age' in extra && !b.equipment.some(g => g.age_years_min === extra.age)) problemas.push(`edad ${b.equipment.map(g => g.age_years_min)}`);
    if ('country' in extra && b.customer.country !== extra.country) problemas.push(`país ${b.customer.country}`);
    if (!b.customer.name?.includes('DemoCare')) problemas.push(`hospital ${b.customer.name}`);
    console.log(`${problemas.length ? '✗' : '✓'} ${Math.round(ms)} ms · ${texto.slice(0, 60)}… ${problemas.join(' | ')}`);
    if (problemas.length) fallos.push(texto);
  }
  await descargar(modelo);
  assert.ok(fallos.length <= 2, `fallaron ${fallos.length}/${CASOS.length}: ${fallos.join(' || ')}`);
});
