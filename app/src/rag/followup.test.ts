import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generarPreguntas, parsearRespuesta } from './followup.js';
import type { CamposExtraidos } from '../types/record.js';

function camposBase(overrides: Partial<CamposExtraidos> = {}): CamposExtraidos {
  const vacio = { valor: null, status: 'Unknown' as const };
  return {
    cliente: { valor: 'Hospital Central Lima', status: 'Confirmed' },
    ciudad: { valor: 'Lima', status: 'Confirmed' },
    pais: { valor: 'Perú', status: 'Confirmed' },
    modalidad: { valor: 'MR', status: 'Confirmed' },
    cantidad: vacio,
    marca: { valor: 'GE', status: 'Confirmed' },
    modelo: { valor: 'Signa', status: 'Confirmed' },
    antiguedad: vacio,
    ...overrides,
  } as CamposExtraidos;
}

test('generarPreguntas - omite campos ya Confirmed', () => {
  const campos = camposBase();
  const preguntas = generarPreguntas(campos);
  assert.ok(!preguntas.some((p) => p.campo === 'cliente'));
  assert.ok(!preguntas.some((p) => p.campo === 'marca'));
});

test('generarPreguntas - prioriza Unknown sobre Estimated/Reported', () => {
  const campos = camposBase({
    cantidad: { valor: null, status: 'Unknown' },
    antiguedad: { valor: 10, status: 'Estimated' },
  });
  const preguntas = generarPreguntas(campos, 1);
  assert.equal(preguntas[0].campo, 'cantidad');
});

test('generarPreguntas - contextualiza con marca+modelo confirmados', () => {
  const campos = camposBase();
  const preguntas = generarPreguntas(campos, 1);
  assert.match(preguntas[0].pregunta, /GE Signa/);
});

test('generarPreguntas - respeta el límite maxPreguntas', () => {
  const campos = camposBase({
    ciudad: { valor: null, status: 'Unknown' },
    cantidad: { valor: null, status: 'Unknown' },
    antiguedad: { valor: null, status: 'Unknown' },
  });
  const preguntas = generarPreguntas(campos, 2);
  assert.equal(preguntas.length, 2);
});

test('parsearRespuesta - "no sé" produce Unknown', () => {
  const r = parsearRespuesta('cantidad', 'no sé');
  assert.equal(r.status, 'Unknown');
  assert.equal(r.valor, null);
});

test('parsearRespuesta - respuesta vacía o null produce Unknown', () => {
  assert.equal(parsearRespuesta('marca', null).status, 'Unknown');
  assert.equal(parsearRespuesta('marca', '   ').status, 'Unknown');
});

test('parsearRespuesta - extrae número de dígito', () => {
  const r = parsearRespuesta('cantidad', 'hay 3 equipos');
  assert.equal(r.valor, 3);
  assert.equal(r.status, 'Confirmed');
});

test('parsearRespuesta - extrae número en palabras', () => {
  const r = parsearRespuesta('cantidad', 'hay uno');
  assert.equal(r.valor, 1);
  assert.equal(r.status, 'Confirmed');
});

test('parsearRespuesta - número con duda queda Reported', () => {
  const r = parsearRespuesta('antiguedad', 'creo que tiene 12 años');
  assert.equal(r.valor, 12);
  assert.equal(r.status, 'Reported');
});

test('parsearRespuesta - texto libre quita prefijos de relleno', () => {
  const r = parsearRespuesta('marca', 'sí, es Philips');
  assert.equal(r.valor, 'Philips');
  assert.equal(r.status, 'Confirmed');
});

test('parsearRespuesta - modalidad reconoce sinónimo', () => {
  const r = parsearRespuesta('modalidad', 'es un resonador');
  assert.equal(r.valor, 'MR');
  assert.equal(r.status, 'Confirmed');
});

test('parsearRespuesta - modalidad desconocida queda Reported', () => {
  const r = parsearRespuesta('modalidad', 'no estoy seguro del tipo exacto');
  assert.equal(r.status, 'Reported');
});
