import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buscarDuplicados } from './duplicateCheck.js';
import type { Registro } from '../db/repository.js';

function registro(overrides: Partial<Registro> = {}): Registro {
  return {
    id: 1,
    cliente: 'Hospital Central Lima',
    ciudad: 'Lima',
    pais: 'Perú',
    modalidad: 'MR',
    cantidad: 1,
    marca: 'GE',
    modelo: 'Signa',
    antiguedad: 15,
    fuente: 'visita',
    estado: 'Confirmed',
    colaborador: null,
    timestamp: new Date().toISOString(),
    resumen: 'resumen',
    ...overrides,
  };
}

test('buscarDuplicados - detecta un registro casi idéntico como "mismo"', () => {
  const existentes = [registro()];
  const resultado = buscarDuplicados(
    { cliente: 'Hospital Central Lima', pais: 'Perú', modalidad: 'MR', marca: 'GE', modelo: 'Signa', cantidad: 1, antiguedad: 15 },
    existentes
  );
  assert.equal(resultado.length, 1);
  assert.equal(resultado[0].veredicto, 'mismo');
  assert.equal(resultado[0].registro.id, 1);
});

test('buscarDuplicados - registros completamente distintos no aparecen', () => {
  const existentes = [registro({ id: 2, cliente: 'Clínica Sur São Paulo', pais: 'Brasil', modalidad: 'CT', marca: 'Philips', modelo: 'Ingenia' })];
  const resultado = buscarDuplicados(
    { cliente: 'Hospital Central Lima', pais: 'Perú', modalidad: 'MR', marca: 'GE', modelo: 'Signa', cantidad: 1, antiguedad: 15 },
    existentes
  );
  assert.equal(resultado.length, 0);
});

test('buscarDuplicados - sin registros existentes devuelve vacío', () => {
  const resultado = buscarDuplicados(
    { cliente: 'Hospital X', pais: 'Perú', modalidad: 'MR', marca: null, modelo: null, cantidad: null, antiguedad: null },
    []
  );
  assert.deepEqual(resultado, []);
});
