import { loadModel, completion, unloadModel, transcribe, ocr, ModelType } from '@qvac/sdk';
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
  // Fuerza el idioma de transcripción (language) en vez de dejar que Whisper
  // auto-detecte — el auto-detect puede fallar en clips cortos o con ruido,
  // incluso usando un modelo etiquetado para ese idioma.
  idioma?: string;
  // Modelo VAD (ej. VAD_SILERO_5_1_2) para recortar silencio antes de
  // transcribir. Sin esto, Whisper procesa el clip completo en ventanas de
  // 30s rellenadas con silencio, y es conocido que alucina frases repetidas
  // (típicamente frases de cierre de video de YouTube, por los datos de
  // entrenamiento) cuando el silencio domina el clip.
  vadModelSrc?: any;
  // 'llm' (default): completion, usa modelConfig snake_case (gpu_layers, ctx_size).
  // 'embedding': modelConfig con claves distintas (camelCase), sin ctx_size.
  // 'vision': modelType explícito, sin modelConfig (defaults del SDK).
  // 'stt': modelType explícito + language/vadModelSrc si se pasan.
  tipo?: 'llm' | 'embedding' | 'stt' | 'vision';
}): Promise<LoadedModel> {
  const t0 = performance.now();
  try {
    let modelConfig: Record<string, unknown> | undefined;
    let modelType: string | undefined;

    if (opts.tipo === 'embedding') {
      modelConfig = { device: opts.device ?? 'gpu', gpuLayers: opts.device === 'cpu' ? 0 : 99 };
    } else if (opts.tipo === 'stt') {
      modelType = ModelType.whispercppTranscription;
      // modelConfig de whispercpp-transcription es plano (language/vadModelSrc
      // van directo, no anidados bajo whisperConfig como en bci-whispercpp).
      const sttConfig: Record<string, unknown> = {};
      if (opts.idioma) {
        sttConfig.language = opts.idioma;
        sttConfig.detect_language = false;
      }
      if (opts.vadModelSrc) {
        sttConfig.vadModelSrc = opts.vadModelSrc;
        sttConfig.vad_params = {
          threshold: 0.5,
          min_speech_duration_ms: 250,
          min_silence_duration_ms: 300,
          speech_pad_ms: 200,
        };
      }
      if (Object.keys(sttConfig).length > 0) modelConfig = sttConfig;
    } else if (opts.tipo === 'vision') {
      modelType = ModelType.ggmlOcr;
    } else {
      modelConfig = {
        device: opts.device ?? 'gpu',
        gpu_layers: opts.device === 'cpu' ? 0 : 99,
        ctx_size: opts.ctx ?? 4096,
      };
    }

    const modelId = await loadModel({
      modelSrc: opts.modelSrc,
      ...(modelType ? { modelType } : {}),
      ...(modelConfig ? { modelConfig } : {}),
    } as any);
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

  try {
    const generationParams: any = {};
    if (opts.maxTokens) generationParams.predict = opts.maxTokens;
    if (opts.temperature != null) generationParams.temp = opts.temperature;
    if (opts.seed != null) generationParams.seed = opts.seed;

    const consumir = (async () => {
      let acumulado = '';
      const run = completion({
        modelId: modelo.modelId,
        stream: true,
        history: opts.history,
        ...(Object.keys(generationParams).length > 0 ? { generationParams } : {}),
      });
      for await (const ev of run.events) {
        if (ev.type === 'contentDelta' && ev.text) {
          acumulado += ev.text;
        }
      }
      return acumulado;
    })();

    // NOTA: setTimeout(() => { throw ... }) NO rechaza ninguna promesa (queda como
    // excepción no capturada); el timeout anterior nunca se disparaba de verdad.
    // withTimeout() sí rechaza correctamente esta promesa tras `timeout` ms.
    const texto = await withTimeout(consumir, timeout, 'Completion');

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
  }
}

// Prompt inicial en español: además de whisperConfig.language en la carga del
// modelo, esto ayuda a Whisper a mantenerse en el idioma/vocabulario correcto
// (útil para nombres de marcas y modalidades de equipos médicos).
const PROMPT_ES_POR_DEFECTO =
  'Observación de un equipo médico en un hospital: marca, modelo, modalidad y antigüedad.';

export async function transcribirAudio(
  modelo: LoadedModel,
  audioChunk: Buffer,
  opts: { timeout?: number; prompt?: string } = {}
): Promise<{ texto: string; ms: number }> {
  const t0 = performance.now();
  const timeout = opts.timeout ?? 30000;
  try {
    const texto = await withTimeout(
      transcribe({
        modelId: modelo.modelId,
        audioChunk,
        prompt: opts.prompt ?? PROMPT_ES_POR_DEFECTO,
      }),
      timeout,
      'Transcripción'
    );
    const ms = Math.round(performance.now() - t0);
    registrar({ stage: 'transcribe', model: modelo.etiqueta, status: 'ok', end_to_end_ms: ms });
    return { texto: texto.trim(), ms };
  } catch (e) {
    registrar({
      stage: 'transcribe',
      model: modelo.etiqueta,
      status: 'error',
      error: String(e),
      end_to_end_ms: Math.round(performance.now() - t0),
    });
    throw e;
  }
}

export async function extraerTextoImagen(
  modelo: LoadedModel,
  image: Buffer,
  opts: { timeout?: number } = {}
): Promise<{ texto: string; ms: number }> {
  const t0 = performance.now();
  const timeout = opts.timeout ?? 30000;
  try {
    const { blocks } = ocr({ modelId: modelo.modelId, image });
    const resultado = await withTimeout(blocks, timeout, 'OCR');
    const texto = resultado.map((b) => b.text).join('\n').trim();
    const ms = Math.round(performance.now() - t0);
    registrar({ stage: 'ocr', model: modelo.etiqueta, status: 'ok', end_to_end_ms: ms, blocks: resultado.length });
    return { texto, ms };
  } catch (e) {
    registrar({
      stage: 'ocr',
      model: modelo.etiqueta,
      status: 'error',
      error: String(e),
      end_to_end_ms: Math.round(performance.now() - t0),
    });
    throw e;
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, etiqueta: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const handle = setTimeout(() => reject(new Error(`${etiqueta} timeout after ${ms}ms`)), ms);
    promise.then(
      (v) => { clearTimeout(handle); resolve(v); },
      (e) => { clearTimeout(handle); reject(e); }
    );
  });
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
