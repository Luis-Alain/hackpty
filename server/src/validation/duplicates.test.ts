import { test } from 'node:test';
import assert from 'node:assert';
import { comparar } from './duplicates.js';

test('duplicates - comparar returns object with required fields', () => {
  const nuevo = {
    site: { name: 'Hospital A', country: 'Brazil' },
    modality: 'MR',
    manufacturer: 'NovaMed',
    model: 'Model-X',
    serial: null,
    quantity: 2,
    age: { min: 5, max: 7 },
  };

  const existente = {
    site: { name: 'Hospital A', country: 'Brazil' },
    modality: 'MR',
    manufacturer: 'NovaMed',
    model: 'Model-X',
    serial: null,
    quantity: 2,
    age: { min: 5, max: 7 },
  };

  const result = comparar(nuevo, existente);

  assert(typeof result.p === 'number');
  assert(result.p >= 0 && result.p <= 1);
  assert(typeof result.bits === 'number');
  assert(Array.isArray(result.detalle));
  assert(['mismo', 'revisar', 'nuevo'].includes(result.veredicto));
});

test('duplicates - identical records get high p (same)', () => {
  const registro = {
    site: { name: 'Hospital A', country: 'Brazil' },
    modality: 'MR',
    manufacturer: 'NovaMed',
    model: 'Model-X',
    serial: null,
    quantity: 2,
    age: { min: 5, max: 7 },
  };

  const result = comparar(registro, registro);
  assert.strictEqual(result.veredicto, 'mismo');
  assert(result.p >= 0.9);
});

test('duplicates - different sites still gives high p if serial matches', () => {
  const nuevo = {
    site: { name: 'Hospital A', country: 'Brazil' },
    modality: 'CT',
    manufacturer: 'NovaMed',
    model: 'Model-X',
    serial: 'SN12345',
    quantity: 2,
    age: { min: 5, max: 7 },
  };

  const existente = {
    site: { name: 'Hospital B', country: 'Colombia' },
    modality: 'CT',
    manufacturer: 'NovaMed',
    model: 'Model-X',
    serial: 'SN12345',
    quantity: 2,
    age: { min: 5, max: 7 },
  };

  const result = comparar(nuevo, existente);
  assert(result.p >= 0.9);
});
