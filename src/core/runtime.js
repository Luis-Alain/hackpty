// Runtime común de Vigía sobre @qvac/sdk 0.18.2: carga un modelo (local o delegado a un
// par por llave pública), corre una completion y deja la fila de rendimiento.
// Todo módulo (equipos, sucursal, red) pasa por aquí: así la evidencia es la misma.
import { loadModel, completion, getLoadedModelInfo, unloadModel } from '@qvac/sdk';
import { registrar, ms } from './rendimiento.js';

const SDK_VERSION = '0.18.2'; // fijada en package.json; 0.19.0 quitó la delegación P2P

// cargar(): devuelve el «modelo» que usan las demás funciones.
//   modelSrc     constante del SDK (p. ej. QWEN3_1_7B_INST_Q4)
//   etiqueta     nombre honesto para el registro (p. ej. 'Qwen3-1.7B Q4_0')
//   hardware     dónde corre ('laptop-rtx4060', 'honor-x6s', …)
//   device       'gpu' | 'cpu'
//   fallbackSrc  GGUF local para no depender del registro P2P
//   proveedor    llave pública hex del par que ejecuta; sin ella, local
export async function cargar({ modelSrc, etiqueta, hardware, device = 'gpu', fallbackSrc, proveedor, ctx = 4096 }) {
  const t0 = performance.now();
  const base = { stage: 'load', sdk_version: SDK_VERSION, model: etiqueta, hardware_id: hardware,
    execution_mode: proveedor ? 'delegated' : 'local', provider: proveedor?.slice(0, 12) ?? null };
  try {
    const modelId = await loadModel({ modelSrc, ...(fallbackSrc ? { fallbackSrc } : {}),
      modelConfig: { device, gpu_layers: device === 'cpu' ? 0 : 99, ctx_size: ctx },
      ...(proveedor ? { delegate: { providerPublicKey: proveedor, timeout: 120_000, fallbackToLocal: true } } : {}) });
    const info = await getLoadedModelInfo({ modelId });
    const delegado = info?.isDelegated === true;
    registrar({ ...base, status: 'ok', load_ms: ms(t0),
      execution_mode: delegado ? 'delegated' : 'local',          // lo que pasó, no lo que se pidió
      fallback_a_local: !!proveedor && !delegado });
    return { modelId, etiqueta, hardware, device, delegado };
  } catch (e) {
    registrar({ ...base, status: 'error', error: String(e?.message ?? e), load_ms: ms(t0) });
    throw e;
  }
}

// completar(): una inferencia con medición completa.
//   history        [{role, content}] · responseFormat opcional (json_schema)
//   requestId      id visible en la app y en el log (V-XXXX); si falta, se genera
export async function completar(modelo, { history, responseFormat, requestId, maxTokens, temperature } = {}) {
  const id = requestId ?? `V-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const t0 = performance.now();
  let tPrimero = null, texto = '', stats = null;
  const run = completion({ modelId: modelo.modelId, stream: true, history, responseFormat,
    ...(maxTokens ? { maxTokens } : {}), ...(temperature != null ? { temperature } : {}) });
  const base = { stage: 'completion', request_id: id, sdk_version: SDK_VERSION, model: modelo.etiqueta,
    hardware_id: modelo.hardware, execution_mode: modelo.delegado ? 'delegated' : 'local',
    prompt_chars: history?.reduce((n, m) => n + (m.content?.length ?? 0), 0) ?? 0,
    response_format: responseFormat?.type ?? 'text' };
  try {
    for await (const ev of run.events) {
      if (ev.type === 'contentDelta' && ev.text) { if (tPrimero === null) tPrimero = performance.now(); texto += ev.text; }
      else if (ev.type === 'completionStats') stats = ev.stats;
    }
    const total = ms(t0);
    const fila = registrar({ ...base, status: 'ok',
      ttft_ms: tPrimero === null ? null : Math.round((tPrimero - t0) * 10) / 10,   // medido aquí: invocación → primer texto
      ttft_ms_sdk: stats?.timeToFirstToken ?? null,                // lo que reporta el motor
      input_tokens: stats?.promptTokens ?? null, output_tokens: stats?.generatedTokens ?? null,
      token_count_source: stats ? 'sdk' : null,
      throughput_tps: stats?.tokensPerSecond ?? null, backend_actual: stats?.backendDevice ?? null,
      end_to_end_ms: total });
    return { id, texto, stats, ms: total, fila };
  } catch (e) {
    registrar({ ...base, status: 'error', error: String(e?.message ?? e), end_to_end_ms: ms(t0) });
    throw e;
  }
}

export async function descargar(modelo) { try { await unloadModel({ modelId: modelo.modelId }); } catch {} }

// Quita el bloque <think>…</think> que Qwen3 antepone aunque se pida JSON.
export const sinThink = s => s.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
