import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInThisContext } from 'node:vm';
import ts from 'typescript';
// Mobile emits CommonJS while root tests emit ESM; evaluate the exact pure source in a CommonJS wrapper.
const policyModule = { exports: {} as Record<string, any> };
const policySource = ts.transpileModule(readFileSync('apps/mobile/src/history-runtime-policy.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
runInThisContext(`(function(exports,require,module){${policySource}\n})`, { filename: 'history-runtime-policy.test-module.cjs' })
  (policyModule.exports, createRequire(import.meta.url), policyModule);
const { buildSources, parseSelectedIds, requireNativeMeasurements, isBundledAssetUri } = policyModule.exports;
type SnapshotView = { snapshotId: string; patient: { id: string }; records: { id: string; patientId: string; sourceRevision: number; text: string }[] };
const snapshot = (texts: string[]): SnapshotView => ({ snapshotId: 'synthetic-snapshot', patient: { id: 'synthetic-patient' },
  records: texts.map((text, index) => ({ id: `record-${index}`, patientId: 'synthetic-patient', sourceRevision: 1, text })) });

test('phone source selection rejects cross-patient, duplicate and invalid revisions', () => {
  const view = snapshot(['Sleep improved.', 'Sleep remains poor.']);
  view.records[1]!.patientId = 'other';
  assert.throws(() => buildSources(view, 'sleep'));
  view.records[1]!.patientId = view.patient.id;
  view.records[1]!.id = view.records[0]!.id;
  assert.throws(() => buildSources(view, 'sleep'));
  view.records[1]!.id = 'distinct'; view.records[1]!.sourceRevision = 0;
  assert.throws(() => buildSources(view, 'sleep'));
});
test('phone source positions preserve exact UTF16 text under CRLF and emoji', () => {
  const view = snapshot(['  Sleep 🌙 improved.\r\nSleep remains fragmented!\nOther topic.']);
  const selected = buildSources(view, 'sleep');
  assert.equal(selected.sources.length, 2);
  for (const source of selected.sources) assert.equal(view.records[0]!.text.slice(source.start, source.end), source.text);
  assert.equal(selected.sources[0]!.text, 'Sleep 🌙 improved.');
  assert.equal(selected.sources[1]!.text, 'Sleep remains fragmented!');
  assert.equal(selected.totalSentences, 3); assert.equal(selected.partial, true);
});
test('phone source limits skip whole oversized sentences and honestly report no lexical match', () => {
  const view = snapshot(['match ' + 'x'.repeat(900), 'Other material.']);
  const result = buildSources(view, 'match');
  assert.deepEqual(result.sources, []); assert.equal(result.totalSentences, 2); assert.equal(result.partial, true);
  assert.deepEqual(buildSources(snapshot([]), 'sleep').sources, []);
  assert.throws(() => buildSources(view, 'x'.repeat(1001)));
});
test('phone source bounds and ranking remain stable across records', () => {
  const view = snapshot(['match. match.', 'match.', ...Array.from({ length: 10 }, () => 'match ' + 'x'.repeat(780) + '.')]);
  const result = buildSources(view, 'match');
  assert.ok(result.sources.length <= 8); assert.ok(result.sources.reduce((sum, source) => sum + source.text.length, 0) <= 4000);
  assert.deepEqual(result.sources.slice(0, 3).map(s => s.recordId), ['record-0', 'record-0', 'record-1']);
  assert.equal(result.partial, true); assert.deepEqual(buildSources(view, 'match'), result);
});
test('phone model output may only select distinct canonical allowlisted source IDs', () => {
  const sources = buildSources(snapshot(['Sleep improved.', 'Sleep changed.']), 'sleep').sources;
  assert.deepEqual(parseSelectedIds('{"sourceIds":["S2","S1"]}', sources), [sources[1], sources[0]]);
  for (const raw of ['{"sourceIds":["foreign"]}', '{"sourceIds":["S1","S1"]}', '{"sourceIds":["S1"],"text":"invented"}', '[]', 'not json']) assert.throws(() => parseSelectedIds(raw, sources));
  assert.deepEqual(parseSelectedIds('{"sourceIds":[]}', sources), []);
});
test('phone evidence rejects missing, fabricated/nonfinite and nonnative token measurements', () => {
  const measured = { promptTokens: 40, emittedTokens: 9, timeToFirstToken: 250, tokensPerSecond: 10 };
  assert.deepEqual(requireNativeMeasurements(measured), measured);
  for (const value of [{ ...measured, timeToFirstToken: undefined }, { ...measured, tokensPerSecond: Infinity }, { ...measured, emittedTokens: 2.5 }, null]) assert.throws(() => requireNativeMeasurements(value));
});


test('phone bundled model accepts Android resource names but never external or dev-server URLs', () => {
  for (const uri of ['assets_models_qwen306bq40', 'file:///android_res/raw/model.gguf', 'file:///app/cache/model.gguf']) assert.equal(isBundledAssetUri(uri), true);
  for (const uri of ['https://example.com/model.gguf', 'http://192.168.1.2:8081/model.gguf', '../model.gguf', 'file://remote/model.gguf', '', null]) assert.equal(isBundledAssetUri(uri), false);
});
