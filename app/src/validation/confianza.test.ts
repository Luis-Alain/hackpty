import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularConfianza, calcularUrgenciaRenovacion, DIAS_FRESCURA_MAX } from './confianza.js';
import type { Registro } from '../db/repository.js';

function registro(overrides: Partial<Registro> = {}): Registro {
  return {
    id: 1,
    cliente: 'Hospital X',
    ciudad: 'Lima',
    pais: 'Perú',
    modalidad: 'MR',
    cantidad: 1,
    marca: 'GE',
    modelo: 'Signa',
    antiguedad: 8,
    fuente: 'visita',
    estado: 'Confirmed',
    colaborador: null,
    timestamp: new Date().toISOString(),
    resumen: 'resumen',
    ...overrides,
  };
}

function haceNDias(n: number): string {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
}

test('calcularConfianza - registro completo, Confirmed y fresco tiene score alto', () => {
  const r = calcularConfianza(registro());
  assert.ok(r.score >= 0.9, `esperaba score alto, obtuve ${r.score}`);
  assert.equal(r.alertaFrescura, false);
});

test('calcularConfianza - registro Unknown e incompleto tiene score bajo, incluso recién creado', () => {
  const r = calcularConfianza(
    registro({ estado: 'Unknown', ciudad: null, cantidad: null, marca: null, modelo: null, antiguedad: null })
  );
  // La frescura (recién creado) aporta su componente completo, pero estado+completitud
  // bajos deben mantener el score claramente por debajo de un registro confirmado.
  assert.ok(r.score < 0.4, `esperaba score bajo, obtuve ${r.score}`);
});

test('calcularConfianza - Unknown+incompleto+viejo tiene score muy bajo', () => {
  const r = calcularConfianza(
    registro({
      estado: 'Unknown',
      ciudad: null,
      cantidad: null,
      marca: null,
      modelo: null,
      antiguedad: null,
      timestamp: haceNDias(DIAS_FRESCURA_MAX + 30),
    })
  );
  assert.ok(r.score < 0.15, `esperaba score muy bajo, obtuve ${r.score}`);
});

test('calcularConfianza - marca alertaFrescura cuando pasaron > 180 días', () => {
  const r = calcularConfianza(registro({ timestamp: haceNDias(DIAS_FRESCURA_MAX + 10) }));
  assert.equal(r.alertaFrescura, true);
  assert.equal(r.componentes.frescura, 0);
});

test('calcularConfianza - no marca alertaFrescura justo antes del límite', () => {
  const r = calcularConfianza(registro({ timestamp: haceNDias(DIAS_FRESCURA_MAX - 1) }));
  assert.equal(r.alertaFrescura, false);
});

test('calcularUrgenciaRenovacion - null si antiguedad <= 5 años', () => {
  assert.equal(calcularUrgenciaRenovacion(registro({ antiguedad: 5 })), null);
  assert.equal(calcularUrgenciaRenovacion(registro({ antiguedad: 2 })), null);
  assert.equal(calcularUrgenciaRenovacion(registro({ antiguedad: null })), null);
});

test('calcularUrgenciaRenovacion - equipo muy viejo y poco confiable es más urgente que uno viejo y confirmado', () => {
  const viejoConfirmado = calcularUrgenciaRenovacion(registro({ antiguedad: 16, estado: 'Confirmed' }));
  const viejoDesconocido = calcularUrgenciaRenovacion(
    registro({ antiguedad: 16, estado: 'Unknown', timestamp: haceNDias(200) })
  );
  assert.ok(viejoConfirmado && viejoDesconocido);
  assert.ok(viejoDesconocido!.urgencia > viejoConfirmado!.urgencia);
});

test('calcularUrgenciaRenovacion - urgencia crece con la antigüedad', () => {
  const menos = calcularUrgenciaRenovacion(registro({ antiguedad: 6 }));
  const mas = calcularUrgenciaRenovacion(registro({ antiguedad: 14 }));
  assert.ok(menos && mas);
  assert.ok(mas!.urgencia > menos!.urgencia);
});
