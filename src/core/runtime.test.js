// node --test src/  → siempre prueba el registro; con PRUEBA_MODELO=1 también carga
// Qwen3-1.7B de verdad y mide una completion (necesita el GGUF y la GPU libre).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';

process.env.RENDIMIENTO = `/tmp/rendimiento-prueba-${process.pid}.jsonl`;
const { registrar, RUTA, SCHEMA_VERSION } = await import('./rendimiento.js');

test('registrar escribe una línea JSON con esquema, run_id y hora', () => {
  const fila = registrar({ stage: 'load', status: 'ok', model: 'prueba', load_ms: 12.3 });
  const lineas = readFileSync(RUTA, 'utf8').trim().split('\n');
  const ultima = JSON.parse(lineas.at(-1));
  assert.equal(ultima.schema_version, SCHEMA_VERSION);
  assert.equal(ultima.model, 'prueba');
  assert.equal(ultima.run_id, fila.run_id);
  assert.ok(Date.parse(ultima.timestamp_utc) > 0);
  rmSync(RUTA, { force: true });
});

test('completar mide TTFT, tokens y throughput con el modelo real', { skip: !process.env.PRUEBA_MODELO }, async () => {
  const { QWEN3_1_7B_INST_Q4 } = await import('@qvac/sdk');
  const { cargar, completar, descargar, sinThink } = await import('./runtime.js');
  const modelo = await cargar({ modelSrc: QWEN3_1_7B_INST_Q4, etiqueta: 'Qwen3-1.7B Q4_0', hardware: 'laptop-rtx4060',
    fallbackSrc: process.env.GGUF_QWEN3_1_7B });
  const r = await completar(modelo, { history: [{ role: 'user', content: 'Responde solo con la palabra: listo /no_think' }], maxTokens: 16 });
  assert.match(sinThink(r.texto).toLowerCase(), /listo/);
  assert.ok(r.fila.end_to_end_ms > 0);
  assert.ok(r.fila.output_tokens > 0, 'el SDK debe reportar tokens generados');
  assert.ok(r.fila.throughput_tps > 0, 'el SDK debe reportar tokens/s');
  assert.equal(r.fila.execution_mode, 'local');
  await descargar(modelo);
  rmSync(RUTA, { force: true });
});
