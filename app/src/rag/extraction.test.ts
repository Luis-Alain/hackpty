import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularEstadoGlobal, derivarResultado } from './extraction.js';
import type { CamposExtraidos, CampoEstado } from '../types/record.js';

function campos(overrides: Partial<CamposExtraidos> = {}): CamposExtraidos {
  const confirmado = (valor: string | number) => ({ valor, status: 'Confirmed' as CampoEstado });
  return {
    cliente: confirmado('Hospital Central Lima'),
    ciudad: confirmado('Lima'),
    pais: confirmado('Perú'),
    modalidad: confirmado('MR'),
    cantidad: confirmado(1),
    marca: confirmado('GE'),
    modelo: confirmado('Signa'),
    antiguedad: confirmado(15),
    ...overrides,
  } as CamposExtraidos;
}

test('calcularEstadoGlobal - todos los campos confirmados -> Confirmed', () => {
  assert.equal(calcularEstadoGlobal(campos()), 'Confirmed');
});

test('calcularEstadoGlobal - falta un campo crítico (pais) -> Unknown', () => {
  const c = campos({ pais: { valor: null, status: 'Unknown' } });
  assert.equal(calcularEstadoGlobal(c), 'Unknown');
});

test('calcularEstadoGlobal - falta un campo crítico (modalidad) -> Unknown', () => {
  const c = campos({ modalidad: { valor: null, status: 'Unknown' } });
  assert.equal(calcularEstadoGlobal(c), 'Unknown');
});

test('calcularEstadoGlobal - críticos ok, pocos desconocidos -> Reported', () => {
  const c = campos({
    cantidad: { valor: null, status: 'Unknown' },
    antiguedad: { valor: null, status: 'Unknown' },
  });
  assert.equal(calcularEstadoGlobal(c), 'Reported');
});

test('calcularEstadoGlobal - críticos ok, muchos desconocidos -> Estimated', () => {
  const c = campos({
    ciudad: { valor: null, status: 'Unknown' },
    cantidad: { valor: null, status: 'Unknown' },
    marca: { valor: null, status: 'Unknown' },
    modelo: { valor: null, status: 'Unknown' },
    antiguedad: { valor: null, status: 'Unknown' },
  });
  assert.equal(calcularEstadoGlobal(c), 'Estimated');
});

test('derivarResultado - completeness cuenta campos != Unknown sobre el total', () => {
  const c = campos({
    cantidad: { valor: null, status: 'Unknown' },
    antiguedad: { valor: null, status: 'Unknown' },
  });
  const r = derivarResultado(c);
  assert.equal(r.completeness, 0.75); // 6 de 8 campos conocidos
});

test('derivarResultado - completeness 1 cuando todo está confirmado', () => {
  const r = derivarResultado(campos());
  assert.equal(r.completeness, 1);
});

test('derivarResultado - conserva los campos tal cual se pasaron', () => {
  const c = campos();
  const r = derivarResultado(c);
  assert.equal(r.campos.cliente.valor, 'Hospital Central Lima');
  assert.equal(r.campos.marca.valor, 'GE');
});
