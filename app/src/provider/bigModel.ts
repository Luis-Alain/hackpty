import { loadModel, completion, unloadModel } from '@qvac/sdk';
import { registrar } from '../metrics/performanceLog.js';

export interface LoadedModel {
  modelId: string;
  etiqueta: string;
  hardware: string;
}

export async function cargar(opts: {
  modelSrc: any;
  etiqueta: string;
  hardware: string;
  device?: 'gpu' | 'cpu';
  ctx?: number;
}): Promise<LoadedModel> {
  const t0 = performance.now();
  try {
    const modelId = await loadModel({
      modelSrc: opts.modelSrc,
      modelConfig: {
        device: opts.device ?? 'gpu',
        gpu_layers: opts.device === 'cpu' ? 0 : 99,
        ctx_size: opts.ctx ?? 4096,
      },
    });
    registrar({
      stage: 'load',
      model: opts.etiqueta,
      status: 'ok',
      load_ms: Math.round(performance.now() - t0),
    });
    return { modelId, etiqueta: opts.etiqueta, hardware: opts.hardware };
  } catch (e) {
    registrar({
      stage: 'load',
      model: opts.etiqueta,
      status: 'error',
      error: String(e),
      load_ms: Math.round(performance.now() - t0),
    });
    throw e;
  }
}

export async function completar(modelo: LoadedModel, opts: {
  history: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  maxTokens?: number;
  temperature?: number;
  seed?: number;
  timeout?: number;
}): Promise<{ texto: string; ms: number }> {
  const t0 = performance.now();
  const timeout = opts.timeout ?? 60000;
  const timeoutHandle = setTimeout(() => {
    throw new Error('Completion timeout after ' + timeout + 'ms');
  }, timeout);

  try {
    const generationParams: any = {};
    if (opts.maxTokens) generationParams.predict = opts.maxTokens;
    if (opts.temperature != null) generationParams.temp = opts.temperature;
    if (opts.seed != null) generationParams.seed = opts.seed;

    let texto = '';
    const run = completion({
      modelId: modelo.modelId,
      stream: true,
      history: opts.history,
      ...(Object.keys(generationParams).length > 0 ? { generationParams } : {}),
    });

    for await (const ev of run.events) {
      if (ev.type === 'contentDelta' && ev.text) {
        texto += ev.text;
      }
    }

    const ms = Math.round(performance.now() - t0);
    registrar({
      stage: 'completion',
      model: modelo.etiqueta,
      status: 'ok',
      end_to_end_ms: ms,
    });

    return { texto, ms };
  } catch (e) {
    registrar({
      stage: 'completion',
      model: modelo.etiqueta,
      status: 'error',
      error: String(e),
      end_to_end_ms: Math.round(performance.now() - t0),
    });
    throw e;
  } finally {
    clearTimeout(timeoutHandle);
  }
}

export async function descargar(modelo: LoadedModel): Promise<void> {
  try {
    await unloadModel({ modelId: modelo.modelId });
  } catch (e) {
    console.error('unloadModel failed:', e);
  }
}

export const sinThink = (s: string): string =>
  s.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
