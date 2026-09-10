import { test } from 'node:test';
import assert from 'node:assert';
import { MODALIDADES, MARCAS, ESTADOS, CONFIANZAS, sinAcentos, normalizarModalidad } from './referenceLists.js';

test('referenceLists - MODALIDADES includes MR', () => {
  assert(MODALIDADES.includes('MR'));
});

test('referenceLists - MARCAS includes NovaMed', () => {
  assert(MARCAS.includes('NovaMed'));
});

test('referenceLists - ESTADOS has exactly 4 values', () => {
  assert.strictEqual(ESTADOS.length, 4);
});

test('referenceLists - CONFIANZAS has exactly 3 values', () => {
  assert.strictEqual(CONFIANZAS.length, 3);
});

test('referenceLists - sinAcentos removes accents', () => {
  assert.strictEqual(sinAcentos('Bogotá'), sinAcentos('Bogota'));
});

test('referenceLists - sinAcentos handles null/undefined', () => {
  assert.strictEqual(sinAcentos(null), '');
  assert.strictEqual(sinAcentos(undefined), '');
});

test('referenceLists - normalizarModalidad recognizes exact match', () => {
  assert.strictEqual(normalizarModalidad('MR'), 'MR');
});

test('referenceLists - normalizarModalidad recognizes synonym (resonancia -> MR)', () => {
  assert.strictEqual(normalizarModalidad('resonancia'), 'MR');
});

test('referenceLists - normalizarModalidad returns null for unknown', () => {
  assert.strictEqual(normalizarModalidad('UnknownDevice'), null);
});
